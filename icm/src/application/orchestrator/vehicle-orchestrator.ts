import { appConfig } from '../../core/config/app-config.ts';
import {
  ConfigError,
  IcmError,
  NoVinAvailableError,
  VinUnknownError,
} from '../../core/errors/domain-errors.ts';
import { classifyError } from '../../core/errors/error-classifier.ts';
import { formatError } from '../../core/errors/error-formatter.ts';
import { delay } from '../../core/utils/delay.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type {
  VehicleContext,
  VehicleReport,
} from '../../domain/models/vehicle.ts';
import type { IApiService } from '../../domain/ports/api-service.interface.ts';
import type { IAuditLogger } from '../../domain/ports/audit-logger.interface.ts';
import type { IBrowserSession } from '../../domain/ports/browser-session.interface.ts';
import type { IcmLoginUseCase } from '../usecases/icm-login.usecase.ts';
import type { Phase1AuthUseCase } from '../usecases/phase1-auth.usecase.ts';
import type { ProcessVehicleUseCase } from '../usecases/process-vehicle.usecase.ts';
import {
  buildEndpointUrl,
  maskedAuth,
  summarizeAuditActions,
  summarizeVehicleReport,
} from '../../infrastructure/api/payload-preview.ts';

export interface OrchestratorDeps {
  browser: IBrowserSession;
  phase1: Phase1AuthUseCase;
  icmLogin: IcmLoginUseCase;
  processVehicle: ProcessVehicleUseCase;
  api: IApiService;
  audit: IAuditLogger;
  logger: ILogger;
}

export interface OrchestratorOptions {
  /** Si true, NO envía datos al backend (modo dry-run). */
  dryRun?: boolean;
  /** Si true, errores fatales (ConfigError, etc.) abortan el loop. */
  failFast?: boolean;
}

/**
 * Loop principal del programa.
 * Replica el `while(1)` del `index.js` original con manejo de errores
 * controlado: tras una excepción cerramos la página (no el proceso)
 * y volvemos a empezar, salvo que sea un error fatal y `failFast=true`.
 *
 * Todos los errores se reportan con el `formatError()` que muestra
 * contexto (VIN, fase, sección) y sugerencias accionables.
 */
export class VehicleOrchestrator {
  constructor(
    private readonly deps: OrchestratorDeps,
    private readonly options: OrchestratorOptions = {},
  ) {}

  /**
   * Ejecuta un único ciclo: login + 1 vehículo (VIN fijo opcional).
   */
  async runOnce(initialVin?: string): Promise<void> {
    const { browser, phase1, icmLogin, processVehicle } = this.deps;

    try {
      const ctx = await this.resolveContext(initialVin);

      await browser.launch({
        url: appConfig.browser.loginUrl,
        fullscreen: appConfig.browser.fullscreen,
      });

      await phase1.confirmAccess();
      await phase1.selectIcmMod();
      await icmLogin.login();

      const report = await processVehicle.process(ctx);
      await this.dispatch(ctx, report);
      this.deps.logger.info('Single iteration done', { vin: ctx.vin });
    } catch (err) {
      this.handleError(err, { phase: 'runOnce', vin: initialVin });
      throw err; // runOnce deja que el caller decida
    }
  }

  /**
   * Loop infinito controlado.
   */
  async runForever(): Promise<void> {
    const { browser, phase1, icmLogin, processVehicle, logger } = this.deps;

    let iteration = 0;
    while (true) {
      iteration++;
      try {
        logger.info('Starting iteration', { iteration });
        await browser.launch({
          url: appConfig.browser.loginUrl,
          fullscreen: appConfig.browser.fullscreen,
        });
        await phase1.confirmAccess();
        await phase1.selectIcmMod();
        await icmLogin.login();
        await delay(1500);

        await this.processAllPending();
      } catch (err) {
        const classified = classifyError(err, {
          phase: 'runForever',
          extra: { iteration },
        });
        this.deps.logger.error(formatError(classified.error));

        if (this.options.failFast && !classified.retryable) {
          this.deps.logger.error(
            'failFast activado y error no reintentable: abortando',
            { type: classified.type },
          );
          try {
            await browser.close();
          } catch {
            /* ignore */
          }
          throw classified.error;
        }

        if (classified.error instanceof ConfigError) {
          this.deps.logger.error(
            'Error de configuración: el runner NO puede continuar. Abortando.',
          );
          try {
            await browser.close();
          } catch {
            /* ignore */
          }
          throw classified.error;
        }

        this.deps.logger.warn(
          'Error reintentable: continuando con la siguiente iteración',
          { type: classified.type, iteration },
        );
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
        // Pequeño backoff entre fallos
        await delay(2000);
      }
    }
  }

