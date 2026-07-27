import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { VehicleOrchestrator } from '../src/application/orchestrator/vehicle-orchestrator.ts';
import { appConfig } from '../src/core/config/app-config.ts';
import { NoVinAvailableError } from '../src/core/errors/domain-errors.ts';
import * as delayModule from '../src/core/utils/delay.ts';
import { ConsoleLogger } from '../src/core/logger/console-logger.ts';
import type { IAuditLogger } from '../src/domain/ports/audit-logger.interface.ts';
import type { IBrowserSession } from '../src/domain/ports/browser-session.interface.ts';
import type { IApiService } from '../src/domain/ports/api-service.interface.ts';
import type { IcmLoginUseCase } from '../src/application/usecases/icm-login.usecase.ts';
import type { Phase1AuthUseCase } from '../src/application/usecases/phase1-auth.usecase.ts';
import type { ProcessVehicleUseCase } from '../src/application/usecases/process-vehicle.usecase.ts';
import type { VehicleReport } from '../src/domain/models/vehicle.ts';

// ---------- Mock factories ----------

function makeBrowser(): IBrowserSession & {
  launch: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
} {
  return {
    launch: mock(async () => ({ browser: {}, page: {} })),
    close: mock(async () => {}),
    getPage: () => ({}) as never,
    getBrowser: () => ({}) as never,
    onDialog: () => {},
    onClose: () => {},
  };
}

function makeApi(): IApiService & {
  getVin: ReturnType<typeof mock>;
  sendData: ReturnType<typeof mock>;
} {
  // Nota: la firma de `getVin` declara `data` como no-opcional, pero el
  // orquestador trata `data: undefined` como "cola vacía". Hacemos cast
  // para que el mock pueda devolver también respuestas vacías.
  const getVin = mock(async () => ({
    error: false,
    data: undefined as unknown as { vin: string; lastId: string; tipo: string; km: string | number },
  }));
  return {
    getVin: getVin as unknown as IApiService['getVin'] & ReturnType<typeof mock>,
    sendData: mock(async () => ({ error: false })),
    sendUnknownVin: mock(async () => ({ error: false })),
    sendAudit: mock(async () => ({ error: false })),
  };
}

function makeAudit(): IAuditLogger {
  return {
    log: () => true,
    size: () => 0,
    snapshot: () => [],
    flush: mock(async () => ({ error: false })),
  };
}

function makePhase1(): Phase1AuthUseCase {
  return {
    confirmAccess: mock(async () => {}),
    selectIcmMod: mock(async () => {}),
  } as unknown as Phase1AuthUseCase;
}

function makeIcmLogin(): IcmLoginUseCase {
  return {
    login: mock(async () => {}),
  } as unknown as IcmLoginUseCase;
}

function makeProcessVehicle(): ProcessVehicleUseCase {
  const fakeReport: VehicleReport = { details: { html: '', b64: '' } };
  return {
    process: mock(async () => fakeReport),
  } as unknown as ProcessVehicleUseCase;
}

// ---------- Helpers ----------

type Deps = ConstructorParameters<typeof VehicleOrchestrator>[0];

function build(deps: Partial<Deps> = {}, options: { failFast?: boolean; dryRun?: boolean } = {}) {
  const browser = (deps.browser ?? makeBrowser()) as IBrowserSession & {
    launch: ReturnType<typeof mock>;
    close: ReturnType<typeof mock>;
  };
  const api = (deps.api ?? makeApi()) as IApiService & {
    getVin: ReturnType<typeof mock>;
    sendData: ReturnType<typeof mock>;
  };
  const audit = deps.audit ?? makeAudit();
  const phase1 = deps.phase1 ?? makePhase1();
  const icmLogin = deps.icmLogin ?? makeIcmLogin();
  const processVehicle = deps.processVehicle ?? makeProcessVehicle();
  const logger = deps.logger ?? new ConsoleLogger();

  const orchestrator = new VehicleOrchestrator(
    { browser, phase1, icmLogin, processVehicle, api, audit, logger },
    options,
  );

  return { orchestrator, browser, api, audit, phase1, icmLogin, processVehicle, logger };
}

