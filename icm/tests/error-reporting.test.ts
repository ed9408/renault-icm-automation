import { describe, expect, it } from 'bun:test';
import {
  ConfigError,
  SectionCaptureError,
} from '../src/core/errors/domain-errors.ts';
import { classifyError } from '../src/core/errors/error-classifier.ts';
import { formatError } from '../src/core/errors/error-formatter.ts';

/**
 * Estos tests verifican la integración entre el formateador y el clasificador,
 * que es exactamente lo que el orchestrator hace en cada `catch`.
 * Para evitar mockear el navegador completo validamos el pipeline
 * clasificador+formateador que alimenta al orchestrator.
 */

describe('VehicleOrchestrator error reporting (pipeline)', () => {
  it('un SectionCaptureError produce formato legible con sección y sugerencias', () => {
    const err = new SectionCaptureError('boom', 'historic', { vin: 'V1' });
    const classified = classifyError(err);

    const out = formatError(classified.error);

    expect(out).toContain('SectionCaptureError');
    expect(out).toContain('"historic"');
    expect(out).toContain('Sugerencias');
    expect(out).toContain('selectores');
    expect(out).toContain('V1');
    expect(classified.retryable).toBe(true);
  });

  it('un ConfigError se clasifica como no reintentable', () => {
    const err = new ConfigError('paths inválidos', {
      extra: { autoItExe: 'no existe' },
    });
    const classified = classifyError(err);
    expect(classified.retryable).toBe(false);
    expect(classified.type).toBe('ConfigError');

    const out = formatError(classified.error);
    expect(out).toContain('ConfigError');
    expect(out).toContain('configuración');
    expect(out).toContain('Sugerencias');
  });

  it('un error nativo de process() se clasifica antes de propagarse', () => {
    const native = new TypeError('no se pudo conectar al frame');
    const classified = classifyError(native, { phase: 'process', vin: 'V1' });

    // Preserva el nombre original para diagnóstico
    expect(classified.type).toBe('TypeError');
    // Envuelve en UnexpectedError (no ConfigError)
    expect(classified.error.name).toBe('UnexpectedError');
    expect(classified.error.message).toBe('no se pudo conectar al frame');
    expect(classified.retryable).toBe(true);

    // El contexto debe haberse mergeado
    expect(classified.error.context.vin).toBe('V1');
    expect(classified.error.context.phase).toBe('process');
    // El cause debe estar preservado
    expect((classified.error as Error & { cause?: unknown }).cause).toBe(native);
  });

  it('el formato incluye tags de reintentabilidad visibles', () => {
    const retryable = new SectionCaptureError('x', 'details');
    const fatal = new ConfigError('x');
    expect(formatError(retryable)).toContain('reintentable');
    expect(formatError(fatal)).toContain('fatal');
  });
});