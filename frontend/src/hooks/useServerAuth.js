/** Restore identity exclusively through the server and expose async session states. */
import { useEffect, useRef, useState } from 'react';
import { apiClient, readToken, storeToken } from '../services/apiClient.js';

/** Keep credentials disposable and fail closed on invalid server sessions. */
export function useServerAuth() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const tokenRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    /** Bootstrap through /me; a browser token alone grants no access. */
    async function restore() {
      try {
        const token = readToken();
        if (token) {
          const restored = await apiClient.me(token, controller.signal);
          if (active) { tokenRef.current = token; setAccount(restored); }
        }
      } catch (failure) {
        if (!active || failure.name === 'AbortError') return;
        if (failure.status === 401) {
          let message = 'Your session has expired. Log in again.';
          try { storeToken(null); }
          catch (storageError) { message += ` ${storageError.message}`; }
          setError(message);
        } else setError(failure.message);
      } finally { if (active) setLoading(false); }
    }
    restore();
    return () => { active = false; controller.abort(); };
  }, []);

  /** Serialize explicit auth mutations and return safe errors to the form. */
  async function submit(mode, credentials) {
    if (busy.current) return { ok: false, message: 'A request is already pending.' };
    busy.current = true;
    setPending(true);
    setError('');
    try {
      if (mode === 'signup') await apiClient.register(credentials);
      else {
        const result = await apiClient.login(credentials);
        // Retain the token in memory before storage so a failed save can still be revoked.
        tokenRef.current = result.access_token;
        setAccount(result.account);
        try { storeToken(result.access_token); }
        catch (storageError) { setError(`${storageError.message} This session will not survive reload.`); }
      }
      return { ok: true };
    } catch (failure) {
      return { ok: false, message: failure.message, field: failure.field };
    } finally { busy.current = false; setPending(false); }
  }

  /** Keep the shell on network failure; clear identity only after revocation or 401. */
  async function logout() {
    if (busy.current) return { ok: false };
    busy.current = true;
    setPending(true);
    setError('');
    try {
      try { await apiClient.logout(tokenRef.current); }
      catch (failure) { if (failure.status !== 401) throw failure; }
      tokenRef.current = null;
      setAccount(null);
      try { storeToken(null); }
      catch (storageError) { setError(`${storageError.message} The server session is revoked.`); }
      return { ok: true };
    } catch (failure) {
      setError(`${failure.message} You are still signed in; retry logout.`);
      return { ok: false };
    } finally { busy.current = false; setPending(false); }
  }

  return { account, loading, pending, error, submit, logout };
}
