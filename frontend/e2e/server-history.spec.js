/** Exercise real UI, server narratives and PostgreSQL history isolation; never mock requests. */
import { test, expect } from '@playwright/test';
import { ASSISTANT_CHIPS, ASSISTANT_RESPONSES, ASSISTANT_FALLBACK } from '../src/data/assistantResponses.js';

/** Register through the UI and then obtain a server-issued session through login. */
async function signIn(page, username, register = true) {
  if (register) {
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('history-e2e-password');
    const registered = page.waitForResponse((res) => res.url().endsWith('/api/v1/auth/register'));
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    expect((await registered).status()).toBe(201);
    await expect(page.getByRole('status')).toContainText('Account saved on the server');
  }
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('history-e2e-password');
  const loggedIn = page.waitForResponse((res) => res.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const login = await loggedIn;
  expect(login.status()).toBe(200);
  const body = await login.json();
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
  return body;
}

/** Observe the actual server page used by the assistant disclosure. */
async function openHistory(page) {
  const history = page.waitForResponse((res) => res.url().includes('/api/v1/assistant/messages?')
    && res.request().method() === 'GET');
  await page.getByRole('button', { name: 'Open local assistant' }).click();
  const response = await history;
  expect(response.status()).toBe(200);
  const body = await response.json();
  await expect(page.getByRole('button', { name: 'Get local response' })).toBeEnabled();
  await expect(page.getByRole('log').getByRole('listitem')).toHaveText(body.items.map((item) => item.text));
  return body;
}

for (const width of [1280, 390]) {
  test(`response-only history survives reload and isolates accounts at ${width}px`, async ({ page, request }) => {
    const errors = [];
    const assistantRequests = [];
    page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (failed) => errors.push(failed.url()));
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/assistant/messages')) assistantRequests.push(req);
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const suffix = `${Date.now()}-${width}-${test.info().workerIndex}`;
    const firstName = `history-first-${suffix}`;
    const first = await signIn(page, firstName);
    expect(assistantRequests).toHaveLength(0);
    expect((await openHistory(page)).items).toEqual([]);
    const saved = [];
    for (const chip of ASSISTANT_CHIPS) {
      const created = page.waitForResponse((res) => res.url().endsWith('/api/v1/assistant/messages')
        && res.request().method() === 'POST');
      await page.getByRole('button', { name: chip.label, exact: true }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toEqual({ prompt: chip.label });
      expect(response.request().headers().authorization).toBe(`Bearer ${first.access_token}`);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(['created_at', 'id', 'role', 'text']);
      expect(body.text).toBe(ASSISTANT_RESPONSES[chip.keyword]);
      saved.push(body);
      await expect(page.getByRole('log').getByRole('listitem')).toHaveText(saved.map((item) => item.text));
      await expect(page.getByLabel('Assistant prompt')).toHaveValue(chip.label);
      await expect(page.getByLabel('Assistant prompt')).toBeFocused();
      await expect(page.getByRole('button', { name: 'Get local response' })).toBeEnabled();
    }
    const hostile = '<img src=x onerror="window.hacked=true"><script>alert(1)</script>';
    for (const [prompt, expected] of [
      ['innovation risk TCS Q4', ASSISTANT_RESPONSES.q4], ['brisk innovations q40 tcs2', ASSISTANT_FALLBACK],
      [hostile, ASSISTANT_FALLBACK],
    ]) {
      await page.getByLabel('Assistant prompt').fill(prompt);
      const created = page.waitForResponse((res) => res.url().endsWith('/api/v1/assistant/messages')
        && res.request().method() === 'POST');
      await page.getByRole('button', { name: 'Get local response' }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.text).toBe(expected);
      saved.push(body);
      await expect(page.getByRole('log').getByRole('listitem')).toHaveText(saved.map((item) => item.text));
      await expect(page.getByRole('button', { name: 'Get local response' })).toBeEnabled();
    }
    await expect(page.getByText(`Current prompt: ${hostile}`, { exact: true })).toBeVisible();
    await expect(page.locator('.assistant-panel img, .assistant-panel script')).toHaveCount(0);
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
    expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('<script>')))).toBe(false);
    await page.reload();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    expect(await openHistory(page)).toEqual({ items: saved, total: saved.length });
    await expect(page.getByLabel('Assistant prompt')).toHaveValue('');
    await expect(page.getByText(/^Current prompt:/)).toHaveCount(0);
    const logout = page.waitForResponse((res) => res.url().endsWith('/api/v1/auth/logout'));
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    expect((await logout).status()).toBe(204);
    await expect(page.getByRole('log')).toHaveCount(0);
    const second = await signIn(page, `history-second-${suffix}`);
    expect((await openHistory(page)).items).toEqual([]);
    const direct = await request.get('/api/v1/assistant/messages?limit=1&offset=0', {
      headers: { Authorization: `Bearer ${second.access_token}` },
    });
    expect(direct.status()).toBe(200);
    expect(await direct.json()).toEqual({ items: [], total: 0 });
    const revoked = await request.get('/api/v1/assistant/messages', {
      headers: { Authorization: `Bearer ${first.access_token}` },
    });
    expect(revoked.status()).toBe(401);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    await signIn(page, firstName, false);
    expect(await openHistory(page)).toEqual({ items: saved, total: saved.length });
    expect(assistantRequests.filter((req) => req.method() === 'POST')).toHaveLength(saved.length);
    expect(errors).toEqual([]);
  });
}