  private async processAllPending(): Promise<void> {
    const { logger } = this.deps;

    // Loop externo: consulta inicial + espera + re-consulta cuando la cola está vacía.
    // Solo termina por excepción (propagada al `runForever`).
    while (true) {
      let nextResp;
      try {
        nextResp = await this.fetchVinWithRetry('');
      } catch (err) {
        const classified = classifyError(err, { phase: 'fetchVin.poll' });
        logger.error(formatError(classified.error));
        throw classified.error;
      }

      if (nextResp.error || !nextResp.data) {
        // Cola vacía: NO cerramos el navegador. Esperamos `queueEmptyMs` y re-consultamos.
        // NO se re-autentica: la sesión sigue viva y re-autenticarse corrompería el estado
        // (navegaría a la URL de login sobre una página ya logueada y los selectores de
        // phase1/icmLogin no existirían, rompiendo la siguiente consulta del VIN).
        logger.info('Cola vacía: esperando antes de re-consultar el CRM', {
          ms: appConfig.timeouts.queueEmptyMs,
        });
        await delay(appConfig.timeouts.queueEmptyMs);
        continue;
      }

      // Hay VINes: procesar el batch directamente con la sesión viva.
      await this.processBatch(nextResp);
    }
  }

  /**
   * Procesa un batch de VINes a partir de la primera respuesta del CRM.
   * Termina cuando el CRM devuelve una respuesta vacía (cola agotada de esta tanda).
   * En ese punto, el loop externo decidirá si esperar y re-consultar.
   */
  private async processBatch(initialResponse: {
    data: NonNullable<Awaited<ReturnType<IApiService['getVin']>>['data']>;
  }): Promise<void> {
    const { api, processVehicle, logger } = this.deps;
    let nextResp = initialResponse;

    while (true) {
      const ctx: VehicleContext = {
        id: nextResp.data.lastId,
        vin: nextResp.data.vin,
        tipo: nextResp.data.tipo,
        km: nextResp.data.km,
      };

      logger.info('Processing vehicle', { vin: ctx.vin, id: ctx.id });
      const report = await processVehicle.process(ctx);
      await this.dispatch(ctx, report);

      const next = await api.getVin(ctx.id);
      if (next.error || !next.data) {
        logger.info('No more VINs in current batch', { lastId: ctx.id });
        return;
      }
      nextResp = next;
    }
  }

  private async resolveContext(
    initialVin: string | undefined,
  ): Promise<VehicleContext> {
    if (initialVin) {
      return { id: '', vin: initialVin, tipo: '', km: '1' };
    }
    const resp = await this.fetchVinWithRetry('');
    if (resp.error || !resp.data) {
      throw new NoVinAvailableError(
        'CRM no devolvió un VIN inicial',
        { phase: 'resolveContext' },
      );
    }
    return {
      id: resp.data.lastId,
      vin: resp.data.vin,
      tipo: resp.data.tipo,
      km: resp.data.km,
    };
  }

  private async fetchVinWithRetry(lastId: string) {
    const { api, logger } = this.deps;
    let resp = await api.getVin(lastId);
    let attempt = 0;
    while (resp.error) {
      attempt++;
      logger.warn('CRM fetch error, backing off', {
        attempt,
        ms: appConfig.timeouts.retryAfterErrorMs,
      });
      await delay(appConfig.timeouts.retryAfterErrorMs);
      resp = await api.getVin(lastId);
    }
    return resp;
  }

  private async dispatch(
    ctx: VehicleContext,
    report: VehicleReport,
  ): Promise<void> {
    const { api, audit, logger } = this.deps;
    if (this.options.dryRun) {
      logger.info('🔍 DRY-RUN: NO se enviará información al backend', {
        vin: ctx.vin,
      });
      logger.info('→ set_vin_data (preview)', {
        url: buildEndpointUrl(),
        auth: maskedAuth(),
        payload: {
          cmd: 'set_vin_data',
          id: ctx.id,
          vin: ctx.vin,
          tipo: ctx.tipo,
          km: ctx.km,
          data: summarizeVehicleReport(report),
        },
      });
      const auditEntries = audit.snapshot();
      if (auditEntries.length > 0) {
        logger.info('→ report_auditory (preview)', {
          url: buildEndpointUrl(),
          auth: maskedAuth(),
          payload: {
            cmd: 'report_auditory',
            count: auditEntries.length,
            actions: summarizeAuditActions(auditEntries),
          },
        });
      } else {
        logger.info('No audit entries to preview', { vin: ctx.vin });
      }
      return;
    }
    try {
      await api.sendData(ctx, report);
      logger.info('Data sent', { vin: ctx.vin });
    } catch (err) {
      const classified = classifyError(err, {
        phase: 'dispatch.sendData',
        vin: ctx.vin,
        vehicleId: ctx.id,
      });
      logger.error(formatError(classified.error));
      // Si el send falla, igual intentamos flushear auditoría para no perderla
    }
    try {
      const flushed = await audit.flush();
      logger.info('Audit flushed', { vin: ctx.vin, error: flushed.error });
    } catch (err) {
      const classified = classifyError(err, {
        phase: 'dispatch.flush',
        vin: ctx.vin,
      });
      logger.error(formatError(classified.error));
    }
  }

  private handleError(err: unknown, ctx: { phase: string; vin?: string }): void {
    if (err instanceof VinUnknownError) {
      // No es realmente un error operacional: solo informativo.
      this.deps.logger.warn(err.userMessage(), { vin: ctx.vin });
      return;
    }
    if (err instanceof IcmError) {
      this.deps.logger.error(formatError(err));
      return;
    }
    const classified = classifyError(err, ctx);
    this.deps.logger.error(formatError(classified.error));
  }
}