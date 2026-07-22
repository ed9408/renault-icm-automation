import { Selectors, MenuNames } from '../../core/config/selectors.ts';
import { buildVehicleUrl } from '../../core/config/app-config.ts';
import {
  ConnectionRefusedError,
  FrameNotFoundError,
  SectionCaptureError,
  SiteNotLoadedError,
} from '../../core/errors/domain-errors.ts';
import { formatError } from '../../core/errors/error-formatter.ts';
import { classifyError } from '../../core/errors/error-classifier.ts';
import { delay } from '../../core/utils/delay.ts';
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
  'historic',
  'agreements',
  'maintains',
  'admin',
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
        const chunk = await section.capture(frames, ctx, navAdapter);
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
        await page.waitForSelector('html', { timeout: 0, waitUntil: 'load' });
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
      await page.goto(gotoUrl, { timeout: 0, waitUntil: 'load' });
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
    await page.waitForSelector(Selectors.frames.mainFrameset, {
      timeout: 0,
      waitUntil: 'load',
    });
    this.logger.info('Main frameset loaded');

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
}

function safeUrl(page: { url?: () => string } | undefined): string | undefined {
  try {
    return page?.url?.();
  } catch {
    return undefined;
  }
}