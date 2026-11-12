/** Exercise form and shell journeys using real local authentication and storage. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { AuthForm } from '../components/AuthForm.jsx';
import { DashboardTabs } from '../components/DashboardTabs.jsx';
import { registerAccount, login } from '../services/localAuth.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

/** Submit the visible two-field form as an actual keyboard/mouse user. */
async function submit(user, username, password, button = 'Log in') {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: button, exact: true }));
}

describe('demo form', () => {
  it('labels required fields and blocks blank username with associated focus/error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm mode="login" onSubmit={onSubmit} onModeChange={vi.fn()} />);
    await user.type(screen.getByLabelText('Password'), 'a');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a username.');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', 'auth-error');
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks blank password and focuses the associated field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AuthForm mode="signup" onSubmit={onSubmit} onModeChange={vi.fn()} />);
    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a password.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'auth-error');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('passes exact passwords, clears them on success, and does not submit on rendering', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => ({ ok: true }));
    render(<AuthForm mode="login" onSubmit={onSubmit} onModeChange={vi.fn()} />);
    expect(onSubmit).not.toHaveBeenCalled();
    await submit(user, ' demo ', ' x ');
    expect(onSubmit).toHaveBeenCalledWith({ username: ' demo ', password: ' x ' });
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['DUPLICATE_USERNAME', 'username', /already exists/],
    ['INVALID_CREDENTIALS', undefined, /does not match/],
    ['STORAGE_UNAVAILABLE', undefined, /unavailable/],
    ['STORAGE_WRITE_FAILED', undefined, /could not be saved/],
    ['INVALID_LOCAL_STATE', undefined, /not been overwritten/],
    ['UNKNOWN', undefined, /Demo access failed/],
  ])('announces %s without retaining the password', async (code, field, message) => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" onSubmit={() => ({ ok: false, code, field })} onModeChange={vi.fn()} />);
    await submit(user, 'demo', 'a');
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Password')).toHaveValue('');
    if (field) expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('exposes both explicit mode-switch directions', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { rerender } = render(<AuthForm mode="login" onSubmit={vi.fn()} onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: 'Create a demo account' }));
    expect(onModeChange).toHaveBeenLastCalledWith('signup');
    rerender(<AuthForm mode="signup" onSubmit={vi.fn()} onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(onModeChange).toHaveBeenLastCalledWith('login');
  });
});

describe('local access shell', () => {
  it('completes signup, negative login, normalized login, restore, logout and signed-out reload while accounts remain', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText(/stored unencrypted/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create a demo account' }));
    await submit(user, ' CIO.demo ', 'a', 'Create account');
    expect(screen.getByRole('status')).toHaveTextContent('Demo account saved');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('');
    await submit(user, 'cio.demo', 'wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('does not match');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
    await user.clear(screen.getByLabelText('Username'));
    await submit(user, 'cIo.DeMo', 'a');
    expect(screen.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByText('CIO.demo')).toBeInTheDocument();
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    unmount();
    const restored = render(<App />);
    expect(screen.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('status')).toHaveTextContent('account remains');
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBeNull();
    restored.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('rejects duplicate signup without overwrite or false routing', async () => {
    registerAccount({ username: 'demo', password: 'a' });
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Create a demo account' }));
    await submit(user, ' DEMO ', 'b', 'Create account');
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  it.each(['signup', 'login'])('keeps %s signed out when writes fail', async (mode) => {
    registerAccount({ username: 'demo', password: 'a' });
    const user = userEvent.setup();
    render(<App />);
    if (mode === 'signup') await user.click(screen.getByRole('button', { name: 'Create a demo account' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    await submit(user, mode === 'signup' ? 'new' : 'demo', 'a', mode === 'signup' ? 'Create account' : 'Log in');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('reports corrupt accounts without overwriting or entering the shell', async () => {
    window.localStorage.setItem(STORAGE_KEYS.accounts, '{');
    const user = userEvent.setup();
    render(<App />);
    await submit(user, 'demo', 'a');
    expect(screen.getByRole('alert')).toHaveTextContent('not been overwritten');
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe('{');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('reports damaged session restore while preserving accounts', () => {
    registerAccount({ username: 'demo', password: 'a' });
    const saved = window.localStorage.getItem(STORAGE_KEYS.accounts);
    window.localStorage.setItem(STORAGE_KEYS.session, '{');
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('session is damaged');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
  });

  it('reports denied restore and denied submit without a crash or false session', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('could not be restored');
    await submit(user, 'demo', 'a');
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('keeps signed-in state on failed logout and permits successful retry', async () => {
    registerAccount({ username: 'demo', password: 'a' });
    login({ username: 'demo', password: 'a' });
    const user = userEvent.setup();
    render(<App />);
    const removal = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('still signed in');
    expect(screen.getByRole('tabpanel')).toBeVisible();
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).not.toBeNull();
    removal.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selects all seven panels, preserves header, and never fetches or persists tab state', async () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"<demo>"}');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const user = userEvent.setup();
    render(<App />);
    const saved = window.localStorage.getItem(STORAGE_KEYS.session);
    for (const tab of screen.getAllByRole('tab')) {
      await user.click(tab);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      const panel = screen.getByRole('tabpanel', { name: tab.textContent });
      expect(within(panel).getByRole('heading', { name: tab.textContent })).toBeVisible();
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(panel.id).toBe(tab.getAttribute('aria-controls'));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Global CIO Command Center');
      expect(screen.getByText('<demo>')).toBeVisible();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBe(saved);
  });

  it('supports roving focus, arrow wrap, Home/End, Enter/Space and ignores unrelated keys', async () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"demo"}');
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    await user.keyboard('{ArrowLeft}');
    expect(tabs[6]).toHaveFocus();
    expect(tabs[6]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(tabs[6]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter} ');
    expect(tabs[0]).toHaveFocus();
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('renders controlled tab state without selecting on render and activates a non-selected tab by keyboard', async () => {
    const onSelect = vi.fn();
    render(<DashboardTabs activeView="strategic" onSelect={onSelect} />);
    expect(onSelect).not.toHaveBeenCalled();
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Operations' }).focus();
    await user.keyboard('{Enter} ');
    expect(onSelect).toHaveBeenCalledWith('operations');
  });
});
