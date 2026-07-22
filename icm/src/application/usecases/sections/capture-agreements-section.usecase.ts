import { Selectors } from '../../../core/config/selectors.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

export class CaptureAgreementsSection implements ISectionCapture {
  readonly key = 'agreements';

  constructor(
    private readonly extractor: IDomExtractor,
    private readonly audit: IAuditLogger,
  ) {}

  async capture(
    frames: VehicleFrames,
    ctx: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null> {
    await nav.gotoMenu(frames.menuItems['Contratos y servicios']);
    this.audit.log(
      ctx.id,
      ctx.vin,
      'Estoy esperando ingresar a los contratos y servicios firmados',
    );

    const html = await this.extractor.waitAndExtract(
      frames.frameBody,
      Selectors.agreements.titleSelector,
      3000,
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      'Ya ingrese a los contratos y servicios firmados y capture su contenido',
    );
    return { html, b64: stringToBase64(html) };
  }
}