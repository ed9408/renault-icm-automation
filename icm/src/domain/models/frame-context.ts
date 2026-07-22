/**
 * Frame / página de Puppeteer.
 * Se importa como `unknown` para evitar que domain/ dependa de puppeteer.
 * Las clases de infrastructure (Puppeteer*) hacen el cast a sus tipos reales.
 */

export type Browser = unknown;
export type Page = unknown;
export type Frame = unknown;

/** Estructura mínima con la que los use cases interactúan con el navegador. */
export interface BrowserContext {
  browser: Browser;
  page: Page;
}

/**
 * Estado de los frames de un vehículo ya cargado.
 * `frameBody` y `frameMenu` son frames de Puppeteer (tipados unknown).
 */
export interface VehicleFrames {
  frameBody: Frame;
  frameMenu: Frame;
  /** Mapa nombre de menú → selector CSS calculado por `calculate_menus`. */
  menuItems: Record<string, string>;
}