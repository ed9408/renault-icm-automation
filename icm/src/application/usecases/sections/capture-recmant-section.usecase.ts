import { Selectors } from '../../../core/config/selectors.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import type { ILogger } from '../../../core/logger/logger.interface.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

export class CaptureRecmantSection implements ISectionCapture {
  readonly key = 'recmant';

  constructor(
    private readonly extractor: IDomExtractor,
    private readonly audit: IAuditLogger,
    private readonly logger: ILogger,
  ) {}

  async capture(
    frames: VehicleFrames,
    ctx: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null> {
    const selector = frames.menuItems['Recomendación de mantenimiento'];
    if (!selector) {
      this.logger.debug('RecMant not available for vehicle');
      return null;
    }
    await nav.gotoMenu(selector);
    this.logger.debug('Sent auditory for recmant');
    this.audit.log(
      ctx.id,
      ctx.vin,
      'Estoy esperando ingresar a Recomendacion de Mantenimiento',
    );

    const html = await this.extractor.waitAndExtract(
      frames.frameBody,
      Selectors.recmant.titleSelector,
      3000,
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      'Ya ingrese a Recomendacion de Mantenimiento y capture su contenido',
    );
    return { html, b64: stringToBase64(html) };
  }
}