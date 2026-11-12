/** Preserve chip, escaped-text and keyboard journeys across the real HTTP client. */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { TOKEN_KEY } from '../services/apiClient.js';
import { ASSISTANT_CHIPS, ASSISTANT_RESPONSES, ASSISTANT_FALLBACK } from '../data/assistantResponses.js';
import { resolveAssistantPrompt } from '../services/localAssistant.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

let saved;
/** Mock HTTP only; resolution and storage here describe the expected server contract. */
function response(status, body) {
  return { ok: status < 400, status, json: async () => body };
}
beforeEach(() => {
  saved = [];
  window.localStorage.setItem(TOKEN_KEY, 'token');
  vi.stubGlobal('fetch', vi.fn(async (path, options) => {
    if (path.endsWith('/me')) return response(200, { id: 'owner', username: 'demo', created_at: '2025-01-01T00:00:00Z' });
    if (path.endsWith('/logout')) return response(204);
    if (options.method === 'POST') {
      const { prompt } = JSON.parse(options.body);
      const message = { id: `server-${saved.length + 1}`, role: 'assistant',
        text: resolveAssistantPrompt(prompt).text, created_at: '2025-01-01T00:00:00Z' };
      saved.push(message);
      return response(201, message);
    }
    return response(200, { items: saved.slice(), total: saved.length });
  }));
});
/** Restore a server account without bypassing the auth hook. */
async function dashboard() {
  const view = render(<StrictMode><App /></StrictMode>);
  await screen.findByRole('tabpanel');
  return view;
}
/** Read visible response texts in order. */
function texts() {
  return within(screen.getByRole('log')).queryAllByRole('listitem').map((item) => item.textContent);
}
/** Wait for asynchronous saving before further activations. */
async function settled(count) {
  await waitFor(() => expect(texts()).toHaveLength(count));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Get local response' })).toBeEnabled());
}

describe('server-wired assistant controls', () => {
  it('renders exact chips without opening or contacting history before activation', async () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    await dashboard();
    const section = screen.getByRole('heading', { name: 'Strategic assistant topics' }).closest('section');
    expect(within(section).getAllByRole('button').map((item) => item.textContent)).toEqual(ASSISTANT_CHIPS.map((item) => item.label));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open local assistant' })).toHaveAttribute('aria-expanded', 'false');
    expect(fetch.mock.calls.every(([path]) => path.endsWith('/me'))).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it.each(ASSISTANT_CHIPS)('opens, prefills and displays exact server response for $label', async ({ keyword, label }) => {
    await dashboard();
    const user = userEvent.setup();
    const chip = screen.getByRole('button', { name: label });
    chip.focus();
    await user.keyboard('{Enter}');
    await settled(1);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue(label);
    expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
    expect(texts()).toEqual([ASSISTANT_RESPONSES[keyword]]);
    expect(screen.getByText(`Current prompt: ${label}`)).toBeVisible();
    expect(screen.getByText('Server rule-based simulation — not live or generative AI; not validated advice.')).toBeVisible();
    const post = fetch.mock.calls.find(([, options]) => options.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ prompt: label });
    expect(post[1].headers.Authorization).toBe('Bearer token');
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('toggles and closes without trapping focus, retaining draft and responses', async () => {
    await dashboard();
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Open local assistant' });
    await user.click(toggle);
    await screen.findByText('No saved responses yet.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get local response' })).toBeEnabled());
    expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Assistant prompt'), 'risk');
    await user.keyboard('{Enter}');
    await settled(1);
    await user.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('risk');
    expect(texts()).toEqual([ASSISTANT_RESPONSES.risk]);
    await user.click(screen.getByRole('button', { name: 'Hide local assistant' }));
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(screen.getByRole('tab', { name: 'Operations' }));
    expect(screen.getByRole('tab', { name: 'Operations' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
  });

  it('refocuses on later chips and uses toggle when a chip is unmounted', async () => {
    await dashboard();
    const user = userEvent.setup();
    for (const [index, chip] of ASSISTANT_CHIPS.entries()) {
      await user.click(screen.getByRole('button', { name: chip.label }));
      await settled(index + 1);
      expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
      expect(screen.getByLabelText('Assistant prompt')).toHaveValue(chip.label);
    }
    expect(texts()).toEqual(Object.values(ASSISTANT_RESPONSES));
    await user.click(screen.getByRole('tab', { name: 'Operations' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open local assistant' })).toHaveFocus();
  });

  it.each(['innovation risk TCS Q4', 'innovation risk TCS', 'innovation RISK', 'INNOVATION!', 'brisk innovations q40 tcs2', ''])('sends general prompt %j and displays the HTTP response', async (prompt) => {
    await dashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get local response' })).toBeEnabled());
    if (prompt) await user.type(screen.getByLabelText('Assistant prompt'), prompt);
    await user.click(screen.getByRole('button', { name: 'Get local response' }));
    await settled(1);
    expect(texts()).toEqual([resolveAssistantPrompt(prompt).text]);
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === 'POST')[1].body)).toEqual({ prompt });
  });

  it('escapes hostile long prompts and restores response-only server history on remount', async () => {
    const view = await dashboard();
    const user = userEvent.setup();
    const hostile = '<img src=x onerror="window.hacked=true"><script>alert(1)</script>';
    const padding = 'x'.repeat(10000);
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get local response' })).toBeEnabled());
    for (const [index, suffix] of [' innovation risk TCS Q4', ' brisk innovations q40 tcs2'].entries()) {
      await user.clear(screen.getByLabelText('Assistant prompt'));
      await user.paste(hostile + padding + suffix);
      await user.keyboard('{Enter}');
      await settled(index + 1);
      expect(screen.getByText(`Current prompt: ${hostile + padding + suffix}`)).toBeVisible();
      expect(document.querySelector('.assistant-panel img, .assistant-panel script')).toBeNull();
      expect(window.hacked).toBeUndefined();
      expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBeNull();
      expect(JSON.stringify(saved)).not.toContain(hostile);
      expect(JSON.stringify(saved)).not.toContain(padding);
    }
    expect(texts()).toEqual([ASSISTANT_RESPONSES.q4, ASSISTANT_FALLBACK]);
    view.unmount();
    await dashboard();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await settled(2);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('');
    expect(screen.queryByText(/^Current prompt:/)).not.toBeInTheDocument();
    expect(texts()).toEqual(saved.map((item) => item.text));
  });

  it.each(['{broken', '{"version":2,"messages":[]}', '{"version":1,"messages":[{"role":"user","text":"private"}]}'])('ignores old browser history %s without altering it', async (raw) => {
    window.localStorage.setItem(STORAGE_KEYS.assistant, raw);
    await dashboard();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open local assistant' }));
    await settled(0);
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(raw);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['SecurityError', 'QuotaExceededError'])('never reads or writes assistant storage when browser storage throws %s', async (name) => {
    await dashboard();
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === STORAGE_KEYS.assistant) throw new DOMException('denied', name);
      return original.call(this, key);
    });
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', name); });
    await userEvent.setup().click(screen.getByRole('button', { name: ASSISTANT_CHIPS[0].label }));
    await settled(1);
    expect(texts()).toEqual([ASSISTANT_RESPONSES.q4]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('hides history on logout and clears drafts while restoring responses on later login', async () => {
    const view = await dashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: ASSISTANT_CHIPS[0].label }));
    await settled(1);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in', exact: true });
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open local assistant' })).not.toBeInTheDocument();
    view.unmount();
    window.localStorage.setItem(TOKEN_KEY, 'token');
    await dashboard();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await settled(1);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('');
  });
});
