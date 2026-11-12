/** Verify assistant journeys through the real shell, storage and local resolver. */
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { STORAGE_KEYS } from '../services/localStorage.js';

const chips = [
  ['Q4 Board Presentation Ready', 'Focus on innovation acceleration, risk reduction, and board readiness initiatives.'],
  ['TCS Contract Expansion Analysis', 'TCS partnership expansion recommended based on ROI growth and delivery performance.'],
  ['Risk Mitigation Plan', 'Strengthen cybersecurity posture and compliance tracking across regions.'],
  ['Innovation Investment Strategy', 'Increase investment in AI/ML and automation pipelines to drive long-term value.'],
];
const fallback = 'Only the supported demo topics Q4, TCS, risk, and innovation are available.';

/** Render a restored demo shell without bypassing any assistant implementation. */
function renderDashboard() {
  window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"demo"}');
  return render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

/** Read the visible response history by its accessible name. */
function history() {
  return screen.getByRole('log', { name: 'Assistant response history' });
}

describe('assistant controls and chip journeys', () => {
  it('renders four exact chips without opening, writing, or contacting a service', () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"demo"}');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    const section = screen.getByRole('heading', { name: 'Strategic assistant topics' }).closest('section');
    expect(within(section).getAllByRole('button').map((button) => button.textContent)).toEqual(chips.map(([label]) => label));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open local assistant' })).toHaveAttribute('aria-expanded', 'false');
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it.each(chips)('opens, prefills and returns the exact response for %s only on activation', async (label, text) => {
    renderDashboard();
    const user = userEvent.setup();
    const chip = screen.getByRole('button', { name: label, exact: true });
    chip.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue(label);
    expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
    expect(within(history()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([text]);
    expect(screen.getByText(`Current prompt: ${label}`)).toBeVisible();
    expect(screen.getByText('Local rule-based simulation — not live or generative AI; not validated advice.')).toBeVisible();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.assistant));
    expect(saved.messages).toHaveLength(1);
    expect(saved.messages[0]).toMatchObject({ role: 'assistant', text });
    expect(JSON.stringify(saved)).not.toContain(label);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('toggles, closes by button and Escape, restores focus and retains draft/history', async () => {
    renderDashboard();
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Open local assistant' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No saved responses yet.')).toBeVisible();
    expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Assistant prompt'), 'risk');
    await user.click(screen.getByRole('button', { name: 'Get local response' }));
    await user.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('risk');
    expect(history()).toHaveTextContent(chips[2][1]);
    await user.click(screen.getByRole('button', { name: 'Hide local assistant' }));
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('does not trap dashboard focus and falls back to toggle if chip is unmounted', async () => {
    renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chips[0][0] }));
    const operations = screen.getByRole('tab', { name: 'Operations' });
    await user.click(operations);
    expect(operations).toHaveFocus();
    expect(history()).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open local assistant' })).toHaveFocus();
  });

  it('refocuses input on a second chip while open and appends one response per activation', async () => {
    renderDashboard();
    const user = userEvent.setup();
    for (const [label] of chips) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(screen.getByLabelText('Assistant prompt')).toHaveFocus();
      expect(screen.getByLabelText('Assistant prompt')).toHaveValue(label);
    }
    expect(within(history()).getAllByRole('listitem').map((item) => item.textContent)).toEqual(chips.map(([, text]) => text));
  });

  it.each([
    ['innovation risk TCS Q4', chips[0][1]], ['innovation risk TCS', chips[1][1]],
    ['innovation RISK', chips[2][1]], ['INNOVATION!', chips[3][1]],
    ['brisk innovations q40 tcs2', fallback], ['', fallback],
  ])('resolves submitted general input %j with documented priority and boundaries', async (prompt, response) => {
    renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await user.type(screen.getByLabelText('Assistant prompt'), prompt || ' ');
    await user.click(screen.getByRole('button', { name: 'Get local response' }));
    expect(within(history()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([response]);
  });

  it('renders hostile user text as escaped text, never markup or stored prompts', async () => {
    renderDashboard();
    const user = userEvent.setup();
    const hostile = '<img src=x onerror="window.hacked=true"><script>alert(1)</script>';
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    await user.click(screen.getByLabelText('Assistant prompt'));
    await user.paste(hostile);
    await user.keyboard('{Enter}');
    expect(screen.getByText(`Current prompt: ${hostile}`)).toBeVisible();
    expect(history()).toHaveTextContent(fallback);
    expect(document.querySelector('.assistant-panel img, .assistant-panel script')).toBeNull();
    expect(window.hacked).toBeUndefined();
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).not.toContain(hostile);
  });
});

