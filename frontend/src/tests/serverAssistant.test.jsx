/** Verify async HTTP failures, loading and account isolation without mocking hooks. */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useServerAssistant } from '../hooks/useServerAssistant.js';
import { apiClient, TOKEN_KEY } from '../services/apiClient.js';
import App from '../App.jsx';

const account = { id: 'one', username: 'one', created_at: '2025-01-01T00:00:00Z' };
/** Construct a response from an HTTP mock rather than bypassing apiClient. */
function response(status, body) {
  return { status, ok: status < 400, json: async () => body };
}
/** Supply a complete public assistant record. */
function message(id, text = 'server-only narrative') {
  return { id, role: 'assistant', text, created_at: '2025-01-01T00:00:00Z' };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

it('shows history and save loading, suppresses duplicate submissions and renders only HTTP results', async () => {
  let finishHistory;
  let finishPost;
  fetch.mockImplementation((path, options) => {
    if (path.endsWith('/me')) return Promise.resolve(response(200, account));
    if (options.method === 'POST') return new Promise((resolve) => { finishPost = resolve; });
    return new Promise((resolve) => { finishHistory = resolve; });
  });
  window.localStorage.setItem(TOKEN_KEY, 'token');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open local assistant' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading server history');
  expect(screen.getByRole('button', { name: 'Get local response' })).toBeDisabled();
  await act(async () => finishHistory(response(200, { items: [], total: 0 })));
  await user.type(screen.getByLabelText('Assistant prompt'), 'risk');
  await user.keyboard('{Enter}{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Saving server response');
  expect(screen.getByRole('button', { name: 'Get local response' })).toBeDisabled();
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  await act(async () => finishPost(response(201, message('unique'))));
  expect(screen.getByRole('log')).toHaveTextContent('server-only narrative');
  expect(window.localStorage.getItem('canon.demo.assistant.v1')).toBeNull();
});

it.each([503, 422, 'network'])('reports history failure %s and restores on explicit retry without local fallback', async (failure) => {
  fetch.mockImplementation(async (path) => {
    if (path.endsWith('/me')) return response(200, account);
    if (failure === 'network') throw new Error('offline');
    return response(failure, {});
  });
  window.localStorage.setItem(TOKEN_KEY, 'token');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open local assistant' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('log')).not.toHaveTextContent('Strengthen cybersecurity');
  fetch.mockResolvedValue(response(200, { items: [message('saved')], total: 1 }));
  await user.click(screen.getByRole('button', { name: 'Retry server history' }));
  await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('server-only narrative'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not append an unsaved response on POST failure and permits a later successful submission', async () => {
  fetch.mockResolvedValue(response(200, { items: [], total: 0 }));
  const { result } = renderHook(() => useServerAssistant(account, 'token'));
  await act(async () => result.current.openPanel());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  fetch.mockResolvedValueOnce(response(503, {}));
  await act(async () => result.current.respond('risk'));
  expect(result.current.messages).toEqual([]);
  expect(result.current.error).toContain('could not complete');
  fetch.mockResolvedValueOnce(response(201, message('saved')));
  await act(async () => result.current.respond('risk'));
  expect(result.current.messages).toEqual([message('saved')]);
  expect(result.current.error).toBe('');
});

it.each(['GET', 'POST'])('expires the session on authenticated %s 401 and hides private history', async (method) => {
  fetch.mockImplementation(async (path, options) => {
    if (path.endsWith('/me')) return response(200, account);
    if (options.method === method) return response(401, {});
    return response(200, { items: [message('old', 'private history')], total: 1 });
  });
  window.localStorage.setItem(TOKEN_KEY, 'token');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open local assistant' }));
  if (method === 'POST') {
    await screen.findByText('private history');
    await user.click(screen.getByRole('button', { name: 'Get local response' }));
  }
  await screen.findByRole('button', { name: 'Log in', exact: true });
  expect(screen.queryByRole('log')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('session has expired');
  expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
});

it.each(['history', 'post'])('aborts and ignores delayed old-owner %s after account switching', async (kind) => {
  let finish;
  let oldSignal;
  fetch.mockImplementation((path, options) => {
    if (options.headers.Authorization === 'Bearer old' && (kind === 'history' || options.method === 'POST')) {
      oldSignal = options.signal;
      return new Promise((resolve) => { finish = resolve; });
    }
    return Promise.resolve(response(200, { items: [], total: 0 }));
  });
  const { result, rerender } = renderHook(({ owner, token }) => useServerAssistant(owner, token), {
    initialProps: { owner: account, token: 'old' },
  });
  if (kind === 'history') await act(async () => result.current.openPanel());
  else {
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { result.current.respond('secret draft'); });
  }
  rerender({ owner: { ...account, id: 'two' }, token: 'new' });
  expect(result.current.messages).toEqual([]);
  expect(result.current.input).toBe('');
  expect(result.current.open).toBe(false);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finish(response(kind === 'post' ? 201 : 200,
    kind === 'post' ? message('old', 'private') : { items: [message('old', 'private')], total: 1 })));
  expect(result.current.messages).toEqual([]);
  await act(async () => result.current.openPanel());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.messages).toEqual([]);
});

it('aborts history on unmount without invoking an expired callback for a stale 401', async () => {
  let finish;
  let signal;
  fetch.mockImplementation((path, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  const expired = vi.fn();
  const { result, unmount } = renderHook(() => useServerAssistant(account, 'token', expired));
  await act(async () => result.current.openPanel());
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(response(401, {})));
  expect(expired).not.toHaveBeenCalled();
});

it('restores all bounded pages in server order, not just the first 100 responses', async () => {
  const items = Array.from({ length: 101 }, (_, index) => message(String(index)));
  fetch.mockImplementation(async (path, options) => {
    expect(options.headers.Authorization).toBe('Bearer token');
    const offset = Number(new URL(path, 'http://test').searchParams.get('offset'));
    return response(200, { items: items.slice(offset, offset + 100), total: 101 });
  });
  const { result } = renderHook(() => useServerAssistant(account, 'token'));
  await act(async () => result.current.openPanel());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.messages).toEqual(items);
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/api/v1/assistant/messages?limit=100&offset=0', '/api/v1/assistant/messages?limit=100&offset=100',
  ]);
});

it.each([null, {}, { items: {}, total: 0 }, { items: [], total: -1 },
  { items: [message('x')], total: 0 }, { items: [{ ...message('x'), role: 'user' }], total: 1 },
  { items: [{ ...message('x'), created_at: 'bad' }], total: 1 }])('rejects malformed history %j at the HTTP boundary', async (body) => {
  fetch.mockResolvedValue(response(200, body));
  await expect(apiClient.assistantHistory('token')).rejects.toThrow();
});

it('rejects broken JSON, incomplete pages and malformed POST records without appending', async () => {
  fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad'); } });
  await expect(apiClient.assistantHistory('token')).rejects.toThrow('invalid response');
  fetch.mockResolvedValueOnce(response(201, {}));
  await expect(apiClient.assistantMessage('token', 'risk')).rejects.toThrow('invalid assistant');
  fetch.mockResolvedValue(response(200, { items: [], total: 1 }));
  const { result } = renderHook(() => useServerAssistant(account, 'token'));
  await act(async () => result.current.openPanel());
  await waitFor(() => expect(result.current.error).toContain('incomplete'));
  expect(result.current.messages).toEqual([]);
});
