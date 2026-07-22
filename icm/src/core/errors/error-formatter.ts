import type { IcmError, ErrorContext } from './domain-errors.ts';

/**
 * Formatea un error (preferentemente IcmError) en un bloque de texto
 * legible para mostrar en la terminal del operador.
 *
 * Por defecto NO incluye el stack trace; se puede activar con
 * la opción `includeStack: true` o seteando la env var `ICM_DEBUG=1`.
 *
 * Estructura:
 *   ❌ [SectionCaptureError] captura de "Histórico" falló
 *      Mensaje: Waiting for selector "..." failed: timeout
 *      VIN:     93YLMB506BJ494829
 *      Sección: Histórico
 *      URL:     https://dcs.renault.com/...
 *   💡 Sugerencias:
 *      1. Revisa los selectores específicos de "Histórico" en src/core/config/selectors.ts.
 *      2. ...
 */

export interface FormatOptions {
  includeStack?: boolean;
  /** Si true, añade una línea "Causa: ..." cuando hay `Error.cause`. */
  includeCause?: boolean;
  /** Trunca `htmlSnippet` a este tamaño (default 200). */
  htmlSnippetMaxChars?: number;
}

const DEFAULT_OPTS: Required<FormatOptions> = {
  includeStack: process.env.ICM_DEBUG === '1',
  includeCause: true,
  htmlSnippetMaxChars: 200,
};

export function isIcmError(err: unknown): err is IcmError {
  return err instanceof Error && 'retryable' in err && 'userMessage' in err;
}

/**
 * Devuelve el `ErrorContext` efectivo del error (puede estar vacío).
 */
export function getContext(err: unknown): ErrorContext {
  if (isIcmError(err)) return err.context;
  return {};
}

/**
 * Trunca un string al tamaño máximo respetando límites de palabra.
 */
function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return text;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (truncado, ${text.length} chars total)`;
}

/**
 * Devuelve un nombre "amigable" para mostrar como título.
 */
function formatTitle(err: IcmError): string {
  const tag = err.retryable ? '↻ reintentable' : '✗ fatal';
  return `[${err.name}] ${err.userMessage()}  ${tag}`;
}

/**
 * Formatea el contexto como pares "Clave: valor" alineados.
 */
function formatContext(ctx: ErrorContext, max: number): string[] {
  const lines: string[] = [];
  const orderedKeys: Array<keyof ErrorContext> = [
    'phase',
    'vin',
    'vehicleId',
    'section',
    'url',
    'selector',
    'attempt',
  ];
  const labelWidth = Math.max(...orderedKeys.map((k) => String(k).length));

  for (const key of orderedKeys) {
    const value = ctx[key];
    if (value === undefined || value === null || value === '') continue;
    const padded = String(key).padEnd(labelWidth, ' ');
    lines.push(`   ${padded} : ${String(value)}`);
  }

  if (ctx.htmlSnippet) {
    const snip = truncate(ctx.htmlSnippet, max);
    lines.push(`   HTML     : ${snip}`);
  }

  if (ctx.extra && Object.keys(ctx.extra).length > 0) {
    lines.push(`   extra    : ${JSON.stringify(ctx.extra)}`);
  }

  return lines;
}

/**
 * Formatea un error en un string multi-línea listo para imprimir.
 */
export function formatError(
  err: unknown,
  options: FormatOptions = {},
): string {
  const opts: Required<FormatOptions> = { ...DEFAULT_OPTS, ...options };

  if (!isIcmError(err)) {
    // Fallback para errores nativos sin envolver
    if (err instanceof Error) {
      return [
        `❌ [${err.name || 'Error'}] ${err.message || '(sin mensaje)'}`,
        opts.includeStack && err.stack ? `   ${err.stack}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return `❌ [NonError] ${String(err)}`;
  }

  const parts: string[] = [];
  parts.push(`❌ ${formatTitle(err)}`);
  parts.push(`   Mensaje : ${err.message || '(sin mensaje)'}`);

  const ctxLines = formatContext(err.context, opts.htmlSnippetMaxChars);
  if (ctxLines.length > 0) {
    parts.push(...ctxLines);
  }

  if (opts.includeCause && err.cause) {
    const causeMsg =
      err.cause instanceof Error
        ? `${err.cause.name}: ${err.cause.message}`
        : String(err.cause);
    parts.push(`   Causa   : ${causeMsg}`);
  }

  if (err.suggestions().length > 0) {
    parts.push(`💡 Sugerencias:`);
    err.suggestions().forEach((s, i) => {
      parts.push(`   ${i + 1}. ${s}`);
    });
  }

  if (opts.includeStack && err.stack) {
    parts.push(`📚 Stack trace:`);
    parts.push(err.stack.split('\n').slice(0, 12).map((l) => `   ${l}`).join('\n'));
  }

  return parts.join('\n');
}

/**
 * Versión corta (una sola línea) para logs en flujo normal.
 */
export function formatErrorInline(err: unknown): string {
  if (!isIcmError(err)) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  const ctx: string[] = [];
  if (err.context.vin) ctx.push(`vin=${err.context.vin}`);
  if (err.context.section) ctx.push(`section=${err.context.section}`);
  if (err.context.phase) ctx.push(`phase=${err.context.phase}`);
  const ctxStr = ctx.length > 0 ? ` (${ctx.join(', ')})` : '';
  return `${err.name}: ${err.message}${ctxStr}`;
}