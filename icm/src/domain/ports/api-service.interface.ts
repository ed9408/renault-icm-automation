import type { VehicleContext, VehicleReport } from '../models/vehicle.ts';

/** Respuesta cruda del endpoint `get_vin`. */
export interface VinResponse {
  transactionStatus: number;
  transactionMessage: {
    vin: string;
    lastId: string;
    tipo: string;
    km: string | number;
  };
}

/** Respuesta genérica del backend (set_vin_data, unknow_vin, report_auditory). */
export interface ApiAck {
  transactionStatus: number;
  transactionMessage?: unknown;
}

/**
 * Servicio de negocio contra el CRM (caribemotor).
 * Los use cases solo conocen este puerto; el cliente HTTP y la
 * implementación concreta se inyectan desde infrastructure/.
 */
export interface IApiService {
  /** Solicita el siguiente VIN a procesar. */
  getVin(lastId: string): Promise<{ error: boolean; data: VinResponse['transactionMessage'] }>;

  /** Envía el reporte capturado para un vehículo. */
  sendData(
    context: VehicleContext,
    report: VehicleReport,
  ): Promise<{ error: boolean; data?: unknown }>;

  /** Reporta que el VIN consultado no existe en ICM. */
  sendUnknownVin(id: string, vin: string): Promise<{ error: boolean }>;

  /** Envía el batch de auditoría acumulado. */
  sendAudit(actions: unknown[]): Promise<{ error: boolean }>;
}