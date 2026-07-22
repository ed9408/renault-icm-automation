import { describe, expect, it, mock } from 'bun:test';
import { FetchHttpClient } from '../src/infrastructure/http/fetch-http-client.ts';
import { HttpTransportError } from '../src/core/errors/domain-errors.ts';

describe('FetchHttpClient', () => {
  it('envía POST con headers y body JSON por defecto', async () => {
    const fakeResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const original = globalThis.fetch;
    globalThis.fetch = mock(async () => fakeResponse) as unknown as typeof fetch;

    try {
      const client = new FetchHttpClient();
      const res = await client.request(
        {
          host: 'example.com',
          path: '/api',
          headers: { Authorization: 'Bearer X' },
        },
        { foo: 'bar' },
      );
      expect(res).toEqual({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('lanza HttpTransportError cuando status != 2xx', async () => {
    const fakeResponse = new Response('boom', { status: 500 });
    const original = globalThis.fetch;
    globalThis.fetch = mock(async () => fakeResponse) as unknown as typeof fetch;

    try {
      const client = new FetchHttpClient();
      await expect(
        client.request({ host: 'example.com', path: '/api' }),
      ).rejects.toThrow(HttpTransportError);
    } finally {
      globalThis.fetch = original;
    }
  });
});