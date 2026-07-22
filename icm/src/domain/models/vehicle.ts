/**
 * Tipos de dominio relacionados con un vehículo.
 * Puros, sin dependencias de Puppeteer ni del backend.
 */

export type Vin = string;
export type VehicleId = string;

/** Kilometraje reportado por el CRM. */
export type Kilometers = string | number;

/**
 * Contexto mínimo de un vehículo a procesar.
 * Se construye a partir de la respuesta de `Get_vin`.
 */
export interface VehicleContext {
  id: VehicleId;
  vin: Vin;
  tipo: string;
  km: Kilometers;
}

/**
 * Resultado capturado por las secciones del menú ICM.
 * Cada campo es el HTML serializado en base64 (o undefined si la
 * sección no existe para ese vehículo).
 */
export interface VehicleReport {
  details?: HtmlChunk;
  historic?: HtmlChunk;
  agreements?: HtmlChunk;
  maintains?: HtmlChunk;
  ots?: HtmlChunk;
  recmant?: HtmlChunk;
  admin?: HtmlChunk;
  /** Datos estructurados capturados en la sección admin/detalles. */
  adminData?: AdminValues;
}

/**
 * Bloque de HTML capturado. Se serializa en base64 para enviarlo
 * al backend tal cual se hacía en `queries.mjs`.
 */
export interface HtmlChunk {
  /** HTML sin codificar (útil para re-procesar o logs). */
  html: string;
  /** Mismo HTML codificado en base64 (lo que espera el backend). */
  b64: string;
  /** Algunas secciones extraen valores estructurados (motor, caja, etc.). */
  values?: AdminValues;
}

/**
 * Campos extraídos del detalle del vehículo o de la sección administrativa.
 */
export interface AdminValues {
  tipo_vh: string;
  tipo_mot: string;
  tipo_caja: string;
  fecha_entrega: string;
}

export const DEFAULT_ADMIN_VALUES: AdminValues = {
  tipo_vh: '-',
  tipo_mot: '-',
  tipo_caja: '-',
  fecha_entrega: '-',
};