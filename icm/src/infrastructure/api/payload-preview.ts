import { CMD } from './api-commands.ts';
import { appConfig } from '../../core/config/app-config.ts';
import type { AuditEntry } from '../../domain/models/audit-entry.ts';
import type {
  HtmlChunk,
  VehicleContext,
  VehicleReport,
} from '../../domain/models/vehicle.ts';

/**
 * Helpers puros para generar payloads "seguros de loguear" con la MISMA
 * forma que el runner envía al backend (CRM caribemotor).
 *
 * - `b64` y `html` se truncan a `PREVIEW_B64_MAX`/`PREVIEW_HTML_MAX` chars
 *   con un marker `…[truncated:N]` para no inundar la consola ni el log
 *   con kilobytes de HTML por cada vehículo.
 * - El token se enmascara para no exponer credenciales en logs.
 * - El endpoint se reconstruye a partir de `appConfig.api.endpoint` para
 *   tener una única fuente de verdad.
 *
 * Importante: la forma del objeto devuelto por `formatSetVinDataPayload` y
 * `formatReportAuditPayload` coincide 1:1 con la del body HTTP real — solo
 * difiere en el truncamiento de strings. Esto permite usar el preview del
 * modo dry-run para validar visualmente lo que se enviará.
 *
 * Usado por:
 *   - RenaultApiService (log permanente antes de cada http.request).
 *   - VehicleOrchestrator.dispatch() (preview en dry-run).
 */

const PREVIEW_B64_MAX = 200;
const PREVIEW_HTML_MAX = 200;

/**
 * Trunca `s` a `max` chars y añade un marker con el tamaño original.
 * Si el string ya cabe, se devuelve tal cual.
 */
function truncateString(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated:${s.length}]`;
}

/**
 * Devuelve un HtmlChunk con `b64` y `html` truncados pero mismo shape
 * (mismas claves: `b64`, `html`, opcional `values`).
 */
function previewHtmlChunk(chunk: HtmlChunk): Record<string, unknown> {
  const out: Record<string, unknown> = {
    b64: truncateString(chunk.b64, PREVIEW_B64_MAX),
    html: truncateString(chunk.html, PREVIEW_HTML_MAX),
  };
  if (chunk.values !== undefined) {
    out.values = chunk.values;
  }
  return out;
}

/**
 * Construye la rama `data` del payload `set_vin_data` con el MISMO shape
 * que el report original: cada chunk aparece como `{ b64, html, values }`
 * (sin `b64Len`/`preview`). Los campos no-HtmlChunk (p.ej. `adminData`)
 * se preservan tal cual.
 */
function previewVehicleReport(report: VehicleReport): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(report)) {
    if (value === undefined || value === null) continue;
    if (key === 'adminData') {
      // AdminValues es data estructurada, no HtmlChunk: se preserva tal cual.
      out.adminData = value;
      continue;
    }
    out[key] = previewHtmlChunk(value as HtmlChunk);
  }
  return out;
}

/**
 * Payload EXACTO de `set_vin_data` con `b64` y `html` truncados.
 * Misma forma que el body que `RenaultApiService.sendData` envía al HTTP.
 */
export function formatSetVinDataPayload(
  ctx: VehicleContext,
  report: VehicleReport,
): Record<string, unknown> {
  return {
    cmd: CMD.setVinData,
    id: ctx.id,
    vin: ctx.vin,
    tipo: ctx.tipo,
    km: ctx.km,
    data: previewVehicleReport(report),
  };
}

/**
 * Payload EXACTO de `report_auditory` con las acciones tal cual.
 * Misma forma que el body que `RenaultApiService.sendAudit` envía al HTTP.
 */
export function formatReportAuditPayload(
  actions: readonly AuditEntry[],
): Record<string, unknown> {
  return {
    cmd: CMD.reportAudit,
    actions: actions.map((a) => ({
      id: a.id,
      vin: a.vin,
      action: a.action,
      date: a.date,
      dateFull: a.dateFull,
    })),
  };
}

/**
 * URL completa del endpoint CRM tal como la construye FetchHttpClient.
 * Útil para mostrarla en logs y comparar contra el wire.
 */
export function buildEndpointUrl(): string {
  const host = appConfig.api.endpoint.host;
  const path = appConfig.api.endpoint.path;
  return `https://${host}${path}`;
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