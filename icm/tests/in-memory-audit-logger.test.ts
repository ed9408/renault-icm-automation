import { describe, expect, it, mock } from 'bun:test';
import { InMemoryAuditLogger } from '../src/infrastructure/audit/in-memory-audit-logger.ts';
import type { IApiService } from '../src/domain/ports/api-service.interface.ts';

function makeApi(): IApiService {
  return {
    getVin: mock(async () => ({ error: false, data: { vin: '', lastId: '', tipo: '', km: '' } })),
    sendData: mock(async () => ({ error: false })),
    sendUnknownVin: mock(async () => ({ error: false })),
    sendAudit: mock(async () => ({ error: false })),
  };
}

describe('InMemoryAuditLogger', () => {
  it('rechaza entradas vacías', () => {
    const api = makeApi();
    const log = new InMemoryAuditLogger(api);
    expect(log.log('1', 'VIN', '')).toBe(false);
    expect(log.log('1', 'VIN', '   ')).toBe(false);
    expect(log.size()).toBe(0);
  });

  it('acumula entradas válidas', () => {
    const api = makeApi();
    const log = new InMemoryAuditLogger(api);
    log.log('id', 'VIN123', 'entré a detalles');
    log.log('id', 'VIN123', 'capturé histórico');
    expect(log.size()).toBe(2);
    expect(log.snapshot()[0]?.action).toBe('entré a detalles');
  });

  it('flush envía el batch al API y limpia el buffer', async () => {
    const api = makeApi();
    const log = new InMemoryAuditLogger(api);
    log.log('1', 'VIN', 'acción 1');
    log.log('1', 'VIN', 'acción 2');

    const res = await log.flush();
    expect(res.error).toBe(false);
    expect(api.sendAudit).toHaveBeenCalledTimes(1);
    expect(log.size()).toBe(0);
  });

  it('flush no llama al API si está vacío', async () => {
    const api = makeApi();
    const log = new InMemoryAuditLogger(api);
    await log.flush();
    expect(api.sendAudit).not.toHaveBeenCalled();
  });
});