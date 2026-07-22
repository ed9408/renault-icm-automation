import { describe, expect, it } from 'bun:test';
import { classifyError } from '../src/core/errors/error-classifier.ts';
import {
  ConfigError,
  HttpTransportError,
  IcmError,
  UnexpectedError,
  VinUnknownError,
} from '../src/core/errors/domain-errors.ts';

describe('error-classifier', () => {
  it('devuelve el mismo IcmError sin envolver', () => {
    const original = new VinUnknownError('x', { vin: 'V1' });
    const classified = classifyError(original);
    expect(classified.error).toBe(original);
    expect(classified.type).toBe('VinUnknownError');
    expect(classified.retryable).toBe(false);
  });

  it('envuelve un Error nativo en UnexpectedError', () => {
    const original = new Error('boom');
    const classified = classifyError(original, { phase: 'test' });
    expect(classified.error).toBeInstanceOf(UnexpectedError);
    expect(classified.type).toBe('Error');
    expect(classified.retryable).toBe(true);
    // cause preservado
    expect((classified.error as Error & { cause?: unknown }).cause).toBe(original);
  });

  it('envuelve AbortError preservando el nombre', () => {
    const original = new Error('aborted');
    original.name = 'AbortError';
    const classified = classifyError(original);
    expect(classified.type).toBe('AbortError');
  });

  it('envuelve valores no-error', () => {
    const classified = classifyError('oops');
    expect(classified.error).toBeInstanceOf(UnexpectedError);
    expect(classified.type).toBe('NonError');
    expect(classified.error.message).toContain('oops');
  });

  it('mergea contexto extra con el contexto existente', () => {
    const original = new HttpTransportError('x', 500, { vin: 'V1' });
    const classified = classifyError(original, { phase: 'send', section: 'details' });
    expect(classified.error.context.vin).toBe('V1');
    expect(classified.error.context.phase).toBe('send');
    expect(classified.error.context.section).toBe('details');
  });

  it('clasifica ConfigError como no reintentable', () => {
    const err = new ConfigError('bad config');
    const classified = classifyError(err);
    expect(classified.retryable).toBe(false);
    expect(classified.type).toBe('ConfigError');
  });

  it('preserva la propiedad `retryable` específica de cada subclase', () => {
    expect(classifyError(new HttpTransportError('x')).retryable).toBe(true);
    expect(classifyError(new VinUnknownError('x')).retryable).toBe(false);
    expect(classifyError(new ConfigError('x')).retryable).toBe(false);
  });

  it('mantiene el tipo IcmError en el resultado', () => {
    const classified = classifyError(new Error('x'));
    expect(classified.error).toBeInstanceOf(IcmError);
  });
});