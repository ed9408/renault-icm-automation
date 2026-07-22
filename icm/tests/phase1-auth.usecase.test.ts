import { describe, expect, it, mock } from 'bun:test';
import { Phase1AuthUseCase } from '../src/application/usecases/phase1-auth.usecase.ts';
import type { IBrowserSession } from '../src/domain/ports/browser-session.interface.ts';
import type { IAutoItRunner } from '../src/domain/ports/autoit-runner.interface.ts';
import { ConsoleLogger } from '../src/core/logger/console-logger.ts';

function makeBrowser(): IBrowserSession {
  // Mockeamos el `page` UNA sola vez para que `expect` vea las llamadas.
  const keyboardPress = mock(async () => {});
  const waitForSelector = mock(async () => ({
    click: mock(async () => {}),
  }));

  const page = {
    keyboard: { press: keyboardPress },
    waitForSelector,
  };

  return {
    launch: mock(async () => ({ browser: {}, page })),
    close: mock(async () => {}),
    getPage: () => page,
    getBrowser: () => ({}),
    onDialog: () => {},
    onClose: () => {},
  };
}

function makeAutoIt(): IAutoItRunner {
  return {
    enter: mock(async () => {}),
    enterPassword: mock(async () => {}),
  };
}

describe('Phase1AuthUseCase', () => {
  it('confirmAccess presiona Enter', async () => {
    const browser = makeBrowser();
    const autoIt = makeAutoIt();
    const usecase = new Phase1AuthUseCase(browser, autoIt, new ConsoleLogger());

    await usecase.confirmAccess();

    const page = browser.getPage() as {
      keyboard: { press: ReturnType<typeof mock> };
    };
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  it('selectIcmMod hace click en el selector del módulo', async () => {
    const browser = makeBrowser();
    const autoIt = makeAutoIt();
    const usecase = new Phase1AuthUseCase(browser, autoIt, new ConsoleLogger());

    await usecase.selectIcmMod();

    const page = browser.getPage() as {
      waitForSelector: ReturnType<typeof mock>;
    };
    expect(page.waitForSelector).toHaveBeenCalled();
  });
});