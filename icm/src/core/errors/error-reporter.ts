import type { ILogger } from '../logger/logger.interface.ts';
import type { ErrorContext, IcmError } from './domain-errors.ts';
import { classifyError, type ClassifiedError } from './error-classifier.ts';
import { formatError } from './error-formatter.ts';

/**
 * Puerto para reportar errores de manera uniforme.
 *
 * Centraliza la lógica de "qué pasó" + "qué hacer" + "cómo se muestra",
 * para que las capas de aplicación solo llamen a `report(err, ctx)`.
 */
export interface IErrorReporter {
  /**
   * Clasifica, formatea y emite el error al logger.
   * Devuelve la versión normalizada para que el caller decida qué hacer.
   */
  report(err: unknown, context?: ErrorContext): ClassifiedError;

  /**
   * Igual que `report` pero siempre lanza el error normalizado
   * (útil en capas donde se quiere propagación controlada).
   */
  reportAndThrow(err: unknown, context?: ErrorContext): never;

  /**
   * Reporta un error fatal que NO es reintentable y lanza.
   */
  reportFatal(err: unknown, context?: ErrorContext): never;
}

/**
 * Implementación por defecto: usa el logger para imprimir y devuelve
 * la clasificación. Los errores no fatales se loggean como `error`; los
 * fatales como `error` también pero el caller debe decidir abortar.
 */
export class LoggerErrorReporter implements IErrorReporter {
  constructor(private readonly logger: ILogger) {}

  report(err: unknown, context: ErrorContext = {}): ClassifiedError {
    const classified = classifyError(err, context);
    const formatted = formatError(classified.error, { includeCause: true });
    this.logger.error(formatted);
    return classified;
  }

  reportAndThrow(err: unknown, context: ErrorContext = {}): never {
    const classified = this.report(err, context);
    throw classified.error;
  }

  reportFatal(err: unknown, context: ErrorContext = {}): never {
    const classified = this.report(err, context);
    throw classified.error;
  }
}

/**
 * Helper de conveniencia: clasifica un error SIN reportarlo.
 */
export function quickClassify(err: unknown, ctx: ErrorContext = {}): ClassifiedError {
  return classifyError(err, ctx);
}

/**
 * Helper de conveniencia: asegura que un valor sea IcmError,
 * envolviéndolo si es necesario.
 */
export function asIcmError(err: unknown): IcmError {
  return classifyError(err).error;
}