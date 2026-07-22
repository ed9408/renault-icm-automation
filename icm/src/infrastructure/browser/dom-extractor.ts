import type { Frame as PuppeteerFrame } from 'puppeteer';

import { delay } from '../../core/utils/delay.ts';
import { SelectorTimeoutError } from '../../core/errors/domain-errors.ts';
import { DEFAULT_ADMIN_VALUES, type AdminValues } from '../../domain/models/vehicle.ts';
import type { Frame } from '../../domain/models/frame-context.ts';
import type {
  ExtractionPlan,
  IDomExtractor,
} from '../../domain/ports/dom-extractor.interface.ts';

/**
 * Implementación de IDomExtractor sobre Puppeteer.
 * Encapsula:
 *   - `frame.content()` → HTML crudo
 *   - `frame.evaluate` → extracción de valores por selector
 *   - `frame.waitForSelector` con timeout 0 (espera indefinida como el original)
 *
 * Los errores de timeout de Puppeteer se traducen a `SelectorTimeoutError`
 * con el selector que falló para que el reporte en consola sea accionable.
 */
export class PuppeteerDomExtractor implements IDomExtractor {
  async extractHtml(frame: Frame): Promise<string> {
    return (frame as PuppeteerFrame).content();
  }

  async waitAndExtract(
    frame: Frame,
    selector: string,
    waitMs: number,
  ): Promise<string> {
    await this.waitForSelectorOrThrow(frame, selector, 0);
    await delay(waitMs);
    return this.extractHtml(frame);
  }

  async extractValues<T extends Record<string, string>>(
    frame: Frame,
    plan: ExtractionPlan<T>,
  ): Promise<T> {
    const result = (await (
      frame as PuppeteerFrame
    ).evaluate((planObj: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [key, selector] of Object.entries(planObj)) {
        const el = document.querySelector(selector) as
          | HTMLInputElement
          | HTMLElement
          | null;
        if (!el) {
          out[key] = '-';
          continue;
        }
        if ('value' in el && (el as HTMLInputElement).value !== undefined) {
          out[key] = (el as HTMLInputElement).value;
        } else {
          out[key] = (el as HTMLElement).innerHTML;
        }
      }
      return out;
    }, plan as Record<string, string>)) as Record<string, string>;

    return result as unknown as T;
  }

  async waitForAny(
    frame: Frame,
    selectors: string[],
    timeoutMs: number,
  ): Promise<string | null> {
    for (const selector of selectors) {
      try {
        await (frame as PuppeteerFrame).waitForSelector(selector, {
          timeout: timeoutMs,
        });
        return selector;
      } catch {
        // probar siguiente
      }
    }
    return null;
  }

  async extractAdminValues(
    frame: Frame,
    plan: ExtractionPlan<AdminValues>,
  ): Promise<AdminValues> {
    const raw = await this.extractValues<Record<string, string>>(frame, plan);
    const merged: AdminValues = {
      tipo_vh: raw['tipo_vh'] ?? DEFAULT_ADMIN_VALUES.tipo_vh,
      tipo_mot: raw['tipo_mot'] ?? DEFAULT_ADMIN_VALUES.tipo_mot,
      tipo_caja: raw['tipo_caja'] ?? DEFAULT_ADMIN_VALUES.tipo_caja,
      fecha_entrega:
        raw['fecha_entrega'] ?? DEFAULT_ADMIN_VALUES.fecha_entrega,
    };
    merged.fecha_entrega = merged.fecha_entrega.replace(/\./g, '-');
    return merged;
  }

  /**
   * Espera un selector y, si falla, lanza `SelectorTimeoutError`
   * con el selector y un snippet del HTML actual.
   */
  private async waitForSelectorOrThrow(
    frame: Frame,
    selector: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await (frame as PuppeteerFrame).waitForSelector(selector, {
        timeout: timeoutMs,
      });
    } catch (err) {
      const htmlSnippet = await this.safeHtmlSnippet(frame);
      throw new SelectorTimeoutError(
        `Timeout esperando selector "${selector}"`,
        {
          selector,
          phase: 'capture',
          htmlSnippet,
          extra: { originalMessage: (err as Error).message },
        },
        { cause: err as Error },
      );
    }
  }

  private async safeHtmlSnippet(frame: Frame): Promise<string | undefined> {
    try {
      const html = await this.extractHtml(frame);
      return html.slice(0, 500);
    } catch {
      return undefined;
    }
  }
}