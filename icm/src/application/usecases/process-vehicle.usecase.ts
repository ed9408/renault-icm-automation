import { Selectors, MenuNames } from '../../core/config/selectors.ts';
import { appConfig, buildVehicleUrl } from '../../core/config/app-config.ts';
import {
  ConnectionRefusedError,
  FrameNotFoundError,
  SectionCaptureError,
  SiteNotLoadedError,
} from '../../core/errors/domain-errors.ts';
import { formatError } from '../../core/errors/error-formatter.ts';
import { classifyError } from '../../core/errors/error-classifier.ts';
import { delay } from '../../core/utils/delay.ts';
import { runInSection } from '../../core/logger/section-scope.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { Frame, VehicleFrames } from '../../domain/models/frame-context.ts';
import type { VehicleContext, VehicleReport } from '../../domain/models/vehicle.ts';
import type { IBrowserSession } from '../../domain/ports/browser-session.interface.ts';
import type { IDomExtractor } from '../../domain/ports/dom-extractor.interface.ts';
import type { IFrameNavigator } from '../../domain/ports/frame-navigator.interface.ts';
import type { ISectionCapture } from './sections/section-capture.interface.ts';

/**
 * Orden en que el orquestador original visita las secciones del menú.
 * Determinístico → facilita reproducir errores y agregar nuevas secciones.
 */
