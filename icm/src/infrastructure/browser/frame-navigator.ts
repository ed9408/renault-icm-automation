import type { Frame as PuppeteerFrame } from 'puppeteer';

import { Selectors } from '../../core/config/selectors.ts';
import type { ILogger } from '../../core/logger/logger.interface.ts';
import type { Frame } from '../../domain/models/frame-context.ts';
import type {
  IFrameNavigator,
  MenuItemsMap,
} from '../../domain/ports/frame-navigator.interface.ts';

/**
 * Implementación de IFrameNavigator sobre Puppeteer.
 * - `calculate_menus` replica la lógica de `helppers.mjs`.
 * - `gotoMenu` hace click en el selector calculado.
 */
export class PuppeteerFrameNavigator implements IFrameNavigator {
  constructor(private readonly logger: ILogger) {}

  async calculateMenus(
    frameMenu: Frame,
    names: readonly string[],
  ): Promise<MenuItemsMap> {
    const result = await (
      frameMenu as PuppeteerFrame
    ).evaluate((menuNames: string[]) => {
      function getSelectorPath(element: Element | null): string {
        if (!element) return '';
        if (element.id) return `#${element.id}`;

        const path: string[] = [];
        let el: Element | null = element;
        while (el && el.parentElement) {
          let selector = el.tagName.toLowerCase();
          if (el.className) {
            const classList = el.className.trim().split(/\s+/).join('.');
            selector += `.${classList}`;
          }
          const siblings = Array.from(el.parentElement.children);
          const index = siblings.indexOf(el);
          const sameTagCount = siblings.filter((s) => s.tagName === el!.tagName).length;
          if (sameTagCount > 1) selector += `:nth-child(${index + 1})`;
          path.unshift(selector);
          el = el.parentElement;
        }
        return path.join(' > ');
      }

      const map: Record<string, string> = {};
      const items = document.querySelectorAll('.LigneMenu');
      items.forEach((item) => {
        for (const name of menuNames) {
          if (item.innerHTML.includes(name)) {
            map[name] = getSelectorPath(item);
            break;
          }
        }
      });
      return map;
    }, [...names]);

    this.logger.debug('Menu items calculated', { count: Object.keys(result).length });
    return result;
  }

  async gotoMenu(frameMenu: Frame, elPath: string | undefined): Promise<void> {
    if (!frameMenu || !elPath) return;
    const link = await (frameMenu as PuppeteerFrame).$(elPath);
    if (!link) {
      this.logger.warn('Menu selector not found', { selector: elPath });
      return;
    }
    await link.click();
    // Nota: el original usaba `.click()` síncrono. Puppeteer acepta tanto
    // el síncrono (deprecated pero aún funciona) como `await link.click()`.
    void Selectors; // suprimir warning de unused si Selectors no se usa aquí
  }
}