describe('assistant restoration and recoverable failures', () => {
  it('restores response-only history on remount and keeps IDs unique after reload', async () => {
    const view = renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chips[0][0] }));
    view.unmount();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    expect(history()).toHaveTextContent(chips[0][1]);
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('');
    expect(screen.queryByText(/^Current prompt:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: chips[1][0] }));
    const messages = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.assistant)).messages;
    expect(messages.map((message) => message.id)).toEqual(['local-1', 'local-2']);
  });

  it.each(['{broken', '{"version":2,"messages":[]}', '{"version":1,"messages":[{"role":"user","text":"private"}]}'])('rejects unsafe saved history %s without modifying it', async (raw) => {
    window.localStorage.setItem(STORAGE_KEYS.assistant, raw);
    renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    expect(screen.getByText('No saved responses yet.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('unavailable or unsupported');
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(raw);
    await user.click(screen.getByRole('button', { name: chips[2][0] }));
    expect(history()).toHaveTextContent(chips[2][1]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('handles denied assistant reads without blocking a valid restored dashboard', async () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === STORAGE_KEYS.assistant) throw new DOMException('denied', 'SecurityError');
      return original.call(this, key);
    });
    renderDashboard();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open local assistant' }));
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
    expect(screen.getByText('No saved responses yet.')).toBeVisible();
  });

  it.each(['SecurityError', 'QuotaExceededError'])('retains current responses and dashboard controls after %s, then recovers', async (name) => {
    renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chips[0][0] }));
    const previous = window.localStorage.getItem(STORAGE_KEYS.assistant);
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', name); });
    await user.click(screen.getByRole('button', { name: chips[1][0] }));
    expect(history()).toHaveTextContent(chips[1][1]);
    expect(screen.getByRole('status')).toHaveTextContent('will not survive reload');
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).toBe(previous);
    await user.click(screen.getByRole('tab', { name: 'Operations' }));
    expect(screen.getByRole('tabpanel', { name: 'Operations' })).toBeVisible();
    await user.clear(screen.getByLabelText('Assistant prompt'));
    await user.type(screen.getByLabelText('Assistant prompt'), 'risk');
    await user.keyboard('{Enter}');
    expect(history()).toHaveTextContent(chips[2][1]);
    writes.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Get local response' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.assistant)).messages).toHaveLength(4);
  });

  it('hides assistant when signed out and clears draft on successful logout', async () => {
    const view = renderDashboard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chips[0][0] }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open local assistant' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEYS.assistant)).not.toBeNull();
    view.unmount();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Open local assistant' }));
    expect(screen.getByLabelText('Assistant prompt')).toHaveValue('');
    expect(history()).toHaveTextContent(chips[0][1]);
  });

  it('makes no fetch or XHR request during all chip and general prompt interactions', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    renderDashboard();
    const user = userEvent.setup();
    for (const [label] of chips) await user.click(screen.getByRole('button', { name: label }));
    await user.clear(screen.getByLabelText('Assistant prompt'));
    await user.type(screen.getByLabelText('Assistant prompt'), 'unrecognized');
    await user.keyboard('{Enter}');
    expect(history()).toHaveTextContent(fallback);
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });
});
