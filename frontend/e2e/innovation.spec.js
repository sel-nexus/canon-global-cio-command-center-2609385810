/** Verify Innovation through real demo forms on desktop and mobile, without mocks. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`Innovation preserves unspecified data and keyboard access at ${viewport.width}px`, async ({ page }) => {
    const assertBrowser = guardBrowser(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await registerDemo(page);
    await loginDemo(page);
    await page.getByRole('tab', { name: 'Innovation', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Innovation', exact: true });
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(panel.getByRole('article')).toHaveCount(3);
    for (const label of ['AI models in production', 'Innovation pipeline value', 'Patents']) {
      const card = panel.getByRole('article', { name: label, exact: true });
      await expect(card.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(card.getByText('Not specified', { exact: true })).toHaveCount(3);
    }
    await expect(panel.getByRole('heading', { name: 'Innovation Portfolio Distribution', exact: true })).toBeVisible();
    await expect(panel.getByText('illustrative domain data and values have not been specified', { exact: true })).toBeVisible();
    await expect(panel.getByText('Chart data not specified. Missing values are not zero.', { exact: true })).toBeVisible();
    const table = panel.getByRole('table', { name: 'Innovation Portfolio Distribution — textual data' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Value', exact: true })).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await expect(table.getByRole('cell')).toHaveCount(0);
    await expect(panel.getByText('Categories and values: Not specified.', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Illustrative demo only — not live or verified enterprise data/)).toHaveCount(2);
    await expect(panel.getByRole('img')).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.getByText('0', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Risk & Governance', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Risk & Governance' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Innovation', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Innovation', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('region', { name: 'Innovation Portfolio Distribution textual data' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    assertBrowser();
  });
}
