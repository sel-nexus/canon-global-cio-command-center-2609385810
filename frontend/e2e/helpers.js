/** Share browser-only journey setup and guards without mocking product behavior. */
import { expect } from '@playwright/test';

/** Capture browser errors and forbid every product fetch/XHR or failed asset request.
 * Args:
 *   page: Fresh browser page before initial navigation.
 * Returns:
 *   An assertion callback to use after the complete journey.
 */
export function guardBrowser(page) {
  const errors = [];
  const network = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) network.push(request.url());
  });
  page.on('requestfailed', (request) => errors.push(`Failed static request: ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  return () => {
    expect(errors).toEqual([]);
    expect(network).toEqual([]);
  };
}

/** Create an isolated demo account through the actual form, without seeded storage. */
export async function registerDemo(page, username = 'cio.browser', password = 'a') {
  await page.getByRole('button', { name: 'Create a demo account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Demo account saved');
}

/** Submit matching credentials through the displayed login controls. */
export async function loginDemo(page, username = 'cio.browser', password = 'a') {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
}
