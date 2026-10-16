import { Selectors } from '../../../core/config/selectors.ts';
import { appConfig } from '../../../core/config/app-config.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import { delay } from '../../../core/utils/delay.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

export class CaptureHistoricSection implements ISectionCapture {
  readonly key = 'historic';

  constructor(
    private readonly extractor: IDomExtractor,
    private readonly audit: IAuditLogger,
  ) {}

  async capture(
    frames: VehicleFrames,
    ctx: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null> {
    this.audit.log(ctx.id, ctx.vin, 'Estoy esperando ingresar al historico');

    // La cancelación de la alerta en Administrativo redirige automáticamente a Histórico.
    // Si tras una breve espera el título no aparece, usamos gotoMenu como respaldo.
    const titleReady = await this.extractor.waitForAny(
      frames.frameBody,
      [Selectors.historic.titleSelector],
      5000,
    );

    if (!titleReady && frames.menuItems['Histórico']) {
      await nav.gotoMenu(frames.menuItems['Histórico']);
    }

    await this.extractor.waitAndExtract(
      frames.frameBody,
      Selectors.historic.titleSelector,
      3500,
    );

    // Botón "Más" para expandir el histórico
    const moreBtn = await (
      frames.frameBody as {
        $(
          sel: string,
          opts: { timeout: number; waitUntil: 'visible' },
        ): Promise<{ click(): Promise<void> } | null>;
      }
    ).$(Selectors.historic.moreButton, {
      timeout: appConfig.timeouts.selectorWaitMs,
      waitUntil: 'visible',
    });

    if (moreBtn) await moreBtn.click();
    await delay(1500);

    const html = await this.extractor.extractHtml(frames.frameBody);
    this.audit.log(ctx.id, ctx.vin, 'Ya ingrese al historico y capture su contenido');
    return { html, b64: stringToBase64(html) };
  }
}