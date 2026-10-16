import { describe, expect, it, mock } from 'bun:test';
import { CaptureHistoricSection } from '../src/application/usecases/sections/capture-historic-section.usecase.ts';
import type { IDomExtractor } from '../src/domain/ports/dom-extractor.interface.ts';
import type { IAuditLogger } from '../src/domain/ports/audit-logger.interface.ts';
import type { VehicleFrames } from '../src/domain/models/frame-context.ts';
import type { VehicleContext } from '../src/domain/models/vehicle.ts';
import { Selectors } from '../src/core/config/selectors.ts';
import { SECTION_ORDER } from '../src/application/usecases/process-vehicle.usecase.ts';

describe('HistoricSection & SECTION_ORDER', () => {
  it('SECTION_ORDER ubica historic inmediatamente después de admin', () => {
    const adminIdx = SECTION_ORDER.indexOf('admin');
    const historicIdx = SECTION_ORDER.indexOf('historic');
    expect(adminIdx).toBeGreaterThanOrEqual(0);
    expect(historicIdx).toBe(adminIdx + 1);
  });

  it('CaptureHistoricSection no llama gotoMenu si el título ya está listo tras la redirección', async () => {
    const logs: string[] = [];
    const audit: IAuditLogger = {
      log: mock((_id, _vin, message) => {
        if (message) logs.push(message);
        return true;
      }),
      flush: mock(async () => ({ error: false })),
      size: () => 0,
      snapshot: () => [],
    };

    const extractor: IDomExtractor = {
      waitForAny: mock(async () => Selectors.historic.titleSelector),
      waitAndExtract: mock(async () => '<html><body>Historic Content</body></html>'),
      extractHtml: mock(async () => '<html><body>Expanded Historic Content</body></html>'),
      safeWaitForSelector: mock(async () => {}),
      extractValues: mock(async () => ({} as never)),
      extractAdminValues: mock(async () => ({} as never)),
      clickAndDismissDialog: mock(async () => true),
    };

    const section = new CaptureHistoricSection(extractor, audit);

    const clickMock = mock(async () => {});
    const frames: VehicleFrames = {
      frameBody: {
        $: mock(async () => ({ click: clickMock })),
      },
      frameMenu: {},
      menuItems: { Histórico: '#menuHistoric' },
    };

    const ctx: VehicleContext = {
      id: 'vh-1',
      vin: 'VF1TEST1234567890',
      tipo: 'V',
      km: 10000,
    };

    const nav = {
      gotoMenu: mock(async () => {}),
    };

    const result = await section.capture(frames, ctx, nav);

    // gotoMenu NO debió llamarse porque el título ya estaba listo por la redirección automática
    expect(nav.gotoMenu).not.toHaveBeenCalled();
    expect(extractor.waitAndExtract).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(result?.html).toBe('<html><body>Expanded Historic Content</body></html>');
    expect(logs).toContain('Estoy esperando ingresar al historico');
    expect(logs).toContain('Ya ingrese al historico y capture su contenido');
  }, 10000);

  it('CaptureHistoricSection llama gotoMenu como fallback si el título no aparece tras timeout', async () => {
    const audit: IAuditLogger = {
      log: () => true,
      flush: mock(async () => ({ error: false })),
      size: () => 0,
      snapshot: () => [],
    };

    const extractor: IDomExtractor = {
      waitForAny: mock(async () => null), // No aparece en primera instancia
      waitAndExtract: mock(async () => '<html><body>Historic Content</body></html>'),
      extractHtml: mock(async () => '<html><body>Expanded Historic Content</body></html>'),
      safeWaitForSelector: mock(async () => {}),
      extractValues: mock(async () => ({} as never)),
      extractAdminValues: mock(async () => ({} as never)),
      clickAndDismissDialog: mock(async () => true),
    };

    const section = new CaptureHistoricSection(extractor, audit);

    const frames: VehicleFrames = {
      frameBody: {
        $: mock(async () => null),
      },
      frameMenu: {},
      menuItems: { Histórico: '#menuHistoric' },
    };

    const ctx: VehicleContext = {
      id: 'vh-1',
      vin: 'VF1TEST1234567890',
      tipo: 'V',
      km: 10000,
    };

    const nav = {
      gotoMenu: mock(async () => {}),
    };

    await section.capture(frames, ctx, nav);

    // Como no apareció automáticamente, debe llamar a gotoMenu de respaldo
    expect(nav.gotoMenu).toHaveBeenCalledWith('#menuHistoric');
  }, 10000);
});

