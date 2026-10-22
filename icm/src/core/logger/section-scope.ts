import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string>();

/**
 * Ejecuta `fn` marcando la sección que se está consultando. Todo log emitido
 * (incluso desde capas inferiores como el extractor o el navegador) dentro de
 * `fn` puede conocer la sección vía `currentSection()`.
 */
export function runInSection<T>(section: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(section, fn);
}

/** Sección en curso, o `undefined` si no se está capturando ninguna. */
export function currentSection(): string | undefined {
  return storage.getStore();
}
