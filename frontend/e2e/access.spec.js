/** Cover the real access lifecycle and cross-section shell navigation; execution is deferred. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerAccount, loginAccount, apiResponse, uniqueUsername, TEST_PASSWORD } from './helpers.js';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Time a real activation from capture-phase click to rendered DOM on animation frames.
 * Initial auth response means the first visible result change, not receipt of the click.
 * Completion means the expected result plus enabled usable controls/content.
 */
async function measureActivation(page, button, selector, expectedText, endpoint, status) {
  const received = endpoint ? apiResponse(page, endpoint) : null;
  await button.evaluate((element, target) => {
    const visible = (node) => node && node.getClientRects().length > 0
      && getComputedStyle(node).visibility !== 'hidden';
    element.addEventListener('click', () => {
      const start = performance.now();
      const before = document.querySelector('main').innerText;
      window.activationTiming = new Promise((resolve, reject) => {
        let initialMs;
        const sample = () => {
          const elapsed = performance.now() - start;
          if (initialMs === undefined && document.querySelector('main').innerText !== before) initialMs = elapsed;
          const result = document.querySelector(target.selector);
          const usable = visible(result) && result.textContent.includes(target.expectedText)
            && (result.matches('[role="tabpanel"]')
              ? result.querySelectorAll('article').length >= 3 && visible(result.querySelector('.mock-notice'))
              : [...document.querySelectorAll('input, button')].every((control) => !control.disabled));
          if (usable && initialMs !== undefined) resolve({ initialMs, completionMs: elapsed });
          else if (!target.serverAuth && elapsed > 2200) reject(new Error(`No usable DOM response within 2200ms: ${target.selector}`));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      // The test awaits this after Playwright returns from click; avoid unhandled rejection meanwhile.
      window.activationTiming.catch(() => {});
    }, { capture: true, once: true });
  }, { selector, expectedText, serverAuth: Boolean(endpoint) });
  await button.click();
  let network;
  if (received) {
    const response = await received;
    expect(response.status()).toBe(status);
    expect(await response.finished()).toBeNull();
    const timing = response.request().timing();
    expect(timing.responseEnd).toBeGreaterThanOrEqual(0);
    network = { endpoint, method: response.request().method(), status: response.status(),
      responseHeadersMs: timing.responseStart, networkCompletionMs: timing.responseEnd };
  }
  return { ...await page.evaluate(() => window.activationTiming), ...(network ? { network } : {}) };
}

/** Fingerprint the already optimized dist, without building or changing it. */
function buildEvidence() {
  const directory = path.resolve('dist');
  const files = [];
  function visit(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(filename);
      else files.push({ file: path.relative(directory, filename), sha256: createHash('sha256').update(readFileSync(filename)).digest('hex') });
    }
  }
  visit(directory);
  return { mode: 'Vite optimized production build served by local preview', command: 'node node_modules/vite/bin/vite.js build', files };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 720 }]) {
  test(`local optimized-build timing at ${viewport.width}px: load, auth, seven actual tab changes`, async ({ page, browser }, testInfo) => {
    const assertGuards = guardBrowser(page);
    await page.setViewportSize(viewport);
    const evidence = {
      scope: 'Local optimized-build measurements only; no AWS/CloudFront/ALB/ECS or low-end-device claims.',
      method: 'performance.now; navigation timeOrigin to usable DOM at requestAnimationFrame; capture-phase trusted click to first DOM result and usable result at requestAnimationFrame. Auth also records request timing through response.finished(), including responseEnd; no static auth threshold. No Node wall-clock or Playwright assertion latency.',
      browser: { name: testInfo.project.use.browserName || 'chromium', version: browser.version(), headless: testInfo.project.use.headless !== false },
      viewport, network: 'Local loopback, unthrottled; fresh browser context then repeat navigation; browser HTTP caching left at defaults.',
      environment: { node: process.version, platform: os.platform(), arch: os.arch(), playwright: '1.48.2', vite: '6.0.11', baseURL: testInfo.project.use.baseURL, build: buildEvidence() },
      measurements: [],
    };
    try {
      expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(testInfo.project.use.baseURL).hostname);
      await page.addInitScript(() => {
        window.initialUsableTiming = new Promise((resolve) => {
          const visible = (node) => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
          const sample = () => {
            const fields = [...document.querySelectorAll('input')];
            const ready = visible(document.querySelector('#auth-title')) && fields.length === 2
              && fields.every((field) => visible(field) && !field.disabled)
              && visible(document.querySelector('button[type="submit"]'));
            if (ready) resolve({ usableMs: performance.now(), navigation: performance.getEntriesByType('navigation')[0]?.toJSON() });
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
      });
      for (const navigation of ['fresh-context', 'repeat']) {
        if (navigation === 'fresh-context') await page.goto('/', { waitUntil: 'domcontentloaded' });
        else await page.reload({ waitUntil: 'domcontentloaded' });
        const timing = await page.evaluate(() => window.initialUsableTiming);
        expect(timing.navigation.type).toBe(navigation === 'fresh-context' ? 'navigate' : 'reload');
        evidence.measurements.push({ operation: `initial-usable-${navigation}`, ...timing, thresholdMs: 2000 });
        expect(timing.usableMs).toBeLessThan(2000);
      }
      const username = uniqueUsername('timing');
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      await page.getByLabel('Username', { exact: true }).fill(username);
      await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
      const signup = await measureActivation(page, page.getByRole('button', { name: 'Create account', exact: true }), '[role="status"]', 'Account saved on the server', '/api/v1/auth/register', 201);
      evidence.measurements.push({ operation: 'signup', ...signup, policy: 'Server authentication network and DOM completion measured without static-auth latency thresholds' });
      await page.getByLabel('Username', { exact: true }).fill(username);
      await page.getByLabel('Password', { exact: true }).fill('wrong');
      assertGuards.expectHttp('/api/v1/auth/login', 'POST', 401);
      const invalid = await measureActivation(page, page.getByRole('button', { name: 'Log in', exact: true }), '[role="alert"]', 'does not match', '/api/v1/auth/login', 401);
      evidence.measurements.push({ operation: 'invalid-login', ...invalid, policy: 'Server authentication network and DOM completion measured without static-auth latency thresholds' });
      await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
      const login = await measureActivation(page, page.getByRole('button', { name: 'Log in', exact: true }), '#panel-strategic', 'Strategic Command', '/api/v1/auth/login', 200);
      evidence.measurements.push({ operation: 'login', ...login, policy: 'Server authentication network and DOM completion measured without static-auth latency thresholds' });
      // Leave the default view first so Strategic's measured activation is also a real switch.
      await page.getByRole('tab', { name: 'Partnerships', exact: true }).click();
      const tabApiCount = assertGuards.apiRequests.length;
      const tabs = [['strategic', 'Strategic Command'], ['executive', 'Executive Summary'], ['businessImpact', 'Business Impact'], ['operations', 'Operations'], ['riskGovernance', 'Risk & Governance'], ['innovation', 'Innovation'], ['partnerships', 'Partnerships']];
      for (const [key, label] of tabs) {
        const tab = page.getByRole('tab', { name: label, exact: true });
        await expect(tab).toHaveAttribute('aria-selected', 'false');
        const timing = await measureActivation(page, tab, `#panel-${key}`, label);
        evidence.measurements.push({ operation: 'tab-selection-to-visible-content', tab: label, ...timing, thresholdMs: 250 });
        expect(timing.completionMs).toBeLessThan(250);
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).toHaveCount(1);
      }
      expect(assertGuards.apiRequests.length).toBe(tabApiCount);
      const logout = await measureActivation(page, page.getByRole('button', { name: 'Log out', exact: true }), '[role="status"]', 'account remains', '/api/v1/auth/logout', 204);
      evidence.measurements.push({ operation: 'logout', ...logout, policy: 'Server authentication network and DOM completion measured without static-auth latency thresholds' });
      evidence.userAgent = await page.evaluate(() => navigator.userAgent);
      assertGuards();
    } finally {
      const filename = testInfo.outputPath('local-performance.json');
      await writeFile(filename, JSON.stringify(evidence, null, 2));
      await testInfo.attach('local-performance', { path: filename, contentType: 'application/json' });
    }
  });
}

test('signup, invalid login, valid login, restore, all tabs, logout and retained account', async ({ page, request }) => {
  const assertGuards = guardBrowser(page);
  await page.goto('/');
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await expect(page.getByText(/Passwords are hashed/)).toBeVisible();
  const account = await registerAccount(page);
  await page.getByLabel('Username', { exact: true }).fill(account.username);
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  assertGuards.expectHttp('/api/v1/auth/login', 'POST', 401);
  const rejected = apiResponse(page, '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('does not match');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  const session = await loginAccount(page, ` ${account.username.toUpperCase()} `);
  const restored = apiResponse(page, '/api/v1/auth/me', 'GET');
  await page.reload();
  const me = await restored;
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual(account);
  expect(me.request().headers().authorization).toBe(`Bearer ${session.access_token}`);
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
  const labels = ['Strategic Command', 'Executive Summary', 'Business Impact', 'Operations', 'Risk & Governance', 'Innovation', 'Partnerships'];
  for (const label of labels) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel', { name: label }).getByRole('heading', { name: label })).toBeVisible();
    await expect(page.getByText(account.username, { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Partnerships', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Strategic Command' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Partnerships' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Strategic Command' })).toBeFocused();
  const loggedOut = apiResponse(page, '/api/v1/auth/logout');
  await page.getByRole('button', { name: 'Log out' }).click();
  expect((await loggedOut).status()).toBe(204);
  const revoked = await request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${session.access_token}` } });
  expect(revoked.status()).toBe(401);
  await expect(page.getByRole('status')).toContainText('account remains');
  await page.reload();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(` ${account.username.toUpperCase()} `);
  await page.getByLabel('Password', { exact: true }).fill('b');
  assertGuards.expectHttp('/api/v1/auth/register', 'POST', 409);
  const duplicate = apiResponse(page, '/api/v1/auth/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await duplicate).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Back to login' }).click();
  await loginAccount(page);
  assertGuards();
});

test('mobile access and every section avoid page overflow', async ({ page }, testInfo) => {
  const assertGuards = guardBrowser(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a username');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await registerAccount(page, uniqueUsername('mobile'));
  await loginAccount(page);
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-access.png'), fullPage: true });
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  assertGuards();
});
