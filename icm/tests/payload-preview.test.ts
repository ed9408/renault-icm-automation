import { describe, expect, it } from 'bun:test';
import {
  formatReportAuditPayload,
  formatSetVinDataPayload,
} from '../src/infrastructure/api/payload-preview.ts';
import { CMD } from '../src/infrastructure/api/api-commands.ts';
import type { AuditEntry } from '../src/domain/models/audit-entry.ts';
import type {
  AdminValues,
  HtmlChunk,
  VehicleContext,
  VehicleReport,
} from '../src/domain/models/vehicle.ts';

const ctx: VehicleContext = {
  id: '42',
  vin: 'VF1ABC1234567890',
  tipo: 'sedan',
  km: '12345',
};

const adminValues: AdminValues = {
  tipo_vh: 'sedan',
  tipo_mot: '1.6',
  tipo_caja: 'manual',
  num_fab: 'NF-001',
  fecha_entrega: '2024-01-15',
};

function chunk(html: string, b64: string, values?: AdminValues): HtmlChunk {
  return { html, b64, ...(values ? { values } : {}) };
}

describe('formatSetVinDataPayload', () => {
  it('produce objeto con las claves exactas del wire (root)', () => {
    const out = formatSetVinDataPayload(ctx, {});
    expect(Object.keys(out).sort()).toEqual([
      'cmd',
      'data',
      'id',
      'km',
      'tipo',
      'vin',
    ]);
  });

  it('cmd es exactamente CMD.setVinData', () => {
    const out = formatSetVinDataPayload(ctx, {});
    expect(out.cmd).toBe(CMD.setVinData);
    expect(out.cmd).toBe('set_vin_data');
  });

  it('propaga id/vin/tipo/km del contexto', () => {
    const out = formatSetVinDataPayload(ctx, {});
    expect(out.id).toBe(ctx.id);
    expect(out.vin).toBe(ctx.vin);
    expect(out.tipo).toBe(ctx.tipo);
    expect(out.km).toBe(ctx.km);
  });

  it('cada chunk del report mantiene claves { b64, html, values } (no b64Len/preview)', () => {
    const report: VehicleReport = {
      details: chunk('<div>d</div>', 'PGRpdj5kPC9kaXY+', adminValues),
      historic: chunk('<span>h</span>', 'PHNwb24+aDwvc3Bhbj4='),
      agreements: chunk('<i>a</i>', 'PGk+YTwvaT4='),
      maintains: chunk('<b>m</b>', 'PGI+bTwvYj4='),
      ots: chunk('<u>o</u>', 'PHU+bzwvdT4='),
      recmant: chunk('<em>r</em>', 'PGVtPnI8L2VtPg=='),
      admin: chunk('<s>a</s>', 'PHM+YTwvcz4='),
      adminData: adminValues,
    };
    const out = formatSetVinDataPayload(ctx, report);
    const data = out.data as Record<string, Record<string, unknown>>;

    for (const key of [
      'details',
      'historic',
      'agreements',
      'maintains',
      'ots',
      'recmant',
      'admin',
    ]) {
      const section = data[key] as Record<string, unknown>;
      expect(Object.keys(section).sort()).toContain('b64');
      expect(Object.keys(section).sort()).toContain('html');
      // No debe haber rastro del formato viejo:
      expect(Object.keys(section)).not.toContain('b64Len');
      expect(Object.keys(section)).not.toContain('preview');
    }
  });

  it('preserva values del chunk', () => {
    const report: VehicleReport = {
      details: chunk('<div/>', 'PGRpdj4=', adminValues),
    };
    const out = formatSetVinDataPayload(ctx, report);
    const data = out.data as Record<string, Record<string, unknown>>;
    const details = data.details as Record<string, unknown>;
    expect(details.values).toEqual(adminValues);
  });

  it('omite values si el chunk no lo trae', () => {
    const report: VehicleReport = {
      historic: chunk('<span/>', 'PHNhbj4='),
    };
    const out = formatSetVinDataPayload(ctx, report);
    const data = out.data as Record<string, Record<string, unknown>>;
    const historic = data.historic as Record<string, unknown>;
    expect(Object.keys(historic).sort()).toEqual(['b64', 'html']);
  });

  it('preserva adminData a nivel raíz (no HtmlChunk) tal cual', () => {
    const report: VehicleReport = {
      details: chunk('<d/>', 'PGRkLz4='),
      adminData: adminValues,
    };
    const out = formatSetVinDataPayload(ctx, report);
    const data = out.data as Record<string, unknown>;
    expect(data.adminData).toEqual(adminValues);
  });

  it('omite secciones undefined del report', () => {
    const out = formatSetVinDataPayload(ctx, {
      details: chunk('<d/>', 'PGRkLz4='),
      historic: undefined,
      agreements: undefined,
    });
    const data = out.data as Record<string, unknown>;
    // Solo debe quedar `details`; los undefined se descartan.
    expect(Object.keys(data).sort()).toEqual(['details']);
  });

  it('NO trunca b64 cortos', () => {
    const short = 'PGRpdj5kPC9kaXY+'; // <div>d</div>
    const out = formatSetVinDataPayload(ctx, {
      details: chunk('<div>d</div>', short),
    });
    const data = out.data as Record<string, Record<string, unknown>>;
    const details = data.details as Record<string, unknown>;
    expect(details.b64).toBe(short);
    expect(details.html).toBe('<div>d</div>');
  });

  it('trunca b64 largos (>200 chars) con marker que conserva longitud original', () => {
    const long = 'A'.repeat(500);
    const out = formatSetVinDataPayload(ctx, {
      details: chunk('<x/>', long),
    });
    const data = out.data as Record<string, Record<string, unknown>>;
    const details = data.details as Record<string, unknown>;
    const b64Out = details.b64 as string;
    expect(b64Out.startsWith('A'.repeat(200))).toBe(true);
    expect(b64Out).toContain('…[truncated:500]');
  });

  it('trunca html largos (>200 chars) con marker', () => {
    const longHtml = '<x>'.repeat(500);
    const out = formatSetVinDataPayload(ctx, {
      details: chunk(longHtml, 'PGRpdj4='),
    });
    const data = out.data as Record<string, Record<string, unknown>>;
    const details = data.details as Record<string, unknown>;
    const htmlOut = details.html as string;
    expect(htmlOut.endsWith('…[truncated:1500]')).toBe(true);
  });

  it('un b64 exactamente de 200 chars NO se trunca', () => {
    const exact = 'B'.repeat(200);
    const out = formatSetVinDataPayload(ctx, {
      details: chunk('<x/>', exact),
    });
    const data = out.data as Record<string, Record<string, unknown>>;
    const details = data.details as Record<string, unknown>;
    expect(details.b64).toBe(exact);
  });
});

