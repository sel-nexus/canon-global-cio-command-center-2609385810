/** Compatibility entry; the e2e script uses CJS to avoid Playwright 1.48/Node 24 ESM loader hangs. */
export { default } from './playwright.config.cjs';
