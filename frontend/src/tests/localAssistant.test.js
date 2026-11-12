/** Exercise deterministic resolution and response-only storage trust boundaries. */
import { describe, expect, it, vi } from 'vitest';
import { resolveAssistantPrompt, readAssistantMessages, persistAssistantMessages } from '../services/localAssistant.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

const expected = {
  q4: 'Focus on innovation acceleration, risk reduction, and board readiness initiatives.',
  tcs: 'TCS partnership expansion recommended based on ROI growth and delivery performance.',
  risk: 'Strengthen cybersecurity posture and compliance tracking across regions.',
  innovation: 'Increase investment in AI/ML and automation pipelines to drive long-term value.',
};
const fallback = 'Only the supported demo topics Q4, TCS, risk, and innovation are available.';
const message = { id: 'local-1', role: 'assistant', text: expected.q4, createdAt: '2026-01-15T10:00:00.000Z' };

/** Store a deliberately untrusted serialized value for restoration checks. */
function seed(value) {
  window.localStorage.setItem(STORAGE_KEYS.assistant, JSON.stringify(value));
}

describe('local prompt resolution', () => {
  it.each(Object.keys(expected))('maps %s deterministically at the end of a long supported prompt', (keyword) => {
    const prompt = `${'x'.repeat(10000)} (${keyword.toUpperCase()})!`;
    expect(resolveAssistantPrompt(prompt)).toEqual({ keyword, text: expected[keyword] });
    expect(resolveAssistantPrompt(prompt)).toEqual({ keyword, text: expected[keyword] });
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps fixed topic priority and fallback for long supported and unsupported prompts', () => {
    const supported = `innovation ${'x'.repeat(10000)} risk TCS Q4`;
    const unsupported = `${'x'.repeat(10000)} brisk innovations q40 tcs2 <script>alert(1)</script>`;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      expect(resolveAssistantPrompt(supported)).toEqual({ keyword: 'q4', text: expected.q4 });
      expect(resolveAssistantPrompt(unsupported)).toEqual({ keyword: null, text: fallback });
    }
    expect(window.localStorage.length).toBe(0);
  });

  it.each(Object.keys(expected))('matches %s case-insensitively with punctuation and whitespace boundaries', (keyword) => {
    for (const prompt of [keyword, keyword.toUpperCase(), `\n(${keyword})!`, `plan: ${keyword}-ready`]) {
      expect(resolveAssistantPrompt(prompt)).toEqual({ keyword, text: expected[keyword] });
    }
  });

  it.each(['innovation risk tcs Q4', 'innovation risk TCS', 'innovation RISK'])('uses fixed priority independent of token order: %s', (prompt) => {
    const keyword = prompt.includes('Q4') ? 'q4' : prompt.includes('TCS') ? 'tcs' : 'risk';
    expect(resolveAssistantPrompt(prompt)).toEqual({ keyword, text: expected[keyword] });
  });

  it.each(['aq4', 'q40', 'tcs2', 'atcs', 'brisk', 'risks', 'innovations', 'innovationary', 'risk_score', '_q4', 'érisk', 'risk中', '', '  ', 'unsupported', null, undefined, 4, {}, [], false])('uses a deterministic fallback for unsupported or invalid input %j', (prompt) => {
    expect(resolveAssistantPrompt(prompt)).toEqual({ keyword: null, text: fallback });
  });

  it('performs no storage or network operation during resolution', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    resolveAssistantPrompt('risk');
    expect(writes).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });
});

describe('response persistence', () => {
  it('accepts absent and empty history without writing on restoration', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    expect(readAssistantMessages()).toEqual({ messages: [], available: true });
    expect(writes).not.toHaveBeenCalled();
    expect(persistAssistantMessages([])).toEqual({ ok: true });
    expect(readAssistantMessages()).toEqual({ messages: [], available: true });
  });

  it('round-trips all fixed responses and fallback in the versioned response-only shape', () => {
    const messages = [...Object.values(expected), fallback].map((text, index) => ({ ...message, id: `local-${index + 1}`, text }));
    expect(persistAssistantMessages(messages)).toEqual({ ok: true });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.assistant))).toEqual({ version: 1, messages });
    expect(readAssistantMessages()).toEqual({ messages, available: true });
  });

  it.each([null, [], {}, { version: 2, messages: [] }, { version: '1', messages: [] }, { version: 1 }, { version: 1, messages: {} }, { version: 1, messages: [], prompt: 'private' }])('rejects malformed or unsupported history %j without modifying it', (value) => {
    seed(value);
    const raw = window.localStorage.getItem(STORAGE_KEYS.assistant);
    expect(readAssistantMessages()).toEqual({ messages: [], available: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(raw);
  });

  it('rejects malformed JSON without removing it', () => {
    window.localStorage.setItem(STORAGE_KEYS.assistant, '{broken');
    expect(readAssistantMessages()).toEqual({ messages: [], available: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe('{broken');
  });

  it.each([
    null, [], {}, { ...message, role: 'user' }, { ...message, text: 'private prompt' },
    { ...message, text: '<img src=x onerror=alert(1)>' }, { ...message, prompt: 'private' },
    { ...message, id: '' }, { ...message, id: 1 }, { ...message, id: 'local-0' },
    { ...message, id: 'local-01' }, { ...message, id: 'local-9007199254740991' },
    { ...message, id: 'local-99999999999999999999999999' }, { ...message, createdAt: null },
    { ...message, createdAt: 'not-a-date' }, { ...message, createdAt: '2026-02-30T10:00:00.000Z' },
    { ...message, createdAt: '2026-01-15' }, { ...message, text: null },
  ])('rejects invalid response records on both read and write %j', (bad) => {
    seed({ version: 1, messages: [bad] });
    const raw = window.localStorage.getItem(STORAGE_KEYS.assistant);
    expect(readAssistantMessages().available).toBe(false);
    expect(persistAssistantMessages([bad])).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(raw);
  });

  it.each([undefined, null, {}, [message, message]])('rejects invalid collections and duplicate IDs %j', (messages) => {
    expect(persistAssistantMessages(messages)).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBeNull();
    seed({ version: 1, messages });
    expect(readAssistantMessages().available).toBe(false);
  });

  it('returns unavailable when reading storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readAssistantMessages()).toEqual({ messages: [], available: false, code: 'STORAGE_UNAVAILABLE' });
  });

  it.each(['SecurityError', 'QuotaExceededError'])('reports %s without replacing prior history', (name) => {
    persistAssistantMessages([message]);
    const raw = window.localStorage.getItem(STORAGE_KEYS.assistant);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', name); });
    expect(persistAssistantMessages([{ ...message, id: 'local-2' }])).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(raw);
  });

  it('guards denied localStorage property access for reads and writes', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
    try {
      expect(readAssistantMessages().code).toBe('STORAGE_UNAVAILABLE');
      expect(persistAssistantMessages([message]).code).toBe('STORAGE_WRITE_FAILED');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});
