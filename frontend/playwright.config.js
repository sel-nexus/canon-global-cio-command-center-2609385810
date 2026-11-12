/** Verify browser journeys against a separately built production preview, never the dev server. */
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
const port = Number(env.PREVIEW_PORT || 4173);
const baseURL = env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const host = new URL(baseURL).hostname;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 30000,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
