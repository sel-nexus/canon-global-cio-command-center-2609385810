/** Exercise real demo access, partnership content and mobile keyboard navigation. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

test('Partnerships shows only approved content and inert intelligence areas', async ({ page }) => {
  const verifyBrowser = guardBrowser(page);
  await page.goto('/');
  await registerDemo(page);
  await loginDemo(page);
  await page.getByRole('tab', { name: 'Partnerships', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Partnerships' });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(panel.getByRole('article')).toHaveCount(4);
  for (const label of ['SLA performance', 'ROI', 'innovation velocity', 'delivery excellence']) {
    const card = panel.getByRole('article', { name: label, exact: true });
    await expect(card.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(card.getByText('Not specified', { exact: true })).toHaveCount(3);
  }
  await expect(panel.getByText(/Compare supplied Investment and Value over Time/)).toBeVisible();
  const table = panel.getByRole('table', { name: 'Investment and Value Timeline — textual data' });
  await expect(table.getByRole('columnheader')).toHaveText(['Period / category', 'Investment', 'Value']);
  await expect(panel.getByText('Categories and values: Not specified.')).toBeVisible();
  await expect(panel.getByText('Chart data not specified. Missing values are not zero.')).toBeVisible();
  await expect(panel.getByText(/Illustrative demo only/)).toHaveCount(2);
  const before = await page.evaluate(() => ({ storage: JSON.stringify(localStorage), url: location.href }));
  for (const name of ['Summary', 'Opportunities', 'Actions']) {
    const area = panel.getByRole('region', { name, exact: true });
    await expect(area).toContainText('Not specified.');
    await expect(area.getByRole('button')).toHaveCount(0);
    await expect(area.getByRole('link')).toHaveCount(0);
    await area.getByRole('heading', { name, exact: true }).click();
    await expect(area).toContainText('Not specified.');
  }
  await expect(panel.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open local assistant', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Local assistant', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => ({ storage: JSON.stringify(localStorage), url: location.href }))).toEqual(before);
  await expect(panel).not.toContainText(/[$€£%]|202[0-9]|TCS|recommended/i);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: 'Partnerships', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Partnerships' })).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(panel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('region', { name: 'Investment and Value Timeline textual data' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(panel.getByRole('region', { name: 'Actions', exact: true })).toContainText('No action controls are available.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  verifyBrowser();
});
