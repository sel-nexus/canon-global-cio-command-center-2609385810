/** Product journeys use optimized preview; synthetic chart integration uses a separate test-only Vite server. */
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
const port = Number(env.PREVIEW_PORT || 4173);
const baseURL = env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const host = new URL(baseURL).hostname;
const harnessPort = Number(env.CHART_HARNESS_PORT || 4174);
const harnessURL = `http://127.0.0.1:${harnessPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: '**/chart-lifecycle.spec.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'chart-harness-chromium', testMatch: '**/chart-lifecycle.spec.js', use: { ...devices['Desktop Chrome'], baseURL: harnessURL } },
  ],
  webServer: [{
    command: `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000,
  }, {
    // Test-only entry served separately; never added to production build inputs.
    command: `node node_modules/vite/bin/vite.js --mode test --host 127.0.0.1 --port ${harnessPort} --strictPort`,
    url: `${harnessURL}/e2e/chart-harness.html`,
    reuseExistingServer: true,
    timeout: 30000,
  }],
});
