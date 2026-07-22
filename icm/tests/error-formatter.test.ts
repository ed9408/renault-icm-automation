import { describe, expect, it } from 'bun:test';
import { formatError, formatErrorInline, getContext, isIcmError } from '../src/core/errors/error-formatter.ts';
import {
  SectionCaptureError,
  SelectorTimeoutError,
  HttpTransportError,
  VinUnknownError,
} from '../src/core/errors/domain-errors.ts';

describe('error-formatter', () => {
  it('formatea un IcmError con título, contexto y sugerencias', () => {
    const err = new SectionCaptureError(
      'falló el click',
      'historic',
      { vin: 'ABC123', section: 'historic' },
    );
    const out = formatError(err);

    expect(out).toContain('SectionCaptureError');
    expect(out).toContain('"historic"');
    expect(out).toContain('ABC123');
    expect(out).toContain('Sugerencias:');
    expect(out).toContain('selectores');
  });

  it('incluye htmlSnippet truncado', () => {
    const html = 'x'.repeat(2000);
    const err = new SelectorTimeoutError(
      'timeout',
      { selector: '#x', htmlSnippet: html },
    );
    const out = formatError(err, { htmlSnippetMaxChars: 100 });
    expect(out).toContain('truncado');
    expect(out.length).toBeLessThan(2000);
  });

  it('incluye stack trace cuando se pide', () => {
    const err = new SelectorTimeoutError('timeout');
    const out = formatError(err, { includeStack: true });
    expect(out).toContain('Stack trace');
  });

  it('incluye cause cuando está presente', () => {
    const original = new Error('native error');
    const err = new HttpTransportError(
      'fail',
      503,
      {},
      { cause: original } as ErrorOptions,
    );
    const out = formatError(err, { includeCause: true });
    expect(out).toContain('Causa');
    expect(out).toContain('native error');
  });

  it('isIcmError detecta IcmError', () => {
    expect(isIcmError(new SectionCaptureError('x', 'details'))).toBe(true);
    expect(isIcmError(new Error('native'))).toBe(false);
    expect(isIcmError('string')).toBe(false);
    expect(isIcmError(null)).toBe(false);
  });

  it('getContext devuelve contexto del error', () => {
    const err = new VinUnknownError('desconocido', { vin: 'X' });
    const ctx = getContext(err);
    expect(ctx.vin).toBe('X');
    expect(getContext(new Error('x')).vin).toBeUndefined();
  });

  it('formatErrorInline produce una sola línea', () => {
    const err = new SectionCaptureError('boom', 'details', { vin: 'V1' });
    const inline = formatErrorInline(err);
    expect(inline).not.toContain('\n');
    expect(inline).toContain('SectionCaptureError');
    expect(inline).toContain('vin=V1');
  });

  it('formatError maneja errores nativos (no IcmError)', () => {
    const err = new TypeError('bad input');
    const out = formatError(err);
    expect(out).toContain('TypeError');
    expect(out).toContain('bad input');
  });

  it('formatError maneja valores que no son errores', () => {
    const out = formatError(42);
    expect(out).toContain('NonError');
    expect(out).toContain('42');
  });
});