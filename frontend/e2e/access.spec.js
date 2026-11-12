/** Cover the real access lifecycle and cross-section shell navigation; execution is deferred. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Time a real activation from capture-phase click to rendered DOM on animation frames.
 * Initial auth response means the first visible result change, not receipt of the click.
 * Completion means the expected result plus enabled usable controls/content.
 */
async function measureActivation(page, button, selector, expectedText) {
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
          else if (elapsed > 2200) reject(new Error(`No usable DOM response within 2200ms: ${target.selector}`));
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      // The test awaits this after Playwright returns from click; avoid unhandled rejection meanwhile.
      window.activationTiming.catch(() => {});
    }, { capture: true, once: true });
  }, { selector, expectedText });
  await button.click();
  return page.evaluate(() => window.activationTiming);
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
      method: 'performance.now; navigation timeOrigin to usable DOM at requestAnimationFrame; capture-phase trusted click to first DOM result and usable result at requestAnimationFrame. No Node wall-clock or Playwright assertion latency.',
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
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const timing = await page.evaluate(() => window.initialUsableTiming);
        evidence.measurements.push({ operation: `initial-usable-${navigation}`, ...timing, thresholdMs: 2000 });
        expect(timing.usableMs).toBeLessThan(2000);
      }
      await page.getByRole('button', { name: 'Create a demo account', exact: true }).click();
      await page.getByLabel('Username', { exact: true }).fill('timing.demo');
      await page.getByLabel('Password', { exact: true }).fill('a');
      const signup = await measureActivation(page, page.getByRole('button', { name: 'Create account', exact: true }), '[role="status"]', 'Demo account saved');
      evidence.measurements.push({ operation: 'signup', ...signup, initialThresholdMs: 250, completionThresholdMs: 2000 });
      expect(signup.initialMs).toBeLessThan(250);
      expect(signup.completionMs).toBeLessThan(2000);
      await page.getByLabel('Username', { exact: true }).fill('timing.demo');
      await page.getByLabel('Password', { exact: true }).fill('wrong');
      const invalid = await measureActivation(page, page.getByRole('button', { name: 'Log in', exact: true }), '[role="alert"]', 'does not match');
      evidence.measurements.push({ operation: 'invalid-login', ...invalid, initialThresholdMs: 250, completionThresholdMs: 2000 });
      expect(invalid.initialMs).toBeLessThan(250);
      expect(invalid.completionMs).toBeLessThan(2000);
      await page.getByLabel('Password', { exact: true }).fill('a');
      const login = await measureActivation(page, page.getByRole('button', { name: 'Log in', exact: true }), '#panel-strategic', 'Strategic Command');
      evidence.measurements.push({ operation: 'login', ...login, initialThresholdMs: 250, completionThresholdMs: 2000 });
      expect(login.initialMs).toBeLessThan(250);
      expect(login.completionMs).toBeLessThan(2000);
      // Leave the default view first so Strategic's measured activation is also a real switch.
      await page.getByRole('tab', { name: 'Partnerships', exact: true }).click();
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
      const logout = await measureActivation(page, page.getByRole('button', { name: 'Log out', exact: true }), '[role="status"]', 'account remains');
      evidence.measurements.push({ operation: 'logout', ...logout, initialThresholdMs: 250, completionThresholdMs: 2000 });
      expect(logout.initialMs).toBeLessThan(250);
      expect(logout.completionMs).toBeLessThan(2000);
      evidence.userAgent = await page.evaluate(() => navigator.userAgent);
      assertGuards();
    } finally {
      const filename = testInfo.outputPath('local-performance.json');
      await writeFile(filename, JSON.stringify(evidence, null, 2));
      await testInfo.attach('local-performance', { path: filename, contentType: 'application/json' });
    }
  });
}

test('signup, invalid login, valid login, restore, all tabs, logout and retained account', async ({ page }) => {
  const assertGuards = guardBrowser(page);
  await page.goto('/');
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await expect(page.getByText(/stored unencrypted/)).toBeVisible();
  await registerDemo(page);
  await page.getByLabel('Username', { exact: true }).fill('cio.browser');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('does not match');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await loginDemo(page, ' CIO.BROWSER ');
  await page.reload();
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
  const labels = ['Strategic Command', 'Executive Summary', 'Business Impact', 'Operations', 'Risk & Governance', 'Innovation', 'Partnerships'];
  for (const label of labels) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel', { name: label }).getByRole('heading', { name: label })).toBeVisible();
    await expect(page.getByText('cio.browser', { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Partnerships', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Strategic Command' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Partnerships' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Strategic Command' })).toBeFocused();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('status')).toContainText('account remains');
  await page.reload();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create a demo account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(' CIO.BROWSER ');
  await page.getByLabel('Password', { exact: true }).fill('b');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Back to login' }).click();
  await loginDemo(page);
  assertGuards();
});

test('mobile access and every section avoid page overflow', async ({ page }, testInfo) => {
  const assertGuards = guardBrowser(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a username');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await registerDemo(page, 'mobile.demo');
  await loginDemo(page, 'mobile.demo');
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
