import { describe, expect, it, mock } from 'bun:test';
import { RenaultApiService } from '../src/infrastructure/api/renault-api.service.ts';
import type { IHttpClient } from '../src/domain/ports/http-client.interface.ts';
import type { ILogger } from '../src/core/logger/logger.interface.ts';

function makeHttp(payload: unknown): IHttpClient {
  return {
    request: mock(async () => payload),
  };
}

const noopLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('RenaultApiService', () => {
  it('getVin devuelve data cuando transactionStatus=200', async () => {
    const http = makeHttp({
      transactionStatus: 200,
      transactionMessage: { vin: 'AAA', lastId: '1', tipo: 'sedan', km: '0' },
    });
    const api = new RenaultApiService(http, noopLogger);

    const res = await api.getVin('');
    expect(res.error).toBe(false);
    expect(res.data?.vin).toBe('AAA');
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it('getVin marca error si transactionStatus != 200', async () => {
    const http = makeHttp({ transactionStatus: 500 });
    const api = new RenaultApiService(http, noopLogger);

    const res = await api.getVin('');
    expect(res.error).toBe(true);
  });

  it('sendData usa el cmd correcto y propaga contexto', async () => {
    const http = makeHttp({ transactionStatus: 200 });
    const api = new RenaultApiService(http, noopLogger);

    await api.sendData(
      { id: '1', vin: 'V', tipo: 't', km: 100 },
      { admin: { html: 'h', b64: 'Yg==' } },
    );

    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call).toBeDefined();
    const body = call![1] as { cmd: string; id: string; vin: string };
    expect(body.cmd).toBe('set_vin_data');
    expect(body.id).toBe('1');
    expect(body.vin).toBe('V');
  });

  it('sendUnknownVin envía unknow_vin', async () => {
    const http = makeHttp({ transactionStatus: 200 });
    const api = new RenaultApiService(http, noopLogger);

    await api.sendUnknownVin('1', 'V');
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    const body = call![1] as { cmd: string };
    expect(body.cmd).toBe('unknow_vin');
  });
});