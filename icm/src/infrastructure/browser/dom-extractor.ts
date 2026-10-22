import type { Frame as PuppeteerFrame } from 'puppeteer';

import { appConfig } from '../../core/config/app-config.ts';
import {
  SelectorTimeoutError,
  type ErrorContext,
} from '../../core/errors/domain-errors.ts';
import { writeHtmlDumpToDisk } from '../../core/utils/error-html-dumper.ts';
import { delay } from '../../core/utils/delay.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import { DEFAULT_ADMIN_VALUES, type AdminValues } from '../../domain/models/vehicle.ts';
import type { Frame } from '../../domain/models/frame-context.ts';
import type {
  ExtractionPlan,
  IDomExtractor,
} from '../../domain/ports/dom-extractor.interface.ts';

/**
 * Implementación de IDomExtractor sobre Puppeteer.
 *
 * Encapsula:
 *   - `frame.content()` → HTML crudo
 *   - `frame.evaluate` → extracción de valores por selector
 *   - `frame.waitForSelector` con timeout finito configurable
 *
 * Los errores de timeout se traducen a `SelectorTimeoutError` con el
 * selector que falló, el HTML actual (snippet) y la ruta del dump
 * completo a disco (si `appConfig.debug.dumpHtmlOnError === true`).
 * Esto evita que un selector que no aparece deje el runner
 * estancado sin notificar.
 */
export class PuppeteerDomExtractor implements IDomExtractor {
  constructor(private readonly logger: ILogger) {}

  async extractHtml(frame: Frame): Promise<string> {
    return (frame as PuppeteerFrame).content();
  }

  async waitAndExtract(
    frame: Frame,
    selector: string,
    waitMs: number,
  ): Promise<string> {
    await this.safeWaitForSelector(frame, selector, appConfig.timeouts.selectorWaitMs, {
      phase: 'waitAndExtract',
      selector,
    });
    await delay(waitMs);
    return this.extractHtml(frame);
  }

  async safeWaitForSelector(
    frame: Frame,
    selector: string,
    timeoutMs: number,
    context: Partial<ErrorContext> = {},
  ): Promise<void> {
    const t0 = Date.now();
    const progressMs = appConfig.timeouts.logWaitProgressMs;
    const isMainFrame = (frame as { isMainFrame?(): boolean }).isMainFrame?.() ?? false;

    this.logger.debug(
      `Esperando selector "${selector}" (timeout ${timeoutMs}ms, isMainFrame=${isMainFrame})`,
      { selector, timeoutMs, phase: context.phase, vin: context.vin },
    );

    // Aviso periódico (WARN) mientras la espera está activa, para evitar
    // que el operador piense que el proceso está congelado.
    const stopFlag = { stopped: false };
    const progressTimer = progressMs > 0 ? setInterval(() => {
      if (stopFlag.stopped) return;
      const elapsed = Date.now() - t0;
      this.logger.warn(
        `El selector "${selector}" aún no aparece (${elapsed}ms/${timeoutMs}ms)`,
        { selector, elapsedMs: elapsed, timeoutMs, phase: context.phase, vin: context.vin },
      );
    }, progressMs) : null;

    try {
      await (frame as PuppeteerFrame).waitForSelector(selector, { timeout: timeoutMs });
      const elapsed = Date.now() - t0;
      if (elapsed > 3000) {
        this.logger.debug(
          `Selector "${selector}" apareció tras ${elapsed}ms`,
          { selector, elapsedMs: elapsed, phase: context.phase, vin: context.vin },
        );
      }
    } catch (err) {
      const elapsed = Date.now() - t0;
      const htmlSnippet = await this.safeHtmlSnippet(frame);

      // Volcado HTML a disco para diagnóstico post-mortem.
      const dump = await writeHtmlDumpToDisk(
        htmlSnippet,
        frame,
        { ...context, selector },
        { enabled: appConfig.debug.dumpHtmlOnError, dir: appConfig.debug.dumpDir },
        this.logger,
      );

      const dumpInfo = dump
        ? `HTML dump: ${dump.path} (${dump.bytes} bytes)`
        : 'HTML dump no disponible';

      this.logger.error(
        `Timeout esperando selector "${selector}" tras ${elapsed}ms (cap=${timeoutMs}ms). ${dumpInfo}`,
        {
          selector,
          elapsedMs: elapsed,
          timeoutMs,
          phase: context.phase,
          vin: context.vin,
          vehicleId: context.vehicleId,
          htmlDumpPath: dump?.path,
        },
      );

      throw new SelectorTimeoutError(
        `Timeout esperando selector "${selector}" tras ${elapsed}ms`,
        {
          selector,
          phase: context.phase ?? 'capture',
          vin: context.vin,
          vehicleId: context.vehicleId,
          htmlSnippet,
          extra: {
            originalMessage: (err as Error).message,
            elapsedMs: elapsed,
            timeoutMs,
            htmlDumpPath: dump?.path,
          },
        },
        { cause: err as Error },
      );
    } finally {
      stopFlag.stopped = true;
      if (progressTimer !== null) clearInterval(progressTimer);
    }
  }

