import type { Browser, BrowserContext, Page } from '../models/frame-context.ts';

export interface BrowserLaunchOptions {
  /** URL inicial a cargar. */
  url: string;
  /** Si true, agrega `--start-fullscreen` a Chromium. */
  fullscreen: boolean;
  /**
   * Si true y ya existe una página viva, reusa la página existente
   * navegando a `url` en lugar de lanzar un Chromium nuevo.
   * Útil para re-autenticar tras una espera prolongada (cola vacía).
   * Si no hay página viva, el comportamiento es equivalente a `false`.
   */
  reuse?: boolean;
}

export type DialogMessageHandler = (message: string) => Promise<'accept' | 'dismiss'>;
export type PageCloseHandler = () => void | Promise<void>;

/**
 * Manejador de la sesión del navegador.
 * Encapsula el ciclo de vida (launch/close) y los eventos de Puppeteer.
 */
export interface IBrowserSession {
  /** Lanza el navegador y carga la URL. */
  launch(options: BrowserLaunchOptions): Promise<BrowserContext>;

  /** Cierra la página actual (no mata el proceso de Chrome). */
  close(): Promise<void>;

  /** Acceso a la página/frame actual (útil para casos de uso). */
  getPage(): Page;

  /** Acceso al browser. */
  getBrowser(): Browser;

  /** Registra un handler para diálogos del navegador. */
  onDialog(handler: DialogMessageHandler): void;

  /** Registra un handler para el cierre de página. */
  onClose(handler: PageCloseHandler): void;
}