describe('formatReportAuditPayload', () => {
  it('produce objeto con claves exactas { cmd, actions } (sin count)', () => {
    const out = formatReportAuditPayload([]);
    expect(Object.keys(out).sort()).toEqual(['actions', 'cmd']);
  });

  it('cmd es exactamente CMD.reportAudit', () => {
    const out = formatReportAuditPayload([]);
    expect(out.cmd).toBe(CMD.reportAudit);
    expect(out.cmd).toBe('report_auditory');
  });

  it('preserva todas las claves de cada AuditEntry', () => {
    const entries: AuditEntry[] = [
      {
        id: '1',
        vin: 'VF1',
        action: 'login',
        date: 1700000000000,
        dateFull: '2024-01-15 10:00:00',
      },
      {
        id: '2',
        vin: 'VF2',
        action: 'capture_details',
        date: 1700000060000,
        dateFull: '2024-01-15 10:01:00',
      },
    ];
    const out = formatReportAuditPayload(entries);
    const actions = out.actions as Array<Record<string, unknown>>;
    expect(actions.length).toBe(2);
    expect(actions[0]).toEqual({
      id: '1',
      vin: 'VF1',
      action: 'login',
      date: 1700000000000,
      dateFull: '2024-01-15 10:00:00',
    });
  });

  it('actions vacío produce array vacío', () => {
    const out = formatReportAuditPayload([]);
    expect(out.actions).toEqual([]);
  });
});
