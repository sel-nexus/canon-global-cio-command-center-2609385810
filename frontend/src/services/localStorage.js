/** Guard origin-local JSON operations; preserve malformed data for explicit recovery. */
export const STORAGE_KEYS = Object.freeze({
  accounts: 'canonCio.accounts.v1',
  session: 'canonCio.session.v1',
  assistant: 'canonCio.assistant.v1',
});

/** Read and validate JSON without trusting a missing or corrupt record.
 * Args:
 *   key: Origin-local storage item.
 *   validate: Predicate for the supported version and record shape.
 * Returns:
 *   A missing/value result or a recoverable error code; never throws.
 */
export function readJson(key, validate) {
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
  if (raw === null) return { ok: true, value: null };
  try {
    const value = JSON.parse(raw);
    if (!validate(value)) return { ok: false, code: 'INVALID_LOCAL_STATE' };
    return { ok: true, value };
  } catch {
    return { ok: false, code: 'INVALID_LOCAL_STATE' };
  }
}

/** Serialize and persist a record only when storage accepts the write.
 * Args:
 *   key: Storage item to replace after validation by the caller.
 *   value: Serializable versioned record.
 * Returns:
 *   Success or a write-failure code; never throws.
 */
export function writeJson(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) return { ok: false, code: 'STORAGE_WRITE_FAILED' };
    window.localStorage.setItem(key, raw);
    return { ok: true };
  } catch {
    return { ok: false, code: 'STORAGE_WRITE_FAILED' };
  }
}

/** Remove only the requested item, reporting denied removal truthfully.
 * Args:
 *   key: Item explicitly selected for removal.
 * Returns:
 *   Success or a storage-unavailable code; never throws.
 */
export function removeItem(key) {
  try {
    window.localStorage.removeItem(key);
    return { ok: true };
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
}