export const SECTION_ORDER = [
  'details',
  'agreements',
  'maintains',
  'admin',
  'historic',
  'ots',
  'recmant',
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

/**
 * Orquesta la carga de un vehículo: navega al servlet, identifica frames,
 * ejecuta cada sección de captura, y devuelve el VehicleReport.
 */
export class ProcessVehicleUseCase {
  constructor(
    private readonly browser: IBrowserSession,
    private readonly navigator: IFrameNavigator,
    private readonly extractor: IDomExtractor,
    private readonly logger: ILogger,
    private readonly sections: Record<SectionKey, ISectionCapture>,
  ) {}

  /**
   * Equivalente al bloque `while(vin)` del `index.js` original,
   * desde el `page.goto(vin)` hasta `VehicleReport` listo para enviar.
   */
  async process(ctx: VehicleContext): Promise<VehicleReport> {
    await this.waitForSiteReady(ctx);

    this.logger.info('Navigating to vehicle', { vin: ctx.vin });
    const url = buildVehicleUrl(ctx.vin, ctx.km);
    const frames = await this.identifyFrames(url, ctx);

    const report: VehicleReport = {};

    const navAdapter = {
      gotoMenu: (selector: string | undefined) =>
        this.navigator.gotoMenu(frames.frameMenu, selector),
    };

    for (const key of SECTION_ORDER) {
      const section = this.sections[key];
      if (!section) continue;

      try {
        const chunk = await runInSection(section.key, () =>
          section.capture(frames, ctx, navAdapter),
        );
        if (chunk) (report as Record<string, unknown>)[section.key] = chunk;
      } catch (err) {
        // Envolvemos cualquier error en SectionCaptureError para diagnóstico,
        // pero NO abortamos el reporte: las demás secciones siguen siendo válidas.
        const wrapped = new SectionCaptureError(
          (err as Error).message || 'Error desconocido',
          section.key,
          { vin: ctx.vin, vehicleId: ctx.id, phase: `capture.${section.key}` },
          { cause: err as Error },
        );
        this.logger.error(formatError(wrapped));
        // seguimos con la siguiente sección
      }
    }

    return report;
  }

  /**
   * Espera a que el sitio cargue. Si detecta "Connexion à ICM refusée",
   * espera 5 minutos y reintenta. Si supera N intentos, lanza
   * `SiteNotLoadedError` con contexto accionable.
   */
  private async waitForSiteReady(ctx: VehicleContext): Promise<void> {
    const page = this.browser.getPage() as {
      waitForSelector(
        sel: string,
        opts: { timeout: number; waitUntil: 'load' },
      ): Promise<unknown>;
      content(): Promise<string>;
      goto(url: string): Promise<unknown>;
      url(): string;
    };

    const maxAttempts = 3;
    let attempt = 0;
    let html = '';

    while (true) {
      attempt++;
      try {
        await page.waitForSelector('html', {
          timeout: appConfig.timeouts.selectorWaitMs,
          waitUntil: 'load',
        });
        html = await page.content();
      } catch (err) {
        if (attempt >= maxAttempts) {
          const snippet = html ? html.slice(0, 500) : undefined;
          throw new SiteNotLoadedError(
            `No se pudo cargar el HTML base tras ${attempt} intentos`,
            {
              phase: 'waitForSiteReady',
              vin: ctx.vin,
              attempt,
              htmlSnippet: snippet,
            },
            { cause: err as Error },
          );
        }
        this.logger.warn('waitForSelector falló, reintentando', { attempt });
        await delay(2000);
        continue;
      }

      if (html.includes(Selectors.connectionRefusedMarker)) {
        if (attempt >= maxAttempts) {
          throw new ConnectionRefusedError(
            `El sitio ICM rechazó la conexión ${attempt} veces seguidas`,
            {
              phase: 'waitForSiteReady',
              vin: ctx.vin,
              attempt,
              url: safeUrl(page),
              htmlSnippet: html.slice(0, 500),
            },
          );
        }
        this.logger.warn('Connection refused, backing off', {
          attempt,
          ms: 1000 * 60 * 5,
        });
        await delay(1000 * 60 * 5);
        await page.goto('https://dcs.renault.com/icm3/jsp/ServletLogin');
        html = Selectors.connectionRefusedMarker; // forzar reintento
        continue;
      }

      // OK
      return;
    }
  }

  private async identifyFrames(
    gotoUrl: string,
    ctx: VehicleContext,
  ): Promise<VehicleFrames> {
    const page = this.browser.getPage() as {
      goto(url: string, opts?: { timeout?: number; waitUntil?: 'load' }): Promise<unknown>;
      waitForSelector(
        sel: string,
        opts: { timeout: number; waitUntil: 'load' },
      ): Promise<unknown>;
      frames(): Promise<Array<{ name(): string }>>;
      url(): string;
    };

    try {
      await delay(4000);
      await page.goto(gotoUrl, {
        timeout: appConfig.timeouts.navigationWaitMs,
        waitUntil: 'load',
      });
    } catch (err) {
      const classified = classifyError(err, {
        phase: 'identify.goto',
        vin: ctx.vin,
        url: gotoUrl,
      });
      this.logger.error(`page.goto falló: ${classified.type}`);
      throw classified.error;
    }
    await delay(1000);
    this.logger.info('Loading frames');

    // Esperar el frameset con retry-loop (antes era una espera infinita
    // con `timeout: 0` que dejaba el runner colgado sin notificar).
    await this.withSelectorRetry({
      label: 'identify.frames',
      selector: Selectors.frames.mainFrameset,
      timeoutMs: appConfig.timeouts.selectorWaitMs,
      maxAttempts: appConfig.timeouts.selectorRetryAttempts,
      backoffMs: appConfig.timeouts.selectorRetryBackoffMs,
      vin: ctx.vin,
      wait: async () =>
        page.waitForSelector(Selectors.frames.mainFrameset, {
          timeout: appConfig.timeouts.selectorWaitMs,
          waitUntil: 'load',
        }),
      buildError: (lastErr, attempts) =>
        new FrameNotFoundError(
          `No apareció el frameset "${Selectors.frames.mainFrameset}" tras ${attempts} intentos`,
          {
            phase: 'identify.frames',
            vin: ctx.vin,
            attempt: attempts,
            selector: Selectors.frames.mainFrameset,
            url: safeUrl(page),
            extra: { originalMessage: (lastErr as Error).message },
          },
          { cause: lastErr as Error },
        ),
    });
    this.logger.info('Main frameset loaded');

    // Tras navegar a la URL de buildVehicleUrl, abrir "Búsqueda vehículo".
    await this.clickVehicleSearch(page, ctx);

    const all = await page.frames();
    const frameBody = all.find((f) => f.name() === Selectors.frames.bodyName);
    const frameMenu = all.find((f) => f.name() === Selectors.frames.menuName);
    if (!frameBody || !frameMenu) {
      const found = all.map((f) => f.name()).join(', ');
      throw new FrameNotFoundError(
        `No se encontraron los frames requeridos (body/FrameMenu). Frames presentes: [${found}]`,
        {
          phase: 'identify.frames',
          vin: ctx.vin,
          url: safeUrl(page),
          extra: { expected: ['body', 'FrameMenu'], found },
        },
      );
    }

    await delay(3000);
    const menuItems = await this.navigator.calculateMenus(
      frameMenu as Frame,
      MenuNames,
    );

    this.logger.info('Frames loaded');
    return { frameBody: frameBody as Frame, frameMenu: frameMenu as Frame, menuItems };
  }

  /**
   * Se ejecuta tras navegar a la URL del VIN: el enlace "Búsqueda vehículo" vive
   * en el frame del menú, así que se busca allí (no en la página principal).
   */
  private async clickVehicleSearch(
    page: { frames(): Promise<Array<{ name(): string }>> },
    ctx: VehicleContext,
  ): Promise<void> {
    type MenuFrame = {
      waitForSelector(sel: string, opts: { timeout: number }): Promise<unknown>;
      click(sel: string): Promise<unknown>;
    };
    if (await this.isVehicleLoaded(page)) {
      this.logger.info('Vehículo ya cargado, se omite "Búsqueda vehículo"', {
        vin: ctx.vin,
      });
      return;
    }
    try {
      this.logger.info('Clicking "Búsqueda vehículo"', { vin: ctx.vin });
      // La página puede tardar en cargar: se reintenta (frame + selector).
      const menu = await this.withSelectorRetry<MenuFrame>({
        label: 'identify.vehicleSearch',
        selector: Selectors.vehicleSearchLink,
        timeoutMs: appConfig.timeouts.vehicleSearchWaitMs,
        maxAttempts: appConfig.timeouts.vehicleSearchAttempts,
        backoffMs: appConfig.timeouts.selectorRetryBackoffMs,
        vin: ctx.vin,
        wait: async () => {
          const frame = (await page.frames()).find(
            (f) => f.name() === Selectors.frames.menuName,
          ) as MenuFrame | undefined;
          if (!frame) throw new Error('Frame de menú no encontrado');
          await frame.waitForSelector(Selectors.vehicleSearchLink, {
            timeout: appConfig.timeouts.vehicleSearchWaitMs,
          });
          return frame;
        },
        buildError: (lastErr, attempts) =>
          new FrameNotFoundError(
            `No apareció "Búsqueda vehículo" en el menú tras ${attempts} intentos`,
            {
              phase: 'identify.vehicleSearch',
              vin: ctx.vin,
              attempt: attempts,
              selector: Selectors.vehicleSearchLink,
              extra: { originalMessage: (lastErr as Error).message },
            },
            { cause: lastErr as Error },
          ),
      });
      await menu.click(Selectors.vehicleSearchLink);
      await delay(3000);
    } catch (err) {
      this.logger.warn('No se pudo hacer clic en "Búsqueda vehículo"', {
        vin: ctx.vin,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Verifica si ya está la vista del vehículo: `#DivOts` en el frame body y el
   * enlace de la fila 10 en el frame del menú. Cualquier fallo se trata como
   * "no cargado" para que el flujo navegue a "Búsqueda vehículo".
   */
  private async isVehicleLoaded(page: {
    frames(): Promise<Array<{ name(): string }>>;
  }): Promise<boolean> {
    type QueryFrame = { $(sel: string): Promise<unknown> };
    try {
      const all = await page.frames();
      const body = all.find((f) => f.name() === Selectors.frames.bodyName) as
        | QueryFrame
        | undefined;
      const menu = all.find((f) => f.name() === Selectors.frames.menuName) as
        | QueryFrame
        | undefined;
      if (!body || !menu) return false;
      const [bodyEl, menuEl] = await Promise.all([
        body.$(Selectors.vehicleLoaded.bodyElement),
        menu.$(Selectors.vehicleLoaded.menuElement),
      ]);
      return Boolean(bodyEl && menuEl);
    } catch {
      return false;
    }
  }

  /**
   * Ejecuta `wait()` con un cap finito y, si falla, reintenta hasta
   * `maxAttempts` veces con `backoffMs` de espera entre intentos.
   *
   * Loguea cada intento y, si se agotan los intentos, lanza el error
   * producido por `buildError(lastErr, attempts)`.
   *
   * Esto evita que un selector del sitio (ej. `mainFrameset`) deje el
   * runner colgado indefinidamente sin notificar.
   */
  private async withSelectorRetry<T>(opts: {
    label: string;
    selector?: string;
    timeoutMs: number;
    maxAttempts: number;
    backoffMs: number;
    vin?: string;
    wait: () => Promise<T>;
    buildError: (lastErr: unknown, attempts: number) => Error;
  }): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      this.logger.info(
        `${opts.label}: intento ${attempt}/${opts.maxAttempts} (timeout ${opts.timeoutMs}ms)`,
        { phase: opts.label, attempt, selector: opts.selector, vin: opts.vin },
      );
      try {
        return await opts.wait();
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `${opts.label}: intento ${attempt}/${opts.maxAttempts} falló`,
          {
            phase: opts.label,
            attempt,
            selector: opts.selector,
            vin: opts.vin,
            error: (err as Error).message,
          },
        );
        if (attempt < opts.maxAttempts) {
          await delay(opts.backoffMs);
        }
      }
    }
    throw opts.buildError(lastErr, opts.maxAttempts);
  }
}

function safeUrl(page: { url?: () => string } | undefined): string | undefined {
  try {
    return page?.url?.();
  } catch {
    return undefined;
  }
}