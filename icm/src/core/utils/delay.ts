/**
 * Pausa la ejecución durante `ms` milisegundos.
 * Equivalente al `timeOut` original, pero tipado y reusable.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}