// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone-width run for the map's mobile-only controls (sidebar/legend FABs).
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /map\.spec\.js/ },
  ],
  webServer: {
    command: `node e2e/static-server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/organization-network-map.html`,
    reuseExistingServer: !process.env.CI,
  },
});
