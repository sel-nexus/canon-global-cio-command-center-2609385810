/** Verify risk content through actual server access on desktop and mobile without mocks. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerAccount, loginAccount } from './helpers.js';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`Risk & Governance preserves caveats and keyboard navigation at ${viewport.width}px`, async ({ page }) => {
    const assertBrowser = guardBrowser(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await registerAccount(page);
    await loginAccount(page);
    const tab = page.getByRole('tab', { name: 'Risk & Governance', exact: true });
    await tab.click();
    const panel = page.getByRole('tabpanel', { name: 'Risk & Governance' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('article')).toHaveCount(3);
    for (const label of ['Compliance Score', 'Cybersecurity Maturity', 'Data Governance Score']) {
      const card = panel.getByRole('article', { name: label, exact: true });
      await expect(card.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(card.getByText('Not specified', { exact: true })).toHaveCount(3);
    }
    await expect(panel.getByText(/Illustrative demo only — not live or verified enterprise data/)).toBeVisible();
    await expect(panel.getByText(/Missing values remain Not specified; they are not zero/)).toBeVisible();
    await expect(panel.getByText(/Source and calculation are not established/)).toBeVisible();
    await expect(panel.getByText(/Framework, severity scale and units are not specified or inferred/)).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.getByRole('img')).toHaveCount(0);
    await expect(panel.getByText('0', { exact: true })).toHaveCount(0);
    expect(await panel.textContent()).not.toMatch(/NIST|ISO|Critical|Warning|Excellent|[$€£%]|refresh|remediat/i);
    await tab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Operations', exact: true })).toBeFocused();
    await expect(page.getByRole('tabpanel', { name: 'Operations' })).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    assertBrowser();
  });
}
