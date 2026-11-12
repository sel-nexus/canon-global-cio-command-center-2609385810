/** Shared real-server fixtures; no request interception or seeded browser state. */
import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const TEST_PASSWORD = ' exact-browser-test-password ';
const accounts = new WeakMap();

/** Allocate a unique persisted identity for each journey and retry. */
export function uniqueUsername(prefix = 'cio-browser') {
  return `${prefix}-${randomUUID()}`;
}

/** Observe the exact HTTP endpoint and method before activating a control. */
export function apiResponse(page, endpoint, method = 'POST') {
  return page.waitForResponse((response) => new URL(response.url()).pathname === endpoint
    && response.request().method() === method);
}

/** Fail on external/telemetry requests, failed transport and unexpected HTTP errors.
 * Args:
 *   page: Fresh page before navigation.
 * Returns:
 *   Final assertion with narrowly scoped expected-negative-response registration.
 */
export function guardBrowser(page) {
  const errors = [];
  const consoleHttp = [];
  const unexpected = [];
  const expected = [];
  const apiRequests = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const status = message.text().match(/^Failed to load resource: the server responded with a status of (\d{3})\b/);
    if (status) consoleHttp.push(Number(status[1]));
    else errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return;
    const origin = new URL(page.url() === 'about:blank' ? request.url() : page.url()).origin;
    if (url.origin !== origin) unexpected.push(request.url());
    if (['fetch', 'xhr'].includes(request.resourceType())) {
      if (!/^\/api\/(health|v1\/auth\/(register|login|me|logout)|v1\/assistant\/messages)$/.test(url.pathname)) unexpected.push(request.url());
      else apiRequests.push(request);
    }
  });
  page.on('requestfailed', (request) => errors.push(`Failed request: ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const entry = expected.find((item) => !item.seen && item.endpoint === new URL(response.url()).pathname
      && item.method === response.request().method() && item.status === response.status());
    if (entry) entry.seen = true;
    else errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  const assertClean = () => {
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(expected.every((entry) => entry.seen)).toBe(true);
    const remaining = expected.filter((entry) => entry.seen).map((entry) => entry.status);
    for (const status of consoleHttp) {
      const index = remaining.indexOf(status);
      expect(index, `Unexpected console HTTP ${status}`).toBeGreaterThanOrEqual(0);
      remaining.splice(index, 1);
    }
    expect(apiRequests.length).toBeGreaterThan(0);
  };
  assertClean.expectHttp = (endpoint, method, status) => expected.push({ endpoint, method, status, seen: false });
  assertClean.apiRequests = apiRequests;
  return assertClean;
}

/** Register through the form and verify the server public account contract. */
export async function registerAccount(page, username = uniqueUsername(), password = TEST_PASSWORD) {
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const received = apiResponse(page, '/api/v1/auth/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const response = await received;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({ username, password });
  const account = await response.json();
  expect(Object.keys(account).sort()).toEqual(['created_at', 'id', 'username']);
  expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(account.username).toBe(username.trim().toLowerCase());
  expect(Number.isFinite(Date.parse(account.created_at))).toBe(true);
  await expect(page.getByRole('status')).toContainText('Account saved on the server');
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  accounts.set(page, { username, password, account });
  return account;
}

/** Verify a server-issued bearer session and the rendered server identity. */
export async function loginAccount(page, username, password) {
  const saved = accounts.get(page);
  username ??= saved?.username;
  password ??= saved?.password;
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const received = apiResponse(page, '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const response = await received;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ username, password });
  const session = await response.json();
  expect(session.account).toEqual(saved.account);
  expect(session.token_type).toBe('bearer');
  expect(session.access_token).toEqual(expect.any(String));
  expect(session.access_token.length).toBeGreaterThan(0);
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
  await expect(page.locator('header')).toContainText(session.account.username);
  return session;
}
