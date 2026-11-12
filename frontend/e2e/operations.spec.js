/** Verify Operations through actual demo login on desktop and mobile without mocks. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`Operations preserves missing values, dual-axis context and keyboard access at ${viewport.width}px`, async ({ page }) => {
    const assertBrowser = guardBrowser(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await registerDemo(page);
    await loginDemo(page);
    await page.getByRole('tab', { name: 'Operations', exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Operations' });
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(panel.getByRole('article')).toHaveCount(3);
    for (const label of ['Total incidents (MTD)', 'MTTR', 'Efficiency metrics']) {
      const card = panel.getByRole('article', { name: label, exact: true });
      await expect(card.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(card.getByText('Not specified', { exact: true })).toHaveCount(3);
    }
    await expect(panel.getByRole('heading', { name: 'Operational Trends', exact: true })).toBeVisible();
    await expect(panel.getByText(/Left axis: Incidents — solid line, circle markers/)).toBeVisible();
    await expect(panel.getByText(/Right axis: Efficiency — dashed line, square markers/)).toBeVisible();
    const table = panel.getByRole('table', { name: 'Operational Trends — textual data' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveCount(3);
    for (const label of ['Incidents', 'Efficiency']) {
      await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
    }
    await expect(table.getByRole('cell')).toHaveCount(0);
    await expect(panel.getByText('Categories and values: Not specified.', { exact: true })).toBeVisible();
    await expect(panel.getByText('Chart data not specified. Missing values are not zero.', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Units, dates, formulas and the MTTR definition are not specified or inferred/)).toBeVisible();
    await expect(panel.getByText(/Illustrative demo only — not live or verified enterprise data/)).toHaveCount(2);
    await expect(panel.getByRole('img')).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.getByText('0', { exact: true })).toHaveCount(0);
    expect(await panel.textContent()).not.toMatch(/[$€£%]|202[0-9]|hours|minutes|mean time|refresh|alerts/i);
    await page.getByRole('tab', { name: 'Business Impact', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Business Impact' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Operations', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Operations', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('region', { name: 'Operational Trends textual data' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    assertBrowser();
  });
}
