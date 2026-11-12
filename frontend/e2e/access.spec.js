/** Cover the real access lifecycle and cross-section shell navigation; execution is deferred. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

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
