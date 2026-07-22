/**
 * Entrada del log de auditoría que se envía al backend al final
 * de cada procesamiento de vehículo.
 */
export interface AuditEntry {
  id: string;
  vin: string;
  action: string;
  /** Epoch ms. */
  date: number;
  /** Fecha formateada YYYY-MM-DD HH:MM:SS. */
  dateFull: string;
}