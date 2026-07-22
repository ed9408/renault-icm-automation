import { Selectors } from '../../core/config/selectors.ts';
import { appConfig } from '../../core/config/app-config.ts';
import { delay } from '../../core/utils/delay.ts';
import {
  AuthError,
  LoginButtonNotFoundError,
  ScriptExecutionError,
} from '../../core/errors/domain-errors.ts';
import { classifyError } from '../../core/errors/error-classifier.ts';
import { formatErrorInline } from '../../core/errors/error-formatter.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { IBrowserSession } from '../../domain/ports/browser-session.interface.ts';
import type { IAutoItRunner } from '../../domain/ports/autoit-runner.interface.ts';

/**
 * Login dentro del portal ICM propiamente dicho.
 *  - Espera navegación.
 *  - Click en el botón de acceso (#form20).
 *  - Invoca `AU_Enter` para enviar Enter al diálogo del token.
 *  - Click en el botón de validación final.
 *
 * Los errores se clasifican y se reportan con contexto (fase + selector)
 * para diagnóstico rápido.
 */
export class IcmLoginUseCase {
  constructor(
    private readonly browser: IBrowserSession,
    private readonly autoIt: IAutoItRunner,
    private readonly logger: ILogger,
  ) {}

  async login(): Promise<void> {
    this.logger.info('ICM: login started');
    try {
      const page = this.browser.getPage() as {
        waitForNavigation(opts: { timeout: number; waitUntil: 'load' }): Promise<unknown>;
        waitForSelector(
          sel: string,
          opts: { waitUntil: 'load'; timeout: number },
        ): Promise<{ click(): Promise<void> }>;
      };

      await page.waitForNavigation({
        timeout: appConfig.timeouts.navigationWaitMs,
        waitUntil: 'load',
      });
      this.logger.info('ICM: initial navigation loaded');

      try {
        const btnAccess = await page.waitForSelector(
          Selectors.icmLogin.accessButton,
          {
            waitUntil: 'load',
            timeout: appConfig.timeouts.loginSelectorWaitMs,
          },
        );
        await delay(1000);
        await btnAccess.click();
        this.logger.info('ICM: access button clicked');
      } catch (err) {
        throw new LoginButtonNotFoundError(
          `No se encontró el botón de acceso ICM: "${Selectors.icmLogin.accessButton}"`,
          {
            phase: 'login.accessButton',
            selector: Selectors.icmLogin.accessButton,
          },
          { cause: err as Error },
        );
      }

      await delay(2000);
      try {
        await this.autoIt.enter();
        this.logger.info('ICM: AutoIt enter executed');
      } catch (err) {
        if (err instanceof ScriptExecutionError) throw err;
        throw new ScriptExecutionError(
          'Falló el envío del Enter al diálogo del token',
          '(unknown)',
          (err as Error).message,
          { phase: 'login.autoIt.enter' },
          { cause: err as Error },
        );
      }

      try {
        const validateBtn = await page.waitForSelector(
          Selectors.icmLogin.validateButton,
          {
            timeout: appConfig.timeouts.loginSelectorWaitMs,
            waitUntil: 'load',
          },
        );
        await delay(1000);
        await validateBtn.click();
        this.logger.info('ICM: validate button clicked');
      } catch (err) {
        throw new LoginButtonNotFoundError(
          `No se encontró el botón de validación ICM: "${Selectors.icmLogin.validateButton}"`,
          {
            phase: 'login.validateButton',
            selector: Selectors.icmLogin.validateButton,
          },
          { cause: err as Error },
        );
      }
    } catch (err) {
      if (err instanceof AuthError) {
        this.logger.error(`ICM login falló: ${formatErrorInline(err)}`);
        throw err;
      }
      const classified = classifyError(err, { phase: 'login' });
      this.logger.error(`ICM login falló: ${formatErrorInline(err)}`);
      throw classified.error;
    }
  }
}