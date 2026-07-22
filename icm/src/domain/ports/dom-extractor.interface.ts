import type { AdminValues } from '../models/vehicle.ts';
import type { Frame } from '../models/frame-context.ts';

/**
 * Plan de extracción para una sección: nombre del campo → selector CSS.
 * Las secciones declaran qué necesitan; el extractor concreto (Puppeteer)
 * se encarga de ejecutarlo contra el DOM.
 */
export type ExtractionPlan<T> = {
  [K in keyof T]?: string;
};

export interface IDomExtractor {
  /** Devuelve el HTML completo del frame. */
  extractHtml(frame: Frame): Promise<string>;

  /** Espera un selector hasta que esté visible y devuelve el HTML. */
  waitAndExtract(
    frame: Frame,
    selector: string,
    waitMs: number,
  ): Promise<string>;

  /**
   * Evalúa `document.querySelector` por cada selector del plan
   * y devuelve un objeto con los valores leídos.
   */
  extractValues<T extends Record<string, string>>(
    frame: Frame,
    plan: ExtractionPlan<T>,
  ): Promise<T>;

  /** Espera uno de varios selectores (el primero que aparezca gana). */
  waitForAny(frame: Frame, selectors: string[], timeoutMs: number): Promise<string | null>;

  /** Helper: extrae AdminValues a partir del plan admin. */
  extractAdminValues(frame: Frame, plan: ExtractionPlan<AdminValues>): Promise<AdminValues>;
}