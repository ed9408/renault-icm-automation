import { Selectors } from '../../../core/config/selectors.ts';
import { stringToBase64 } from '../../../core/utils/base64.ts';
import { appConfig } from '../../../core/config/app-config.ts';
import { delay } from '../../../core/utils/delay.ts';
import type { IAuditLogger } from '../../../domain/ports/audit-logger.interface.ts';
import type { IDomExtractor } from '../../../domain/ports/dom-extractor.interface.ts';
import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';
import type { ISectionCapture } from './section-capture.interface.ts';

export class CaptureAdminSection implements ISectionCapture {
  readonly key = 'admin';

  constructor(
    private readonly extractor: IDomExtractor,
    private readonly audit: IAuditLogger,
  ) {}

  async capture(
    frames: VehicleFrames,
    ctx: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null> {
    await nav.gotoMenu(frames.menuItems['administrativa']);
    this.audit.log(ctx.id, ctx.vin, 'Estoy esperando ingresar al administrativo');

    const matched = await this.extractor.waitForAny(
      frames.frameBody,
      [
        Selectors.admin.primaryTitleSelector,
        ...Selectors.admin.alternates,
      ],
      10000,
    );

    if (!matched) {
      this.audit.log(
        ctx.id,
        ctx.vin,
        'No se encontró el selector esperado en administrativa',
      );
      return null;
    }

    await delay(appConfig.timeouts.sectionWaitMs + 2000);
    const html = await this.extractor.extractHtml(frames.frameBody);

    this.audit.log(
      ctx.id,
      ctx.vin,
      'Voy a capturar el tipo de motor, de caja, la fecha de entrega y el tipo de vehiculo',
    );
    await delay(3000);

    const values = await this.extractor.extractAdminValues(
      frames.frameBody,
      Selectors.admin.fields,
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      `Ya capture el tipo de motor (${values.tipo_mot}), de caja (${values.tipo_caja}) y la fecha de entrega (${values.fecha_entrega})`,
    );
    this.audit.log(
      ctx.id,
      ctx.vin,
      'Ya ingrese al administrativo y capture su contenido',
    );

    this.audit.log(
      ctx.id,
      ctx.vin,
      'Haciendo clic en botón de acción administrativo',
    );

    const dialogHandled = await this.extractor.clickAndDismissDialog(
      frames.frameBody,
      Selectors.admin.actionButton,
      appConfig.timeouts.selectorWaitMs,
    );

    if (dialogHandled) {
      this.audit.log(
        ctx.id,
        ctx.vin,
        'Alerta confirmada/cancelada correctamente',
      );
    } else {
      this.audit.log(
        ctx.id,
        ctx.vin,
        'No se pudo interactuar con el botón de acción administrativo o no apareció la alerta',
      );
    }

    return { html, b64: stringToBase64(html), values };
  }
}