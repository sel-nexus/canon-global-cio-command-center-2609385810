/** Exercise the real strategic landing through UI authentication; defer execution to the parent. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 375, height: 812 }]) {
  test(`strategic default, text equivalents and inert controls on ${viewport.name}`, async ({ page }, testInfo) => {
    const assertBrowser = guardBrowser(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await registerDemo(page);
    await loginDemo(page);
    const panel = page.getByRole('tabpanel', { name: 'Strategic Command' });
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(panel.getByRole('article')).toHaveCount(3);
    for (const name of ['Business Impact', 'Risk', 'Innovation']) {
      const card = panel.getByRole('article', { name, exact: true });
      await expect(card.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(card.locator('dd')).toHaveText(['Not specified', 'Not specified', 'Not specified']);
    }
    await expect(panel.getByText(/not live or verified enterprise data/).first()).toBeVisible();
    for (const name of ['Strategic Priorities', 'Recommended Actions', 'Quick Actions']) {
      await expect(panel.getByRole('heading', { name })).toBeVisible();
    }
    const table = panel.getByRole('table', { name: 'Twelve-Month Strategic Trends — textual data' });
    await expect(table.getByRole('row')).toHaveCount(13);
    for (let month = 1; month <= 12; month += 1) {
      await expect(table.getByRole('rowheader', { name: `Month ${month}`, exact: true })).toBeVisible();
    }
    await expect(table.getByRole('cell')).toHaveText(Array(36).fill('Not specified'));
    const before = await page.evaluate(() => ({
      content: document.querySelector('[role="tabpanel"]').textContent,
      storage: Object.entries(localStorage),
      url: location.href,
    }));
    for (const name of ['Export Data', 'Predictive Analysis']) {
      const button = panel.getByRole('button', { name, exact: true });
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      // Playwright treats aria-disabled as disabled; force dispatch tests inertness deliberately.
      await button.click({ force: true });
      await button.focus();
      await button.press('Enter');
      await button.press('Space');
    }
    expect(await page.evaluate(() => ({
      content: document.querySelector('[role="tabpanel"]').textContent,
      storage: Object.entries(localStorage),
      url: location.href,
    }))).toEqual(before);
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`strategic-${viewport.name}.png`), fullPage: true });
    assertBrowser();
  });
}
