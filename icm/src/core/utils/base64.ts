/**
 * Helpers de codificación base64. Usados por las secciones para
 * serializar el HTML capturado antes de enviarlo al backend.
 */

/** Codifica un string (UTF-8) a base64. */
export function stringToBase64(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64');
}

/** Codifica un Buffer a base64. */
export function bufferToBase64(input: Buffer): string {
  return input.toString('base64');
}