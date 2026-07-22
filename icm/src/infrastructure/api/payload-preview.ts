import { appConfig } from '../../core/config/app-config.ts';
import type { AuditEntry } from '../../domain/models/audit-entry.ts';
import type { VehicleReport } from '../../domain/models/vehicle.ts';

/**
 * Helpers puros para generar resúmenes "seguros de loguear" de los
 * payloads que el runner envía al backend (CRM caribemotor).
 *
 * - HTML en base64 se reemplaza por `{ b64Len, preview }` (primeros N chars).
 * - El token se enmascara para no exponer credenciales en logs.
 * - El endpoint se reconstruye a partir de `appConfig.api.endpoint` para
 *   tener una única fuente de verdad.
 *
 * Usado por:
 *   - RenaultApiService (log permanente antes de cada http.request).
 *   - VehicleOrchestrator.dispatch() (preview en dry-run).
 */

const PREVIEW_CHARS = 100;

function previewBase64(b64: string | undefined): {
  b64Len: number;
  preview: string;
} {
  if (!b64) return { b64Len: 0, preview: '' };
  return {
    b64Len: b64.length,
    preview: b64.slice(0, PREVIEW_CHARS),
  };
}

/**
 * Resumen del VehicleReport: una entrada por sección con b64Len + preview,
 * preservando `values` (p.ej. AdminValues) que sí son útiles para diagnosticar.
 */
export function summarizeVehicleReport(report: VehicleReport): Record<
  string,
  unknown
> {
  const out: Record<string, unknown> = {};
  for (const [key, chunk] of Object.entries(report)) {
    if (!chunk) continue;
    out[key] = {
      b64Len: chunk.b64?.length ?? 0,
      preview: previewBase64(chunk.b64).preview,
      values: chunk.values,
    };
  }
  return out;
}

/**
 * Resumen del batch de auditoría. Cada entrada ya es pequeña
 * (id/vin/action/fechas) → se devuelve tal cual.
 */
export function summarizeAuditActions(
  actions: readonly AuditEntry[],
): unknown[] {
  return actions.map((a) => ({
    id: a.id,
    vin: a.vin,
    action: a.action,
    date: a.date,
    dateFull: a.dateFull,
  }));
}

/**
 * URL completa del endpoint CRM tal como la construye FetchHttpClient.
 * Útil para mostrarla en logs y comparar contra el wire.
 */
export function buildEndpointUrl(): string {
  const host = appConfig.api.endpoint.host;
  const path = appConfig.api.endpoint.path;
  return `https://${host}:443${path}`;
}

/**
 * Header `Authorization` enmascarado: muestra solo los últimos 4 caracteres.
 * El token por defecto en dev está en app-config.ts como base64;
 * igualmente aplicamos la máscara para no exponerlo en logs/historial.
 */
export function maskedAuth(): string {
  const token = appConfig.api.token;
  if (!token || token.length < 4) return 'Bearer ******';
  return `Bearer ******${token.slice(-4)}`;
}