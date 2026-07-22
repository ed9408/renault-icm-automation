import { Selectors } from '../../../core/config/selectors.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import type { ILogger } from '../../../core/logger/logger.interface.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

export class CaptureOtsSection implements ISectionCapture {
  readonly key = 'ots';

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
    const selector = frames.menuItems['OTS a realizar'];
    if (!selector) {
      this.logger.debug('OTS not available for vehicle');
      return null;
    }
    await nav.gotoMenu(selector);
    this.audit.log(ctx.id, ctx.vin, 'Estoy esperando ingresar a los OTS');

    const html = await this.extractor.waitAndExtract(
      frames.frameBody,
      Selectors.ots.titleSelector,
      3000,
    );

    this.audit.log(ctx.id, ctx.vin, 'Ya ingrese a los OTS y capture su contenido');
    return { html, b64: stringToBase64(html) };
  }
}