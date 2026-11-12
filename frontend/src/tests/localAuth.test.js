/** Verify all demo lifecycle branches and durable state, without mocking application services. */
import { describe, expect, it, vi } from 'vitest';
import { validateCredentials, registerAccount, login, readSession, logout } from '../services/localAuth.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

const credentials = { username: 'CIO.demo', password: ' x ' };
const account = { ...credentials, createdAt: '2026-01-15T10:00:00.000Z' };

describe('required credential validation', () => {
  it.each([undefined, null, {}, { username: '' }, { username: ' ' }, { username: 42 }, { username: [] }])(
    'rejects missing/non-string username %j', (value) => {
      expect(validateCredentials(value)).toEqual({ ok: false, code: 'REQUIRED_USERNAME', field: 'username' });
      expect(registerAccount(value).ok).toBe(false);
      expect(login(value).ok).toBe(false);
      expect(window.localStorage.length).toBe(0);
    },
  );
  it.each([undefined, null, '', '   ', 42, []])('rejects missing/non-string password %j', (password) => {
    const value = { username: 'demo', password };
    expect(validateCredentials(value)).toEqual({ ok: false, code: 'REQUIRED_PASSWORD', field: 'password' });
    expect(registerAccount(value).ok).toBe(false);
    expect(login(value).ok).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
  it('accepts a single character password and arbitrary non-empty username without extra policy', () => {
    expect(validateCredentials({ username: ' <demo> ', password: 'a' })).toEqual({ ok: true });
  });
});

describe('local demo account lifecycle', () => {
  it('registers, appends, matches normalized username, restores, and logs out without deleting accounts/history', () => {
    const result = registerAccount({ ...credentials, username: ' CIO.demo ' });
    expect(result).toEqual({ ok: true, account: { username: 'CIO.demo', createdAt: expect.any(String) } });
    expect(result.account).not.toHaveProperty('password');
    expect(readSession()).toEqual({ signedIn: false, storageAvailable: true });
    expect(registerAccount({ username: 'other', password: 'a' }).ok).toBe(true);
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    expect(JSON.parse(saved).accounts).toHaveLength(2);
    expect(JSON.parse(saved).accounts[0].password).toBe(' x ');
    const signedIn = login({ username: ' cio.DEMO ', password: ' x ' });
    expect(signedIn.account).toEqual(result.account);
    expect(signedIn.account).not.toHaveProperty('password');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.session))).toEqual({ version: 1, username: 'CIO.demo' });
    expect(readSession()).toEqual({ signedIn: true, username: 'CIO.demo', storageAvailable: true });
    window.localStorage.setItem(STORAGE_KEYS.assistant, 'keep history');
    expect(logout()).toEqual({ ok: true });
    expect(logout()).toEqual({ ok: true });
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe('keep history');
    expect(readSession().signedIn).toBe(false);
  });

  it('rejects normalized duplicates without replacing any saved records', () => {
    registerAccount(credentials);
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    expect(registerAccount({ username: ' cio.DEMO ', password: 'new' })).toEqual({ ok: false, code: 'DUPLICATE_USERNAME', field: 'username' });
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
  });

  it.each(['x', ' X ', 'wrong'])('requires exact password comparison for %s', (password) => {
    registerAccount(credentials);
    expect(login({ username: credentials.username, password })).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it('returns generic invalid credentials for missing accounts and unknown usernames', () => {
    expect(login(credentials)).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    registerAccount(credentials);
    expect(login({ username: 'unknown', password: ' x ' })).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it.each([
    '{', 'null', '[]', '{"version":2,"accounts":[]}', '{"version":1,"accounts":{}}',
    ...[null, {}, { ...account, username: ' ' }, { ...account, username: 1 },
      { ...account, password: '' }, { ...account, password: 1 },
      { ...account, createdAt: null }, { ...account, createdAt: 'invalid' }]
      .map((record) => JSON.stringify({ version: 1, accounts: [record] })),
    JSON.stringify({ version: 1, accounts: [account, { ...account, username: ' cio.DEMO ' }] }),
  ])('preserves corrupt accounts and fails both actions closed for %s', (raw) => {
    window.localStorage.setItem(STORAGE_KEYS.accounts, raw);
    expect(registerAccount(credentials)).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(login(credentials)).toEqual({ ok: false, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(raw);
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it('fails registration and login on denied reads', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(registerAccount(credentials)).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    expect(login(credentials)).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
  });

  it.each(['QuotaExceededError', 'SecurityError'])('does not claim saved account/session on %s', (name) => {
    registerAccount(credentials);
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('failed', name); });
    expect(registerAccount({ username: 'new', password: 'a' })).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(login(credentials)).toEqual({ ok: false, code: 'STORAGE_WRITE_FAILED' });
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
  });
});

describe('session restoration and removal', () => {
  it.each(['{', 'null', '[]', '{}', '{"version":2,"username":"demo"}',
    '{"version":1,"username":42}', '{"version":1,"username":" "}'])('rejects and preserves invalid marker %s', (raw) => {
    window.localStorage.setItem(STORAGE_KEYS.session, raw);
    expect(readSession()).toEqual({ signedIn: false, storageAvailable: true, code: 'INVALID_LOCAL_STATE' });
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBe(raw);
  });
  it('restores a valid marker without inventing account revalidation', () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":" demo "}');
    expect(readSession()).toEqual({ signedIn: true, username: 'demo', storageAvailable: true });
  });
  it('stays signed out on denied restore', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readSession()).toEqual({ signedIn: false, storageAvailable: false, code: 'STORAGE_UNAVAILABLE' });
  });
  it('keeps session/accounts on failed logout', () => {
    registerAccount(credentials);
    login(credentials);
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(logout()).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    expect(readSession().signedIn).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
  });
});
