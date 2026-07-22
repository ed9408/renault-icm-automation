import { Selectors } from '../../core/config/selectors.ts';
import { delay } from '../../core/utils/delay.ts';
import {
  AuthError,
  LoginButtonNotFoundError,
} from '../../core/errors/domain-errors.ts';
import { classifyError } from '../../core/errors/error-classifier.ts';
import { formatErrorInline } from '../../core/errors/error-formatter.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { IBrowserSession } from '../../domain/ports/browser-session.interface.ts';
import type { IAutoItRunner } from '../../domain/ports/autoit-runner.interface.ts';

/**
 * Cubre la fase 1 de autenticación: la pantalla inicial del
 * portal Renault (dcs.renault.com/rne_hpa2/home.jsp).
 *  - `confirmAccess`: presiona Enter sobre la página de login.
 *  - `selectIcmMod`: hace click en el enlace del módulo ICM.
 *
 * Cualquier excepción se clasifica, se reporta con contexto y se relanza
 * como un error tipado del dominio.
 */
export class Phase1AuthUseCase {
  constructor(
    private readonly browser: IBrowserSession,
    private readonly autoIt: IAutoItRunner,
    private readonly logger: ILogger,
  ) {}

  async confirmAccess(): Promise<void> {
    this.logger.info('Phase1: confirming access');
    try {
      await delay(1000);
      const page = this.browser.getPage() as {
        keyboard: { press(key: string): Promise<void> };
      };
      await page.keyboard.press('Enter');
      this.logger.info('Phase1: Enter pressed');
    } catch (err) {
      const classified = classifyError(err, { phase: 'phase1.confirmAccess' });
      this.logger.error(`Phase1 falló en confirmAccess: ${formatErrorInline(err)}`);
      throw classified.error;
    }
  }

  async selectIcmMod(): Promise<void> {
    this.logger.info('Phase1: selecting ICM module');
    try {
      const page = this.browser.getPage() as {
        waitForSelector(
          sel: string,
          opts: { timeout: number },
        ): Promise<{ click(): Promise<void> }>;
      };
      const icmSpan = await page.waitForSelector(Selectors.phase1.icmModuleSpan, {
        timeout: 0,
      });
      await delay(2000);
      await icmSpan.click();
      this.logger.info('Phase1: ICM module clicked');
    } catch (err) {
      // Si fue timeout del selector, lo envolvemos en LoginButtonNotFoundError
      // para que el reporte sugiera revisar selectores.
      const wrapped = new LoginButtonNotFoundError(
        `No se encontró el selector del módulo ICM: "${Selectors.phase1.icmModuleSpan}"`,
        {
          phase: 'phase1.selectIcmMod',
          selector: Selectors.phase1.icmModuleSpan,
        },
        { cause: err as Error },
      );
      this.logger.error(`Phase1 falló en selectIcmMod: ${formatErrorInline(wrapped)}`);
      throw wrapped;
    }
  }
}