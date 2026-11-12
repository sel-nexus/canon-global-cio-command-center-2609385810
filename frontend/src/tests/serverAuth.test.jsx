/** Test the real frontend HTTP boundary without trusting local demo credentials. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { useServerAuth } from '../hooks/useServerAuth.js';
import { apiClient, TOKEN_KEY } from '../services/apiClient.js';

const account = { id: 'a1', username: 'server.cio', created_at: '2025-01-01T00:00:00Z' };

/** Return an HTTP-shaped response so apiClient parsing remains under test. */
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Fill the visible two-field account form. */
async function submit(user, username, password, button = 'Log in') {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: button, exact: true }));
}

beforeEach(() => { window.localStorage.clear(); vi.stubGlobal('fetch', vi.fn()); });

describe('server account UI', () => {
  it('ignores local accounts/session and preserves the public login root', async () => {
    window.localStorage.setItem('canon.demo.accounts.v1', JSON.stringify([{ username: 'local', password: 'plain' }]));
    window.localStorage.setItem('canon.demo.session.v1', JSON.stringify({ username: 'local' }));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/not imported/)).toBeVisible();
  });

  it('registers through HTTP then logs in, restores and revokes on logout', async () => {
    fetch.mockImplementation(async (path, options) => {
      if (path.endsWith('/register')) return response(201, account);
      if (path.endsWith('/login')) return response(200, { access_token: 'server-token', token_type: 'bearer', account });
      if (path.endsWith('/me')) {
        expect(options.headers.Authorization).toBe('Bearer server-token');
        return response(200, account);
      }
      if (path.endsWith('/logout')) return response(204);
      throw new Error('Unexpected endpoint');
    });
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await submit(user, ' server.cio ', ' exact ', 'Create account');
    expect(screen.getByRole('status')).toHaveTextContent('Account saved on the server');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    await submit(user, 'server.cio', ' exact ');
    expect(await screen.findByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('server-token');
    const loginCall = fetch.mock.calls.find(([path]) => path.endsWith('/login'));
    expect(JSON.parse(loginCall[1].body)).toEqual({ username: 'server.cio', password: ' exact ' });
    first.unmount();
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking server session');
    expect(await screen.findByRole('tabpanel')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    const logoutCall = fetch.mock.calls.find(([path]) => path.endsWith('/logout'));
    expect(logoutCall[1].headers.Authorization).toBe('Bearer server-token');
    expect(screen.getByRole('status')).toHaveTextContent('account remains on the server');
  });

  it('disables pending controls, clears passwords immediately and shows login errors inline', async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<App />);
    await submit(user, 'demo', 'wrong');
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await act(async () => finish(response(401, { detail: 'Invalid credentials' })));
    expect(screen.getByRole('alert')).toHaveTextContent('does not match');
    expect(screen.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it.each([409, 422, 503])('reports HTTP %s without entering the shell', async (status) => {
    fetch.mockResolvedValue(response(status, { detail: [{ loc: ['body', 'username'] }] }));
    const user = userEvent.setup();
    render(<App />);
    await submit(user, 'demo', 'password');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('rejects blanks with field-associated errors and never sends credentials', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Log in', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a username');
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', 'auth-error');
    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Log in', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a password');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves all seven panels and does not fetch dashboard metrics on tab changes', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'server-token');
    fetch.mockResolvedValue(response(200, account));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    const calls = fetch.mock.calls.length;
    for (const tab of screen.getAllByRole('tab')) {
      await user.click(tab);
      const panel = screen.getByRole('tabpanel', { name: tab.textContent });
      expect(within(panel).getByRole('heading', { name: tab.textContent })).toBeVisible();
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      expect(tab).toHaveAttribute('aria-selected', 'true');
    }
    expect(fetch.mock.calls).toHaveLength(calls);
  });
});

describe('bootstrap and mutation failures', () => {
  it('does not expose the shell before /me completes and rejects revoked tokens', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'revoked');
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    await act(async () => finish(response(401, {})));
    expect(screen.getByRole('alert')).toHaveTextContent('expired');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('fails closed on bootstrap network failure but retains the token for retry', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'server-token');
    fetch.mockRejectedValue(new Error('offline'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('server is unavailable');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('server-token');
  });

  it('reports browser storage denial rather than trusting demo credentials', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('storage is unavailable');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('keeps login in memory if token saving fails and still revokes it on logout', async () => {
    fetch.mockImplementation(async (path) => path.endsWith('/logout') ? response(204)
      : response(200, { access_token: 'server-token', account }));
    const user = userEvent.setup();
    render(<App />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    await submit(user, 'demo', 'password');
    expect(await screen.findByRole('tabpanel')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('will not survive reload');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer server-token');
  });

  it('retains authenticated state on failed logout and permits a retry', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'server-token');
    fetch.mockResolvedValueOnce(response(200, account)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(204));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('still signed in');
    expect(screen.getByRole('tabpanel')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('clears a session on logout 401 and stays signed out even if token removal fails', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'server-token');
    fetch.mockResolvedValueOnce(response(200, account)).mockResolvedValueOnce(response(401, {}));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('server session is revoked');
  });

  it('rejects malformed JSON and network errors at the HTTP boundary', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad JSON'); } });
    await expect(apiClient.login({ username: 'demo', password: 'x' })).rejects.toThrow('invalid response');
    fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(apiClient.register({ username: 'demo', password: 'x' })).rejects.toThrow('unavailable');
  });

  it('serializes concurrent auth submissions so no second login is issued', async () => {
    let finish;
    fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useServerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first;
    await act(async () => { first = result.current.submit('login', { username: 'demo', password: 'x' }); });
    let second;
    await act(async () => { second = await result.current.submit('login', { username: 'demo', password: 'x' }); });
    expect(second.ok).toBe(false);
    await act(async () => { finish(response(200, { access_token: 'server-token', account })); await first; });
    expect(result.current.account.username).toBe(account.username);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});


it('rejects valid JSON with missing account or token fields without granting access', async () => {
  fetch.mockResolvedValueOnce(response(200, { account }));
  await expect(apiClient.login({ username: 'demo', password: 'x' })).rejects.toThrow('invalid session');
  fetch.mockResolvedValueOnce(response(200, { access_token: 'token', account: {} }));
  await expect(apiClient.login({ username: 'demo', password: 'x' })).rejects.toThrow('invalid account');
  fetch.mockResolvedValueOnce(response(200, {}));
  await expect(apiClient.me('token')).rejects.toThrow('invalid account');
});
