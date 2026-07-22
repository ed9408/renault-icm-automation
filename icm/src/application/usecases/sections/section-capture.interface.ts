import type { HtmlChunk, VehicleContext } from '../../../domain/models/vehicle.ts';
import type { VehicleFrames } from '../../../domain/models/frame-context.ts';

/**
 * Contrato común para todas las secciones del menú ICM.
 * Implementar ISP: cada sección conoce solo sus selectores y reglas;
 * el orquestador las invoca polimórficamente.
 */
export interface ISectionCapture {
  /** Nombre canónico usado en `VehicleReport` y `Send_Data`. */
  readonly key: string;

  /**
   * Ejecuta la captura. Devuelve `null` si la sección no existe
   * para este vehículo (p.ej. no hay "OTS a realizar").
   */
  capture(
    frames: VehicleFrames,
    context: VehicleContext,
    nav: { gotoMenu(selector: string | undefined): Promise<void> },
  ): Promise<HtmlChunk | null>;
}