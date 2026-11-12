/** Verify authenticated executive navigation, neutral mobile content and local behavior. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerAccount, loginAccount } from './helpers.js';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`Executive Summary remains neutral and keyboard accessible at ${viewport.width}px`, async ({ page }) => {
    const assertBrowser = guardBrowser(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await registerAccount(page);
    await loginAccount(page);
    await page.getByRole('tab', { name: 'Executive Summary', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Executive Summary' });
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(panel.getByRole('article')).toHaveCount(4);
    for (const label of ['IT Health Score', 'Availability', 'Security Posture', 'Transformation Index']) {
      const card = panel.getByRole('article', { name: label, exact: true });
      await expect(card.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(card.getByText('Not specified', { exact: true })).toHaveCount(3);
    }
    await expect(panel.getByRole('heading', { name: 'Regional KPI Comparison' })).toBeVisible();
    await expect(panel.getByText(/Radar comparison of supplied regional KPIs/)).toBeVisible();
    await expect(panel.getByRole('table', { name: 'Regional KPI Comparison — textual data' })).toBeVisible();
    await expect(panel.getByRole('table', { name: 'Regional performance statuses' })).toBeVisible();
    await expect(panel.getByText('Regions and statuses: Not specified.')).toBeVisible();
    await expect(panel.getByText('Radar axes and values: Not specified.')).toBeVisible();
    await expect(panel.getByRole('img')).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.getByText('0', { exact: true })).toHaveCount(0);
    for (const status of ['Excellent', 'Good', 'Warning', 'Critical']) {
      await expect(panel.getByText(status, { exact: true })).toHaveCount(0);
    }
    await page.getByRole('tab', { name: 'Strategic Command', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Executive Summary', exact: true })).toBeFocused();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('region', { name: 'Regional KPI Comparison textual data' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('region', { name: 'Regional performance status table' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    assertBrowser();
  });
}
