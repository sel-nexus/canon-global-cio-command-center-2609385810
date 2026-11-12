/** Stub only server API calls; keep the real auth hook and browser token lifecycle. */
import { vi } from 'vitest';
import { apiClient, TOKEN_KEY } from '../services/apiClient.js';

export const serverAccount = { id: 'synthetic-account', username: 'demo', created_at: '2025-01-01T00:00:00Z' };
export const serverToken = 'synthetic-server-token';

/** Install explicit server responses, without a credential store or backend substitute. */
export function mockServerAuth(account = serverAccount) {
  return {
    me: vi.spyOn(apiClient, 'me').mockResolvedValue(account),
    register: vi.spyOn(apiClient, 'register').mockResolvedValue(account),
    login: vi.spyOn(apiClient, 'login').mockResolvedValue({ access_token: serverToken, token_type: 'bearer', account }),
    logout: vi.spyOn(apiClient, 'logout').mockResolvedValue(null),
  };
}

/** Seed a token whose identity must still be restored asynchronously through /me. */
export function seedServerSession(username = 'demo') {
  const boundary = mockServerAuth({ ...serverAccount, username });
  window.localStorage.setItem(TOKEN_KEY, serverToken);
  return boundary;
}
