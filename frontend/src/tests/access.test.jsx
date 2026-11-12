/** Exercise form and shell journeys using the real auth hook with a stubbed server API boundary. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { AuthForm } from '../components/AuthForm.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { DashboardTabs } from '../components/DashboardTabs.jsx';
import { ApiError, TOKEN_KEY } from '../services/apiClient.js';
import { mockServerAuth, seedServerSession, serverToken } from './serverAuthFixture.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

/** Submit the visible two-field form as an actual keyboard/mouse user. */
async function submit(user, username, password, button = 'Log in') {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: button, exact: true }));
}

describe('header presentation', () => {
  it('keeps the brand visible without signed-in identity or notification presentation', () => {
    render(<AppHeader />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByText('Canon')).toBeVisible();
    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent('Global CIO Command Center');
    expect(header.queryByRole('img')).not.toBeInTheDocument();
    expect(header.queryByText(/Global CIO · Demo/)).not.toBeInTheDocument();
    expect(header.queryByText(/Notifications/)).not.toBeInTheDocument();
    expect(header.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['Alex Morgan', 'AM'],
    ['demo', 'D'],
  ])('shows inert initials for %s and unavailable demo notifications without invented counts or actions', async (username, initials) => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const { container } = render(<AppHeader username={username} onLogout={onLogout} />);
    const header = within(screen.getByRole('banner'));
    const avatar = header.getByRole('img', { name: `${username} initials avatar` });
    const notifications = header.getByText('Notifications unavailable in demo', { exact: true });
    expect(avatar).toHaveTextContent(initials);
    expect(avatar.tagName).toBe('SPAN');
    expect(container.querySelector('img')).toBeNull();
    expect(header.getByText(username, { exact: true })).toBeVisible();
    expect(header.getByText('Global CIO · Demo')).toBeVisible();
    expect(notifications.tagName).toBe('P');
    expect(notifications.textContent).toBe('Notifications unavailable in demo');
    expect(header.queryByRole('alert')).not.toBeInTheDocument();
    expect(header.queryByRole('status')).not.toBeInTheDocument();
    expect(header.queryByRole('link')).not.toBeInTheDocument();
    expect(header.getAllByRole('button')).toHaveLength(1);
    for (const presentation of [avatar, notifications]) {
      expect(presentation).not.toHaveAttribute('tabindex');
      expect(presentation).not.toHaveAttribute('aria-live');
      expect(presentation.closest('button, a')).toBeNull();
      await user.click(presentation);
    }
    expect(onLogout).not.toHaveBeenCalled();
    await user.tab();
    expect(header.getByRole('button', { name: 'Log out' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('server account form', () => {
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
    ['duplicate username', 'username', 'This username already exists. Log in instead.', /already exists/],
    ['invalid credentials', undefined, 'Username or password does not match.', /does not match/],
    ['network failure', undefined, 'The server is unavailable. Try again.', /unavailable/],
    ['server failure', undefined, 'The server could not complete this request. Try again.', /could not complete/],
    ['validation failure', 'username', 'Check your username and password lengths.', /lengths/],
    ['unknown failure', undefined, undefined, /Account access failed/],
  ])('announces %s without retaining the password', async (label, field, message, expected) => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" onSubmit={async () => ({ ok: false, message, field })} onModeChange={vi.fn()} />);
    await submit(user, 'demo', 'a');
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(screen.getByLabelText('Password')).toHaveValue('');
    if (field) expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('exposes both explicit mode-switch directions', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { rerender } = render(<AuthForm mode="login" onSubmit={vi.fn()} onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(onModeChange).toHaveBeenLastCalledWith('signup');
    rerender(<AuthForm mode="signup" onSubmit={vi.fn()} onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(onModeChange).toHaveBeenLastCalledWith('login');
  });
});

describe('server access shell', () => {
  it('completes server signup, negative login, login, restore, logout and signed-out reload', async () => {
    const boundary = mockServerAuth({ id: 'cio', username: 'CIO.demo', created_at: '2025-01-01T00:00:00Z' });
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(await screen.findByText(/Passwords are hashed/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create an account', exact: true }));
    await submit(user, ' CIO.demo ', 'a', 'Create account');
    expect(await screen.findByRole('status')).toHaveTextContent('Account saved on the server');
    expect(boundary.register).toHaveBeenCalledWith({ username: ' CIO.demo ', password: 'a' });
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('');
    boundary.login.mockRejectedValueOnce(new ApiError('Username or password does not match.', 401));
    await submit(user, 'cio.demo', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    await user.clear(screen.getByLabelText('Username'));
    await submit(user, 'cIo.DeMo', 'a');
    expect(await screen.findByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    expect(boundary.login).toHaveBeenLastCalledWith({ username: 'cIo.DeMo', password: 'a' });
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByText('CIO.demo')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBeNull();
    unmount();
    const restored = render(<App />);
    expect(await screen.findByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    expect(boundary.me).toHaveBeenCalledWith(serverToken, expect.any(AbortSignal));
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('status')).toHaveTextContent('account remains on the server');
    expect(boundary.logout).toHaveBeenCalledWith(serverToken);
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    restored.unmount();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('reports server duplicate signup without altering local data or false routing', async () => {
    const boundary = mockServerAuth();
    boundary.register.mockRejectedValueOnce(new ApiError('This username already exists. Log in instead.', 409, 'username'));
    const saved = '{"legacy":"untouched"}';
    window.localStorage.setItem(STORAGE_KEYS.accounts, saved);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create an account', exact: true }));
    await submit(user, ' DEMO ', 'b', 'Create account');
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeVisible();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it.each(['signup', 'login'])('keeps %s signed out when the server request fails', async (mode) => {
    const boundary = mockServerAuth();
    boundary[mode === 'signup' ? 'register' : 'login'].mockRejectedValueOnce(new ApiError('The server could not complete this request. Try again.', 503));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Log in', exact: true });
    if (mode === 'signup') await user.click(screen.getByRole('button', { name: 'Create an account', exact: true }));
    await submit(user, mode === 'signup' ? 'new' : 'demo', 'a', mode === 'signup' ? 'Create account' : 'Log in');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not complete');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('ignores corrupt local accounts and reports server login rejection without overwriting them', async () => {
    const boundary = mockServerAuth();
    boundary.login.mockRejectedValueOnce(new ApiError('Username or password does not match.', 401));
    window.localStorage.setItem(STORAGE_KEYS.accounts, '{');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Log in', exact: true });
    await submit(user, 'demo', 'a');
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe('{');
    expect(boundary.login).toHaveBeenCalledWith({ username: 'demo', password: 'a' });
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('rejects a revoked server token while preserving legacy accounts and session', async () => {
    const boundary = seedServerSession();
    boundary.me.mockRejectedValueOnce(new ApiError('Expired session', 401));
    const saved = '{"legacy":"untouched"}';
    window.localStorage.setItem(STORAGE_KEYS.accounts, saved);
    window.localStorage.setItem(STORAGE_KEYS.session, '{');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('session has expired');
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEYS.accounts)).toBe(saved);
    expect(window.localStorage.getItem(STORAGE_KEYS.session)).toBe('{');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('reports denied token restore and server submit failure without a crash or false session', async () => {
    const boundary = mockServerAuth();
    boundary.login.mockRejectedValueOnce(new ApiError('The server is unavailable. Try again.'));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('storage is unavailable');
    await submit(user, 'demo', 'a');
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent.includes('server is unavailable'))).toBe(true);
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('keeps signed-in state on failed server logout and permits successful retry', async () => {
    const boundary = seedServerSession();
    boundary.logout.mockRejectedValueOnce(new ApiError('The server is unavailable. Try again.'));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('still signed in');
    expect(screen.getByRole('tabpanel')).toBeVisible();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(serverToken);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in', exact: true });
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('selects all seven panels, preserves header, and never fetches or persists tab state', async () => {
    seedServerSession('<demo>');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
    const saved = window.localStorage.getItem(TOKEN_KEY);
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
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(saved);
  });

  it('supports roving focus, arrow wrap, Home/End, Enter/Space and ignores unrelated keys', async () => {
    seedServerSession('demo');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tabpanel');
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