  async extractValues<T extends Record<string, string>>(
    frame: Frame,
    plan: ExtractionPlan<T>,
  ): Promise<T> {
    const result = (await (
      frame as PuppeteerFrame
    ).evaluate((planObj: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [key, selector] of Object.entries(planObj)) {
        const el = document.querySelector(selector) as
          | HTMLInputElement
          | HTMLElement
          | null;
        if (!el) {
          out[key] = '-';
          continue;
        }
        if ('value' in el && (el as HTMLInputElement).value !== undefined) {
          out[key] = (el as HTMLInputElement).value;
        } else {
          out[key] = (el as HTMLElement).innerHTML;
        }
      }
      return out;
    }, plan as Record<string, string>)) as Record<string, string>;

    return result as unknown as T;
  }

  async waitForAny(
    frame: Frame,
    selectors: string[],
    timeoutMs: number,
  ): Promise<string | null> {
    for (const selector of selectors) {
      try {
        await (frame as PuppeteerFrame).waitForSelector(selector, {
          timeout: timeoutMs,
        });
        return selector;
      } catch {
        // probar siguiente
      }
    }
    return null;
  }

  async extractAdminValues(
    frame: Frame,
    plan: ExtractionPlan<AdminValues>,
  ): Promise<AdminValues> {
    const raw = await this.extractValues<Record<string, string>>(frame, plan);
    const merged: AdminValues = {
      tipo_vh: raw['tipo_vh'] ?? DEFAULT_ADMIN_VALUES.tipo_vh,
      tipo_mot: raw['tipo_mot'] ?? DEFAULT_ADMIN_VALUES.tipo_mot,
      tipo_caja: raw['tipo_caja'] ?? DEFAULT_ADMIN_VALUES.tipo_caja,
      num_fab: raw['num_fab'] ?? DEFAULT_ADMIN_VALUES.tipo_caja,
      fecha_entrega:
        raw['fecha_entrega'] ?? DEFAULT_ADMIN_VALUES.fecha_entrega,
    };
    merged.fecha_entrega = merged.fecha_entrega.replace(/\./g, '-');
    return merged;
  }

  async clickAndDismissDialog(
    frame: Frame,
    selector: string,
    timeoutMs: number = 30000,
  ): Promise<boolean> {
    const puppeteerFrame = frame as PuppeteerFrame;
    const page = puppeteerFrame.page();

    try {
      await puppeteerFrame.waitForSelector(selector, { timeout: timeoutMs });
    } catch {
      this.logger.warn(
        `El selector "${selector}" no apareció dentro de ${timeoutMs}ms para hacer clic`,
      );
      return false;
    }

    const element = await puppeteerFrame.$(selector);
    if (!element) {
      this.logger.warn(`No se pudo obtener el elemento con selector "${selector}"`);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const finish = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          page.off('dialog', dialogListener);
          resolve(result);
        }
      };

      const dialogListener = async (dialog: {
        type(): string;
        message(): string;
        dismiss(): Promise<void>;
      }) => {
        try {
          this.logger.info(
            `Diálogo de navegador interceptado (${dialog.type()}): "${dialog.message()}". Cancelando...`,
          );
          await dialog.dismiss();
        } catch {
          // Si ya fue descartado por el manejador global del navegador, no es error
        } finally {
          finish(true);
        }
      };

      page.on('dialog', dialogListener);

      const timer = setTimeout(() => {
        this.logger.warn(
          `Timeout esperando la alerta del navegador tras hacer clic en "${selector}"`,
        );
        finish(true);
      }, timeoutMs);

      element.click().catch((err) => {
        this.logger.error('Error al hacer clic en el botón', {
          error: (err as Error).message,
          selector,
        });
        finish(false);
      });
    });
  }

  private async safeHtmlSnippet(frame: Frame): Promise<string | undefined> {
    try {
      const html = await this.extractHtml(frame);
      return html.slice(0, 500);
    } catch {
      return undefined;
    }
  }
}