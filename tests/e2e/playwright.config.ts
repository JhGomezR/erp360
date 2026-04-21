import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración Playwright — Suite E2E completa
 *
 * Cubre: Funcional, Regresión, Alfa/Beta, Caja Negra
 * Target: Chrome, Firefox, Mobile
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ['html',  { outputFolder: 'results/html',    open: 'never' }],
    ['json',  { outputFile:   'results/e2e.json' }],
    ['list'],
  ],
  use: {
    baseURL:           process.env.BASE_URL || 'https://atlaserp.com.co',
    trace:             'on-first-retry',
    screenshot:        'only-on-failure',
    video:             'on-first-retry',
    actionTimeout:     10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Desktop — Chrome (principal)
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
    // Desktop — Firefox (regresión multi-browser)
    {
      name:  'firefox',
      use:   { ...devices['Desktop Firefox'] },
    },
    // Mobile — Samsung Galaxy S21 (responsive)
    {
      name:  'mobile-android',
      use:   { ...devices['Galaxy S8'] },
    },
    // Mobile — iPhone 12 (iOS Safari)
    {
      name:  'mobile-ios',
      use:   { ...devices['iPhone 12'] },
    },
  ],
  // Agrupar por tipo de prueba
  grep: process.env.TEST_TYPE
    ? new RegExp(`@${process.env.TEST_TYPE}`)
    : undefined,
});
