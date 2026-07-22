import type { AuditEntry } from '../models/audit-entry.ts';

/**
 * Puerto de auditoría. La implementación concreta acumula entradas en
 * memoria y las envía al backend en bloque al final del procesamiento.
 */
export interface IAuditLogger {
  /** Registra una acción. Devuelve false si la entrada fue descartada. */
  log(id: string, vin: string, action: string | undefined): boolean;

  /** Cantidad de entradas acumuladas. */
  size(): number;

  /**
   * Acceso de solo lectura a las entradas pendientes.
   * Útil para diagnóstico/preview (p.ej. dry-run) sin enviar al backend.
   */
  snapshot(): readonly AuditEntry[];

  /** Envía todas las entradas al backend y limpia el buffer. */
  flush(): Promise<{ error: boolean }>;
}