/**
 * Constantes de comandos del backend CRM (caribemotor).
 *
 * Fuente única de verdad para los `cmd` que el runner envía al endpoint.
 * Usado por:
 *   - RenaultApiService (payload HTTP real).
 *   - payload-preview.ts (preview dry-run y log pre-envío).
 */
export const CMD = {
  getVin: 'get_vin',
  setVinData: 'set_vin_data',
  unknownVin: 'unknow_vin',
  reportAudit: 'report_auditory',
} as const;

export type ApiCommand = (typeof CMD)[keyof typeof CMD];
