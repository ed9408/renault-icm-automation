import { describe, expect, it, mock } from 'bun:test';
import { CaptureAdminSection } from '../src/application/usecases/sections/capture-admin-section.usecase.ts';
import type { IDomExtractor } from '../src/domain/ports/dom-extractor.interface.ts';
import type { IAuditLogger } from '../src/domain/ports/audit-logger.interface.ts';
import type { VehicleFrames } from '../src/domain/models/frame-context.ts';
import type { VehicleContext } from '../src/domain/models/vehicle.ts';
import { Selectors } from '../src/core/config/selectors.ts';
import { appConfig } from '../src/core/config/app-config.ts';

describe('CaptureAdminSection', () => {
  it('captura HTML, extrae valores y ejecuta clic con descarte de alerta', async () => {
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
      waitForAny: mock(async () => Selectors.admin.primaryTitleSelector),
      extractHtml: mock(async () => '<html><body>Admin Content</body></html>'),
      waitAndExtract: mock(async () => ''),
      safeWaitForSelector: mock(async () => {}),
      extractValues: mock(async () => ({} as never)),
      extractAdminValues: mock(async () => ({
        tipo_vh: 'B98',
        tipo_mot: 'K9K',
        tipo_caja: 'JR5',
        num_fab: '123456',
        fecha_entrega: '2020-01-01',
      })),
      clickAndDismissDialog: mock(async () => true),
    };

    const section = new CaptureAdminSection(extractor, audit);

    const frames: VehicleFrames = {
      frameBody: {},
      frameMenu: {},
      menuItems: { administrativa: '#menuAdmin' },
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

    expect(nav.gotoMenu).toHaveBeenCalledWith('#menuAdmin');
    expect(extractor.waitForAny).toHaveBeenCalled();
    expect(extractor.extractHtml).toHaveBeenCalledWith(frames.frameBody);
    expect(extractor.extractAdminValues).toHaveBeenCalledWith(
      frames.frameBody,
      Selectors.admin.fields,
    );
    expect(extractor.clickAndDismissDialog).toHaveBeenCalledWith(
      frames.frameBody,
      Selectors.admin.actionButton,
      appConfig.timeouts.selectorWaitMs,
    );
    expect(result).not.toBeNull();
    expect(result?.html).toContain('Admin Content');
    expect(result?.values?.tipo_mot).toBe('K9K');
    expect(logs).toContain('Haciendo clic en botón de acción administrativo');
    expect(logs).toContain('Alerta confirmada/cancelada correctamente');
  }, 15000);
});
