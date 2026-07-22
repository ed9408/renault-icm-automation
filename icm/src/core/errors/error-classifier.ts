import {
  ErrorContext,
  IcmError,
  UnexpectedError,
} from './domain-errors.ts';

/**
 * Resultado de clasificar un `unknown` capturado en un catch.
 */
export interface ClassifiedError {
  /** El error normalizado (siempre IcmError). */
  error: IcmError;
  /** Si el orquestador puede reintentar. */
  retryable: boolean;
  /** Nombre del tipo (para logging/agrupación). */
  type: string;
}

const NATIVE_TO_TYPE: Record<string, string> = {
  AbortError: 'AbortError',
  TimeoutError: 'TimeoutError',
  TypeError: 'TypeError',
  RangeError: 'RangeError',
  SyntaxError: 'SyntaxError',
};

/**
 * Clasifica un `unknown` capturado en un catch.
 *
 * Reglas:
 *  - Si ya es IcmError → se devuelve tal cual (con `retryable` y `type`).
 *  - Si es `Error` nativo → se envuelve en `UnexpectedError`, preservando `cause` y nombre.
 *  - Cualquier otro valor → se convierte a string y se envuelve en `UnexpectedError`.
 *
 * El contexto extra (vin, section, phase, ...) se MERGEA con cualquier contexto
 * que el error ya tuviera.
 */
export function classifyError(
  err: unknown,
  extraContext: ErrorContext = {},
): ClassifiedError {
  if (err instanceof IcmError) {
    err.withContext(extraContext);
    return { error: err, retryable: err.retryable, type: err.name };
  }

  if (err instanceof Error) {
    const wrapped = new UnexpectedError(
      err.message || '(sin mensaje)',
      extraContext,
      { cause: err },
    );
    // Preservar nombre original como "wrappedType" para diagnóstico
    (wrapped as unknown as { wrappedType: string }).wrappedType =
      NATIVE_TO_TYPE[err.name] ?? err.name;
    return { error: wrapped, retryable: wrapped.retryable, type: err.name };
  }

  const wrapped = new UnexpectedError(
    `Valor no-error lanzado: ${String(err)}`,
    extraContext,
  );
  return { error: wrapped, retryable: wrapped.retryable, type: 'NonError' };
}