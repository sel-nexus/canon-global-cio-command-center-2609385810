/** Exercise local assistant journeys through real browser signup and login. */
import { test, expect } from '@playwright/test';
import { guardBrowser, registerAccount, loginAccount, apiResponse } from './helpers.js';

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
    await registerAccount(page);
    const session = await loginAccount(page);
    const saved = [];
    /** Assert each real POST and its response-only record before another activation. */
    async function assertCreated(received, prompt, text) {
      const response = await received;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toEqual({ prompt });
      expect(response.request().headers().authorization).toBe(`Bearer ${session.access_token}`);
      const record = await response.json();
      expect(Object.keys(record).sort()).toEqual(['created_at', 'id', 'role', 'text']);
      expect(record.role).toBe('assistant');
      expect(record.text).toBe(text);
      expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number.isFinite(Date.parse(record.created_at))).toBe(true);
      saved.push(record);
      await expect(page.getByRole('log').getByRole('listitem')).toHaveText(saved.map((item) => item.text));
      await expect(page.getByRole('button', { name: 'Get local response', exact: true })).toBeEnabled();
    }
    await expect(page.getByRole('log')).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Open local assistant', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    for (const [label, text] of chips) {
      const chip = page.getByRole('button', { name: label, exact: true });
      await chip.focus();
      const created = apiResponse(page, '/api/v1/assistant/messages');
      const initialHistory = saved.length === 0 ? apiResponse(page, '/api/v1/assistant/messages', 'GET') : null;
      await page.keyboard.press('Enter');
      if (initialHistory) {
        const history = await initialHistory;
        expect(history.status()).toBe(200);
        expect(await history.json()).toEqual({ items: [], total: 0 });
      }
      await assertCreated(created, label, text);
      const input = page.getByLabel('Assistant prompt', { exact: true });
      await expect(input).toHaveValue(label);
      await expect(input).toBeFocused();
      await expect(page.getByRole('log').getByRole('listitem').last()).toHaveText(text);
      await expect(page.getByText('Server rule-based simulation — not live or generative AI; not validated advice.', { exact: true })).toBeVisible();
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
      const created = apiResponse(page, '/api/v1/assistant/messages');
      await input.press('Enter');
      await assertCreated(created, prompt, response);
    }
    const hostile = '<img src=x onerror="window.hacked=true"><script>alert(1)</script>';
    await input.fill(hostile);
    const hostileResponse = apiResponse(page, '/api/v1/assistant/messages');
    await input.press('Enter');
    await assertCreated(hostileResponse, hostile, fallback);
    await expect(page.getByText(`Current prompt: ${hostile}`, { exact: true })).toBeVisible();
    await expect(page.locator('.assistant-panel img, .assistant-panel script')).toHaveCount(0);
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
    await expect(page.getByRole('log').getByRole('listitem').last()).toHaveText(fallback);
    const responses = await page.getByRole('log').getByRole('listitem').allTextContents();
    const persisted = await page.request.get('/api/v1/assistant/messages?limit=100&offset=0', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(persisted.status()).toBe(200);
    expect(await persisted.json()).toEqual({ items: saved, total: saved.length });
    expect(saved.every((item) => !item.text.includes(hostile))).toBe(true);

    const restored = apiResponse(page, '/api/v1/auth/me', 'GET');
    await page.reload();
    const me = await restored;
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual(session.account);
    await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    await expect(page.getByRole('log')).toHaveCount(0);
    const reloadedHistory = apiResponse(page, '/api/v1/assistant/messages', 'GET');
    await page.getByRole('button', { name: 'Open local assistant', exact: true }).click();
    const history = await reloadedHistory;
    expect(history.status()).toBe(200);
    expect(await history.json()).toEqual({ items: saved, total: saved.length });
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
