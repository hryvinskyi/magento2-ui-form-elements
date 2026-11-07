/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Browser component tests of the expression builder: Chromium only, against the harness server each
 * worker starts on a free localhost port (browser/fixtures.mjs). Nothing else is contacted.
 *
 * Run from this directory: `npm ci && npx playwright install chromium`, then `npx playwright test`.
 */
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir: './browser',
    testMatch: '**/*.spec.mjs',
    outputDir: './test-results',
    forbidOnly: true,
    retries: 0,
    reporter: [['list']],
    use: {
        trace: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']}
        }
    ]
});
