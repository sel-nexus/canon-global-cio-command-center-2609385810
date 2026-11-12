/** Exercise local assistant journeys through real browser signup and login. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerDemo, loginDemo } from './helpers.js';

const chips = [
  ['Q4 Board Presentation Ready', 'Focus on innovation acceleration, risk reduction, and board readiness initiatives.'],
  ['TCS Contract Expansion Analysis', 'TCS partnership expansion recommended based on ROI growth and delivery performance.'],
  ['Risk Mitigation Plan', 'Strengthen cybersecurity posture and compliance tracking across regions.'],
  ['Innovation Investment Strategy', 'Increase investment in AI/ML and automation pipelines to drive long-term value.'],
];
const fallback = 'Only the supported demo topics Q4, TCS, risk, and innovation are available.';

for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 640 }]) {
  test(`assistant chips, keywords, reload and keyboard at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const assertClean = guardBrowser(page);
    await page.goto('/');
    await registerDemo(page);
    await loginDemo(page);
    await expect(page.getByRole('log')).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Open local assistant', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    for (const [label, text] of chips) {
      const chip = page.getByRole('button', { name: label, exact: true });
      await chip.focus();
      await page.keyboard.press('Enter');
      const input = page.getByLabel('Assistant prompt', { exact: true });
      await expect(input).toHaveValue(label);
      await expect(input).toBeFocused();
      await expect(page.getByRole('log').getByRole('listitem').last()).toHaveText(text);
      await expect(page.getByText('Local rule-based simulation — not live or generative AI; not validated advice.', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Close assistant', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Get local response', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(chip).toBeFocused();
      await expect(page.getByRole('log')).toHaveCount(0);
    }

    await toggle.focus();
    await page.keyboard.press('Space');
    const input = page.getByLabel('Assistant prompt', { exact: true });
    await expect(input).toBeFocused();
    for (const [prompt, response] of [
      ['prepare Q4', chips[0][1]], ['review TCS!', chips[1][1]],
      ['(RISK)', chips[2][1]], ['INNOVATION strategy', chips[3][1]],
      ['innovation risk tcs q4', chips[0][1]], ['innovation risk tcs', chips[1][1]],
      ['innovation risk', chips[2][1]], ['brisk innovations q40 atcs', fallback],
      ['unrecognized topic', fallback],
    ]) {
      await input.fill(prompt);
      await input.press('Enter');
      await expect(page.getByRole('log').getByRole('listitem').last()).toHaveText(response);
    }
    const hostile = '<img src=x onerror="window.hacked=true"><script>alert(1)</script>';
    await input.fill(hostile);
    await input.press('Enter');
    await expect(page.getByText(`Current prompt: ${hostile}`, { exact: true })).toBeVisible();
    await expect(page.locator('.assistant-panel img, .assistant-panel script')).toHaveCount(0);
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
    await expect(page.getByRole('log').getByRole('listitem').last()).toHaveText(fallback);
    const responses = await page.getByRole('log').getByRole('listitem').allTextContents();
    const stored = await page.evaluate(() => localStorage.getItem('canonCio.assistant.v1'));
    expect(stored).not.toContain(hostile);
    const saved = JSON.parse(stored);
    expect(saved.version).toBe(1);
    expect(saved.messages.every((message) => message.role === 'assistant' && Object.keys(message).sort().join(',') === 'createdAt,id,role,text')).toBe(true);

    await page.reload();
    await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    await expect(page.getByRole('log')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open local assistant', exact: true }).click();
    await expect(page.getByRole('log').getByRole('listitem')).toHaveText(responses);
    await expect(page.getByLabel('Assistant prompt', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open local assistant', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    // Non-modal: backward tabbing leaves the assistant and reaches the dashboard.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !document.activeElement.closest('.assistant-disclosure'))).toBe(true);
    await page.getByRole('tab', { name: 'Operations', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Operations' })).toBeVisible();
    await expect(page.getByRole('log')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open local assistant', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    assertClean();
  });
}
