/** Send the shared server auth contract over same-origin HTTP by default. */
export const TOKEN_KEY = 'canon.server.access-token';
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Carry a safe HTTP error without exposing submitted credentials. */
export class ApiError extends Error {
  constructor(message, status = 0, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/** Read only a server token; never inspect or migrate local demo accounts. */
export function readToken() {
  try { return window.localStorage.getItem(TOKEN_KEY); }
  catch { throw new ApiError('Browser session storage is unavailable.'); }
}

/** Save or remove only the bearer token issued by the server. */
export function storeToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { throw new ApiError('Browser session storage could not be updated.'); }
}

/** Require an HTTP success and return JSON, keeping auth failures inline. */
async function request(path, { method = 'GET', body, token, signal } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method, signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('The server is unavailable. Try again.');
  }
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).detail; }
    catch { detail = null; }
    const field = Array.isArray(detail) ? detail[0]?.loc?.at(-1) : undefined;
    const message = response.status === 401 ? 'Username or password does not match, or the session has expired.'
      : response.status === 409 ? 'This username already exists. Log in instead.'
        : response.status === 422 ? (path.includes('/assistant/') ? 'Check your prompt or history page parameters.' : 'Check your username and password lengths.')
          : 'The server could not complete this request. Try again.';
    throw new ApiError(message, response.status, field);
  }
  if (response.status === 204) return null;
  try { return await response.json(); }
  catch { throw new ApiError('The server returned an invalid response.'); }
}

/** Reject incomplete server account responses before exposing authenticated UI. */
function validateAccount(account) {
  if (!account || typeof account.id !== 'string' || typeof account.username !== 'string'
      || !account.username || typeof account.created_at !== 'string') {
    throw new ApiError('The server returned an invalid account response.');
  }
  return account;
}

/** Validate response-only records before any history is displayed. */
function validateMessage(message) {
  if (!message || typeof message.id !== 'string' || !message.id || message.role !== 'assistant'
      || typeof message.text !== 'string' || typeof message.created_at !== 'string'
      || !Number.isFinite(Date.parse(message.created_at))) {
    throw new ApiError('The server returned an invalid assistant response.');
  }
  return message;
}

export const apiClient = {
  /** Persist a server account without starting a session. */
  async register(credentials) {
    return validateAccount(await request('/api/v1/auth/register', { method: 'POST', body: credentials }));
  },
  /** Obtain a signed, revocable server session. */
  async login(credentials) {
    const result = await request('/api/v1/auth/login', { method: 'POST', body: credentials });
    if (!result || typeof result.access_token !== 'string' || !result.access_token) {
      throw new ApiError('The server returned an invalid session response.');
    }
    validateAccount(result.account);
    return result;
  },
  /** Ask the server to validate a token before trusting its account. */
  async me(token, signal) {
    return validateAccount(await request('/api/v1/auth/me', { token, signal }));
  },
  /** Read a bounded owner-scoped history page; never read browser history. */
  async assistantHistory(token, signal, limit = 100, offset = 0) {
    const result = await request(`/api/v1/assistant/messages?limit=${limit}&offset=${offset}`, { token, signal });
    if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total)
        || result.total < result.items.length || result.items.length > limit) {
      throw new ApiError('The server returned invalid assistant history.');
    }
    result.items.forEach(validateMessage);
    return result;
  },
  /** Ask the server to resolve and persist a response, without local fallback. */
  async assistantMessage(token, prompt, signal) {
    return validateMessage(await request('/api/v1/assistant/messages', {
      method: 'POST', token, signal, body: { prompt },
    }));
  },
  /** Revoke the current bearer session server-side. */
  logout: (token) => request('/api/v1/auth/logout', { method: 'POST', token }),
};
