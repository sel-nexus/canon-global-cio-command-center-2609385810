/** Manage inspectable demo credentials, never trusted identity or authorization. */
import { readJson, writeJson, removeItem, STORAGE_KEYS } from './localStorage.js';

/** Accept a non-empty trimmed username without inventing format restrictions. */
function validUsername(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Accept required passwords while retaining the exact entered value. */
function validPassword(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Compare usernames using the local trim/case-insensitive convention. */
function normalize(value) {
  return value.trim().toLowerCase();
}

/** Reject unsupported or damaged account collections without rewriting them. */
function validAccounts(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.accounts)) return false;
  const names = new Set();
  return value.accounts.every((account) => {
    if (!account || !validUsername(account.username) || !validPassword(account.password)
      || typeof account.createdAt !== 'string' || !Number.isFinite(Date.parse(account.createdAt))) return false;
    const name = normalize(account.username);
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
}

/** Validate only the required credential fields at the submit boundary. */
export function validateCredentials(credentials) {
  if (!validUsername(credentials?.username)) {
    return { ok: false, code: 'REQUIRED_USERNAME', field: 'username' };
  }
  if (!validPassword(credentials?.password)) {
    return { ok: false, code: 'REQUIRED_PASSWORD', field: 'password' };
  }
  return { ok: true };
}

/** Return only safe display fields, never the inspectable stored password. */
function summary(account) {
  return { username: account.username, createdAt: account.createdAt };
}

/** Save a new demo account only after required validation and duplicate checks.
 * Args:
 *   credentials: Username and exact demo-only password submitted explicitly.
 * Returns:
 *   Account summary without password, or an actionable local error.
 */
export function registerAccount(credentials) {
  const checked = validateCredentials(credentials);
  if (!checked.ok) return checked;
  const stored = readJson(STORAGE_KEYS.accounts, validAccounts);
  if (!stored.ok) return stored;
  const accounts = stored.value?.accounts || [];
  const username = credentials.username.trim();
  if (accounts.some((account) => normalize(account.username) === normalize(username))) {
    return { ok: false, code: 'DUPLICATE_USERNAME', field: 'username' };
  }
  const account = { username, password: credentials.password, createdAt: new Date().toISOString() };
  const saved = writeJson(STORAGE_KEYS.accounts, { version: 1, accounts: [...accounts, account] });
  return saved.ok ? { ok: true, account: summary(account) } : saved;
}

/** Match local demo credentials and write a marker only on exact password match.
 * Args:
 *   credentials: Submitted username and unmodified password.
 * Returns:
 *   Account summary without password or failure; never grants trusted access.
 */
export function login(credentials) {
  const checked = validateCredentials(credentials);
  if (!checked.ok) return checked;
  const stored = readJson(STORAGE_KEYS.accounts, validAccounts);
  if (!stored.ok) return stored;
  const match = stored.value?.accounts.find((account) =>
    normalize(account.username) === normalize(credentials.username) && account.password === credentials.password);
  if (!match) return { ok: false, code: 'INVALID_CREDENTIALS' };
  const saved = writeJson(STORAGE_KEYS.session, { version: 1, username: match.username });
  return saved.ok ? { ok: true, account: summary(match) } : saved;
}

/** Restore only a structurally valid current-version demo marker.
 * Returns:
 *   Signed-in display state or signed-out state with a recoverable notice.
 * Notes:
 *   Markers are intentionally not checked against a trusted account authority.
 */
export function readSession() {
  const stored = readJson(STORAGE_KEYS.session, (value) =>
    Boolean(value && value.version === 1 && validUsername(value.username)));
  if (!stored.ok) {
    return { signedIn: false, storageAvailable: stored.code !== 'STORAGE_UNAVAILABLE', code: stored.code };
  }
  if (!stored.value) return { signedIn: false, storageAvailable: true };
  return { signedIn: true, username: stored.value.username.trim(), storageAvailable: true };
}

/** Clear the session marker only; keep accounts and report failed removal. */
export function logout() {
  return removeItem(STORAGE_KEYS.session);
}
