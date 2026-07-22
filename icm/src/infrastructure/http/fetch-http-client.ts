import { HttpTransportError } from '../../core/errors/domain-errors.ts';
import type {
  HttpRequestOptions,
  IHttpClient,
} from '../../domain/ports/http-client.interface.ts';

/**
 * Implementación de IHttpClient basada en `fetch` nativo de Bun.
 * - method default = POST (el CRM solo recibe POST).
 * - serializa el body como JSON.
 * - añade `Content-Type: application/json` si no se provee.
 * - lanza `HttpTransportError` ante status != 2xx o fallos de red.
 */
export class FetchHttpClient implements IHttpClient {
  async request<TBody = unknown>(
    options: HttpRequestOptions,
    body?: TBody,
  ): Promise<unknown> {
    const { host, path, method = 'POST', headers = {} } = options;

    const url = `https://${host}${path}`;
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 0;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw new HttpTransportError(
        `Network error calling ${host}${path}: ${(err as Error).message}`,
      );
    }

    if (timer) clearTimeout(timer);

    if (!response.ok) {
      throw new HttpTransportError(
        `HTTP error from ${host}${path}`,
        response.status,
      );
    }

    return await response.json();
  }
}