import { Selectors } from '../../../core/config/selectors.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

/**
 * Sección "Detalles vehículo".
 * Captura HTML + valores estructurados del vehículo.
 */
export class CaptureDetailsSection implements ISectionCapture {
  readonly key = 'details';

  constructor(
    private readonly extractor: IDomExtractor,
    private readonly audit: IAuditLogger,
  ) {}

  async capture(
    frames: VehicleFrames,
    ctx: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null> {
    await nav.gotoMenu(frames.menuItems['Detalles vehículo']);
    this.audit.log(ctx.id, ctx.vin, 'Estoy esperando ingresar a los detalles');

    const html = await this.extractor.waitAndExtract(
      frames.frameBody,
      Selectors.details.titleSelector,
      3000,
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      'Voy a capturar el tipo de motor, de caja, la fecha de entrega y el tipo de vehiculo',
    );
    await new Promise((r) => setTimeout(r, 3000));

    const values = await this.extractor.extractAdminValues(
      frames.frameBody,
      Selectors.details.fields,
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      `Ya capture el tipo de motor (${values.tipo_mot}), de caja (${values.tipo_caja}), la fecha de entrega (${values.fecha_entrega}) y el tipo de vehiculo (${values.tipo_vh})`,
    );
    this.audit.log(ctx.id, ctx.vin, 'Ya ingrese a los detalles y capture su contenido');

    return { html, b64: stringToBase64(html), values };
  }
}