import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Chrome already installed on this machine, so nothing needs downloading.
    channel: 'chrome',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // Seeds a separate database, builds, and serves the production build.
    command: `node scripts/reset-e2e-db.mjs && npm run content:seed && npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      WORDCRAFT_DB: 'data/e2e.sqlite',
      ANTHROPIC_API_KEY: 'sk-ant-e2e-fake-key-for-tests-only',
      WORDCRAFT_AI_MOCK: 'fixture',
    },
  },
});
