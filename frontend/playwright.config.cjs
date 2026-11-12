/** Real PostgreSQL product journeys and a separate synthetic chart harness. */
const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// Supply test settings through the environment, never reuse the product DATABASE_URL/DB_NAME.
const env = process.env;
const port = Number(env.PREVIEW_PORT || 4173);
const baseURL = env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const backendPort = Number(env.E2E_BACKEND_PORT || 8001);
const backendURL = `http://127.0.0.1:${backendPort}`;
const harnessPort = Number(env.CHART_HARNESS_PORT || 4174);
const harnessURL = `http://127.0.0.1:${harnessPort}`;
const databaseURL = env.TEST_DATABASE_URL || 'postgresql+psycopg://agent@127.0.0.1:5432/postgres';
const databaseName = `${env.TEST_DB_NAME || 'canon_browser_test'}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
if (!/^postgresql(?:\+psycopg)?:\/\//.test(databaseURL)
  || !/^canon_browser_test(?:_[a-z0-9]+)*_[a-f0-9]{12}$/.test(databaseName) || databaseName.length > 63) {
  throw new Error('Browser tests require PostgreSQL and the isolated canon_browser_test_ database prefix.');
}
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
  throw new Error('Browser test servers must remain local.');
}
const python = path.join(os.homedir(), 'venvs', 'canon', 'bin', 'python');

module.exports = defineConfig({
  globalTeardown: require.resolve('./e2e/browser-teardown.cjs'),
  metadata: { browserTestDatabase: { python, name: databaseName } },
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
    // Schema provisioning/migrations belong to backend lifespan, not the browser runner.
    command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
    cwd: path.resolve(__dirname, '../backend'),
    env: { DATABASE_URL: databaseURL, DB_NAME: databaseName,
      JWT_SECRET: env.E2E_JWT_SECRET || 'dummy-browser-test-signing-key-not-for-production',
      CORS_ORIGINS: new URL(baseURL).origin, SEED_ON_STARTUP: 'false' },
    url: `${backendURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  }, {
    command: `node node_modules/vite/bin/vite.js preview --mode test --host ${new URL(baseURL).hostname} --port ${port} --strictPort`,
    cwd: __dirname,
    env: { API_PROXY_TARGET: backendURL },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  }, {
    // Test-only chart entry is never included in production build inputs.
    command: `node node_modules/vite/bin/vite.js --mode test --host 127.0.0.1 --port ${harnessPort} --strictPort`,
    cwd: __dirname,
    url: `${harnessURL}/e2e/chart-harness.html`,
    reuseExistingServer: false,
    timeout: 30000,
  }],
});
