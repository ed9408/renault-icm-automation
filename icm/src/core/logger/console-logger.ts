import type { ILogger } from './logger.interface.ts';

/**
 * Códigos ANSI para colorear la salida.
 * Se desactivan automáticamente si NO_COLOR está definido o si la salida
 * no es un TTY (siguiendo la convención https://no-color.org/).
 */

const useColor = (() => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  // Bun expone isatty; en arranque puede no estar disponible, fallback a true.
  return typeof process.stdout?.isTTY === 'undefined' ? true : process.stdout.isTTY;
})();

const ansi = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function paint(color: keyof typeof ansi, text: string): string {
  if (!useColor) return text;
  return `${ansi[color]}${text}${ansi.reset}`;
}

const LEVEL_COLOR: Record<string, keyof typeof ansi> = {
  DEBUG: 'gray',
  INFO: 'green',
  WARN: 'yellow',
  ERROR: 'red',
};

/**
 * Implementación de ILogger que escribe en stdout/stderr con timestamp,
 * colores ANSI (respetando NO_COLOR) y prefijo.
 *
 * Sustituible por pino/bunyan/etc sin tocar consumidores (OCP).
 */
export class ConsoleLogger implements ILogger {
  constructor(private readonly prefix: string = '[ICM]') {}

  private format(level: string, message: string, context?: Record<string, unknown>): string {
    const ts = new Date().toISOString();
    const lvl = String(LEVEL_COLOR[level] ? level : 'INFO');
    const lvlColored = paint(LEVEL_COLOR[lvl] ?? 'green', lvl.padEnd(5, ' '));
    const prefixColored = paint('cyan', this.prefix);
    const ctx = context ? ` ${paint('gray', JSON.stringify(context))}` : '';
    return `${paint('gray', ts)} ${prefixColored} ${lvlColored} ${message}${ctx}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.log(this.format('DEBUG', message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(this.format('INFO', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.format('WARN', message, context));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.format('ERROR', message, context));
  }
}