/** Exercise guarded storage operations with real origin-local state and denied boundaries. */
import { describe, expect, it, vi } from 'vitest';
import { readJson, writeJson, removeItem } from '../services/localStorage.js';

describe('guarded JSON storage', () => {
  it('distinguishes missing data and round-trips a supported record', () => {
    expect(readJson('test', () => true)).toEqual({ ok: true, value: null });
    expect(writeJson('test', { version: 1 })).toEqual({ ok: true });
    expect(readJson('test', (value) => value.version === 1)).toEqual({ ok: true, value: { version: 1 } });
    expect(removeItem('test')).toEqual({ ok: true });
    expect(window.localStorage.getItem('test')).toBeNull();
    expect(removeItem('test')).toEqual({ ok: true });
  });

  it.each(['{', 'null', '[]', '{"version":2}'])('preserves malformed/unsupported raw data %s', (raw) => {
    window.localStorage.setItem('test', raw);
    expect(readJson('test', (value) => value?.version === 1)).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem('test')).toBe(raw);
  });

  it('contains a validator exception without changing data', () => {
    window.localStorage.setItem('test', '{}');
    expect(readJson('test', () => { throw new Error('bad schema'); })).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem('test')).toBe('{}');
  });

  it('maps denied reads to unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readJson('test', () => true)).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
  });

  it.each(['SecurityError', 'QuotaExceededError'])('preserves saved data on %s writes', (name) => {
    window.localStorage.setItem('test', 'original');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('failed', name); });
    expect(writeJson('test', {})).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(window.localStorage.getItem('test')).toBe('original');
  });

  it('rejects unserializable and undefined values without writing', () => {
    const circular = {};
    circular.self = circular;
    expect(writeJson('test', circular)).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(writeJson('test', undefined)).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(window.localStorage.getItem('test')).toBeNull();
  });

  it('preserves the item when removal is denied', () => {
    window.localStorage.setItem('test', 'original');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(removeItem('test')).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    expect(window.localStorage.getItem('test')).toBe('original');
  });

  it('catches storage getter failures for all operations', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
    expect(readJson('test', () => true)).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    expect(writeJson('test', {})).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(removeItem('test')).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
  });
});
