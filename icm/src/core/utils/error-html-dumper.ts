import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Frame } from '../../domain/models/frame-context.ts';
import type { ILogger } from '../logger/logger.interface.ts';

export interface DumpContext {
  vin?: string;
  vehicleId?: string;
  phase?: string;
  selector?: string;
}

export interface DumpConfig {
  /** Si false, no escribe nada y devuelve `undefined`. */
  enabled: boolean;
  /** Directorio destino (relativo a process.cwd() si no es absoluto). */
  dir: string;
}

export interface DumpResult {
  path: string;
  bytes: number;
}

/**
 * Convierte una cadena arbitraria en un slug seguro para nombres de archivo.
 *  - Mantiene solo alfanuméricos.
 *  - Colapsa separadores a `-`.
 *  - Trunca a 60 chars (incluyendo extensión libre).
 */
export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'unknown'
  );
}

/**
 * Construye un nombre de archivo estable:
 *   error-<ISOts>-<vinOrVid>-<selectorOrPhase>-<selectorAgain>.html
 *
 * Se duplica `selectorOrPhase` para que, si solo se pasa `phase`,
 * el nombre siga siendo identificable sin colisiones triviales.
 */
export function buildDumpFilename(
  context: DumpContext,
  timestamp = new Date(),
): string {
  const ts = timestamp.toISOString().replace(/[:.]/g, '-');
  const who = context.vin || context.vehicleId || context.phase || 'unknown';
  const what = slugify(context.selector ?? context.phase ?? 'selector');
  return `error-${ts}-${slugify(who)}-${what}.html`;
}

/**
 * Vuelca HTML al directorio configurado.
 *
 * Si el `frame` aún responde, intenta `frame.content()` para obtener
 * el HTML completo del frame. Si falla (frame detach, timeout corto,
 * etc.), escribe el `htmlSnippet` recibido como fallback.
 *
 * Devuelve la ruta absoluta del archivo escrito o `undefined` si:
 *   - `cfg.enabled === false`
 *   - la escritura falla (permisos, disco lleno, etc.) — se loguea WARN
 *
 * **Importante**: nunca lanza errores hacia el caller, para no contaminar
 * la captura principal con un fallo de logging.
 */
export async function writeHtmlDumpToDisk(
  htmlSnippet: string | undefined,
  frame: Frame | undefined,
  context: DumpContext,
  cfg: DumpConfig,
  logger?: ILogger,
): Promise<DumpResult | undefined> {
  if (!cfg.enabled) return undefined;

  let html: string | undefined = htmlSnippet;
  if (frame) {
    try {
      const fromFrame = await (frame as { content(): Promise<string> }).content();
      // Preferimos el HTML completo del frame sobre el snippet corto.
      if (fromFrame && fromFrame.length > 0) html = fromFrame;
    } catch {
      // ya tenemos htmlSnippet como fallback
    }
  }

  if (!html || html.length === 0) {
    logger?.warn('No hay HTML disponible para volcar a disco', { context });
    return undefined;
  }

  const filename = buildDumpFilename(context);
  const baseDir = resolve(process.cwd(), cfg.dir);
  const fullPath = join(baseDir, filename);

  try {
    await mkdir(dirname(fullPath), { recursive: true });
    await Bun.write(Bun.file(fullPath), html);
    return { path: fullPath, bytes: html.length };
  } catch (err) {
    logger?.warn(
      `No se pudo volcar el HTML a disco: ${(err as Error).message}`,
      { fullPath, bytes: html.length },
    );
    return undefined;
  }
}