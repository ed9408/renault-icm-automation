import puppeteer from 'puppeteer';
import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';

import { appConfig } from '../../core/config/app-config.ts';
import { delay } from '../../core/utils/delay.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { BrowserContext } from '../../domain/models/frame-context.ts';
import type {
  BrowserLaunchOptions,
  DialogMessageHandler,
  IBrowserSession,
  PageCloseHandler,
} from '../../domain/ports/browser-session.interface.ts';
import type { IAutoItRunner } from '../../domain/ports/autoit-runner.interface.ts';

/**
 * Implementación de IBrowserSession sobre Puppeteer.
 * Replica el flujo de `puppeteer_core.mjs` Run/Kill:
 *   - Lanza Chromium no-headless en fullscreen.
 *   - Reusa la página por defecto.
 *   - Registra handlers de `dialog` y `close`.
 *   - Programa `AU_Enter_password` después de 5s.
 */
export class PuppeteerBrowserSession implements IBrowserSession {
  private browser: PuppeteerBrowser | null = null;
  private page: PuppeteerPage | null = null;
  /** Handle del timer de `autoIt.enterPassword()` para evitar apilar timers en re-launches. */
  private passwordTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly dialogHandlers: DialogMessageHandler[] = [];
  private readonly closeHandlers: PageCloseHandler[] = [];

  constructor(
    private readonly logger: ILogger,
    private readonly autoIt: IAutoItRunner,
  ) {}

  async launch(options: BrowserLaunchOptions): Promise<BrowserContext> {
    // Reutilizar la página existente (mismo Chromium) si se solicita y la página sigue viva.
    if (options.reuse && this.page && !this.page.isClosed()) {
      this.logger.info('Reusing existing browser page', { url: options.url });
      const page = this.page;

      // Limpia listeners previos para evitar acumulación en re-navegaciones.
      page.removeAllListeners('dialog');
      page.removeAllListeners('close');
      page.on('dialog', (dialog) => this.handleDialog(dialog));
      page.on('close', () => this.handleClose());

      // Re-programa el timer de password (cancela el previo si estuviera pendiente).
      this.schedulePasswordScript();

      await page.setViewport({
        width: appConfig.browser.viewport.width,
        height: appConfig.browser.viewport.height,
      });

      await delay(1000);
      await page.goto(options.url);

      this.logger.info('Browser page reused');
      return { browser: this.browser!, page };
    }

    this.logger.info('Launching browser', { url: options.url });

    const args = [
      '--ignore-certificate-errors',
      '--disable-client-side-phishing-detection',
      '--enable-features=AllowCertificateUserSelection',
    ];
    if (options.fullscreen) {
      args.push('--start-fullscreen');
    }

    this.browser = await puppeteer.launch({
      headless: false,
      timeout: 0,
      args,
    });

    const pages = await this.browser.pages();
    const page = pages[0];
    if (!page) throw new Error('No default page returned by Puppeteer');
    this.page = page;

    this.schedulePasswordScript();

    page.on('dialog', (dialog) => this.handleDialog(dialog));
    page.on('close', () => this.handleClose());

    await page.setViewport({
      width: appConfig.browser.viewport.width,
      height: appConfig.browser.viewport.height,
    });

    await delay(1000);
    await page.goto(options.url);

    this.logger.info('Browser launched');
    return { browser: this.browser!, page };
  }

  async close(): Promise<void> {
    // Cancela el timer pendiente para que no dispare contra un browser ya cerrado.
    if (this.passwordTimer) {
      clearTimeout(this.passwordTimer);
      this.passwordTimer = null;
    }

    const results = await Promise.allSettled([
      this.page && !this.page.isClosed() ? this.page.close() : Promise.resolve(),
      this.browser && this.browser.connected
        ? this.browser.close()
        : Promise.resolve(),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.warn('Browser close partial failure', {
          error: (r.reason as Error)?.message,
        });
      }
    }

    // Reset para que el próximo `launch()` arranque desde cero.
    this.page = null;
    this.browser = null;
  }

  private schedulePasswordScript(): void {
    if (this.passwordTimer) {
      clearTimeout(this.passwordTimer);
      this.passwordTimer = null;
    }
    this.passwordTimer = setTimeout(() => {
      this.passwordTimer = null;
      void (async () => {
        this.logger.info('Triggering scheduled password script');
        await delay(1500);
        await this.autoIt.enterPassword();
        await this.autoIt.enter();
      })();
    }, appConfig.browser.passwordScriptDelayMs);
  }

  getPage(): PuppeteerPage {
    if (!this.page) throw new Error('Browser not launched');
    return this.page;
  }

  getBrowser(): PuppeteerBrowser {
    if (!this.browser) throw new Error('Browser not launched');
    return this.browser;
  }

  onDialog(handler: DialogMessageHandler): void {
    this.dialogHandlers.push(handler);
  }

  onClose(handler: PageCloseHandler): void {
    this.closeHandlers.push(handler);
  }

  private async handleDialog(dialog: {
    message(): string;
    accept(): Promise<void>;
    dismiss(): Promise<void>;
  }): Promise<void> {
    const message = dialog.message();

    for (const handler of this.dialogHandlers) {
      try {
        const action = await handler(message);
        if (action === 'accept') await dialog.accept();
        else await dialog.dismiss();
        return;
      } catch (err) {
        this.logger.error('Dialog handler failed', {
          error: (err as Error).message,
          message,
        });
      }
    }

    // Si nadie respondió, dismiss por defecto.
    await dialog.dismiss();
  }

  private handleClose(): void {
    this.logger.warn('Page closed');
    for (const handler of this.closeHandlers) {
      void handler();
    }
  }
}