const SAMPLE_VIN = {
  vin: 'VF1ABC1234567890',
  lastId: '42',
  tipo: 'Sedan',
  km: '100',
};

// ---------- Tests ----------

describe('VehicleOrchestrator — processAllPending', () => {
  let delaySpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Mockeamos delay() para que retorne inmediatamente y no se espere
    // realmente queueEmptyMs (10 min) en el test.
    delaySpy = spyOn(delayModule, 'delay').mockResolvedValue();
  });

  afterEach(() => {
    delaySpy.mockRestore();
  });

  it('no lanza browser nuevo cuando la cola está vacía: solo espera y re-consulta', async () => {
    const api = makeApi();
    let callCount = 0;
    (api.getVin as ReturnType<typeof mock>).mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) {
        throw new NoVinAvailableError('test: stop loop', { phase: 'test' });
      }
      return { error: false, data: undefined };
    });

    const { browser, orchestrator } = build({ api });

    await orchestrator.runForever().catch(() => {
      /* esperado: NoVinAvailableError corta el loop */
    });

    // El navegador se lanza UNA vez al inicio del runForever (reuse=false implícito).
    // NO debe re-lanzarse entre esperas porque la cola está vacía.
    expect((browser.launch as ReturnType<typeof mock>).mock.calls.length).toBe(1);

    // delay() se invocó exactamente 2 veces (una por cada ciclo de cola vacía).
    const delayCalls = delaySpy.mock.calls;
    expect(delayCalls.length).toBe(2);
    // Cada llamada usa queueEmptyMs (10 min por defecto).
    expect(delayCalls[0]?.[0]).toBe(appConfig.timeouts.queueEmptyMs);
    expect(delayCalls[1]?.[0]).toBe(appConfig.timeouts.queueEmptyMs);

    // Aseguramos que el api.getVin mockeado se llamó al menos 3 veces.
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('NO re-autentica cuando aparecen VINes tras la espera: solo procesa el batch', async () => {
    const api = makeApi();
    const processVehicle = makeProcessVehicle();
    let callCount = 0;
    (api.getVin as ReturnType<typeof mock>).mockImplementation(async () => {
      callCount++;
      if (callCount >= 4) {
        throw new NoVinAvailableError('test: stop loop', { phase: 'test' });
      }
      // 1ª: cola vacía; 2ª: aparece VIN tras espera; 3ª: batch agotado.
      if (callCount === 2) {
        return { error: false, data: SAMPLE_VIN };
      }
      return { error: false, data: undefined };
    });

    const { browser, orchestrator } = build({ api, processVehicle });

    await orchestrator.runForever().catch(() => {});

    const launchCalls = (browser.launch as ReturnType<typeof mock>).mock.calls;
    // SOLO el launch inicial. NO se re-autentica tras la espera por cola vacía,
    // porque la sesión del navegador sigue viva y re-autenticarse la corrompería.
    expect(launchCalls.length).toBe(1);

    // El primer launch NO debe tener reuse.
    const firstOptions = launchCalls[0]?.[0] as { reuse?: boolean };
    expect(firstOptions.reuse).toBeFalsy();

    // El batch del VIN aparecido se procesó una sola vez.
    const processCalls = (processVehicle.process as ReturnType<typeof mock>)
      .mock.calls;
    expect(processCalls.length).toBe(1);
    expect(processCalls[0]?.[0]).toEqual({
      id: SAMPLE_VIN.lastId,
      vin: SAMPLE_VIN.vin,
      tipo: SAMPLE_VIN.tipo,
      km: SAMPLE_VIN.km,
    });
  });

  it('cuando la cola sigue vacía tras la espera, NO se invoca reAuthenticate', async () => {
    const api = makeApi();
    let callCount = 0;
    (api.getVin as ReturnType<typeof mock>).mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) {
        throw new NoVinAvailableError('test: stop loop', { phase: 'test' });
      }
      return { error: false, data: undefined };
    });

    const { browser, orchestrator } = build({ api });

    await orchestrator.runForever().catch(() => {});

    // Solo el launch inicial. Ninguna re-autenticación.
    expect((browser.launch as ReturnType<typeof mock>).mock.calls.length).toBe(1);
  });
});
