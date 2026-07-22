/**
 * Puerto genérico de transporte HTTP.
 * El cliente concreto vive en infrastructure/http/.
 * Los servicios (api, audit) solo conocen esta interfaz.
 */

export interface HttpRequestOptions {
  host: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  port?: string;
  headers?: Record<string, string>;
  /** Timeout en ms (0 = sin timeout). */
  timeoutMs?: number;
}

export interface IHttpClient<TResponse = unknown> {
  /**
   * Realiza una petición y devuelve la respuesta parseada (típicamente JSON).
   * Lanza `HttpTransportError` si el status no es 2xx o si la red falla.
   */
  request<TBody = unknown>(
    options: HttpRequestOptions,
    body?: TBody,
  ): Promise<TResponse>;
}