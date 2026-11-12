/** Drop only this configuration's uniquely allocated browser test database in the guest. */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

module.exports = async function teardown(config) {
  const database = config.metadata.browserTestDatabase;
  if (!database || !/^canon_browser_test(?:_[a-z0-9]+)*_[a-f0-9]{12}$/.test(database.name)
    || database.name.length > 63) {
    throw new Error('Refusing teardown without an isolated browser test database name.');
  }
  // Match the configured maintenance URL without copying credentials into report metadata.
  const maintenanceURL = process.env.TEST_DATABASE_URL || 'postgresql+psycopg://agent@127.0.0.1:5432/postgres';
  await promisify(execFile)(database.python, [path.join(__dirname, 'drop_browser_database.py')], {
    env: { ...process.env, BROWSER_TEST_MAINTENANCE_URL: maintenanceURL, BROWSER_TEST_DATABASE: database.name },
    timeout: 15000,
  });
};
