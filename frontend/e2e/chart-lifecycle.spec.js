/** Real ChartPanel/Chart.js integration with synthetic test-owned data, not product fixtures. */
import { test, expect } from '@playwright/test';

test('real chart resizes narrow/wide, retains equivalents, and destroys every unmounted instance', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(`Failed asset: ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/e2e/chart-harness.html');
  const canvas = page.getByRole('img', { name: 'Synthetic lifecycle chart — textual data below' });
  const table = page.getByRole('table', { name: 'Synthetic lifecycle chart — textual data' });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element) => Boolean(window.chartHarness.getChart(element)))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.chartHarness.instanceIds().length)).toBe(1);
  const id = await canvas.evaluate((element) => window.chartHarness.getChart(element).id);

  const widths = [];
  for (const width of [1280, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => canvas.evaluate((element) => {
      const chart = window.chartHarness.getChart(element);
      return chart && chart.width > 0 && Math.abs(chart.width - element.parentElement.clientWidth) <= 2;
    })).toBe(true);
    const geometry = await canvas.evaluate((element) => {
      const chart = window.chartHarness.getChart(element);
      return { id: chart.id, width: chart.width, height: chart.height, pixels: element.width, css: element.getBoundingClientRect().width };
    });
    expect(geometry.id).toBe(id);
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.pixels).toBeGreaterThan(0);
    expect(Math.abs(geometry.width - geometry.css)).toBeLessThanOrEqual(2);
    widths.push(geometry.width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText(['Period / category', 'Synthetic primary', 'Synthetic secondary']);
    for (const [label, values] of [['Synthetic A', ['3', '5']], ['Synthetic B', ['7', 'Not specified']], ['Synthetic C', ['0', '9']]]) {
      const row = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) });
      await expect(row.getByRole('cell')).toHaveText(values);
    }
  }
  expect(widths[1]).toBeLessThan(widths[0]);
  expect(widths[2]).toBeGreaterThan(widths[1]);

  const seenIds = new Set([id]);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const oldCanvas = await canvas.elementHandle();
    await page.getByRole('button', { name: 'Unmount chart', exact: true }).click();
    await expect(canvas).toHaveCount(0);
    await expect(table).toHaveCount(0);
    await expect.poll(() => oldCanvas.evaluate((element) => window.chartHarness.getChart(element) === undefined)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.chartHarness.instanceIds())).toEqual([]);
    // Resize detached to expose stale callbacks, then remount without manual destroy.
    await page.setViewportSize({ width: cycle % 2 ? 1440 : 320, height: 900 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(() => page.evaluate(() => window.chartHarness.instanceIds())).toEqual([]);
    await page.getByRole('button', { name: 'Mount chart', exact: true }).click();
    await expect(canvas).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.chartHarness.instanceIds().length)).toBe(1);
    const nextId = await canvas.evaluate((element) => window.chartHarness.getChart(element)?.id);
    expect(nextId).toBeDefined();
    expect(seenIds.has(nextId)).toBe(false);
    seenIds.add(nextId);
    await expect(table).toContainText('Not specified');
    await oldCanvas.dispose();
  }
  await page.getByRole('button', { name: 'Unmount chart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.chartHarness.instanceIds())).toEqual([]);
  expect(errors).toEqual([]);
});
