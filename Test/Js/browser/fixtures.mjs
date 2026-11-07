/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Playwright fixtures for the expression builder's browser tests.
 *
 * - `harnessServer` (one per worker) serves the harness page and the Magento and module sources it
 *   loads, on 127.0.0.1 and a free port (harness/server.mjs).
 * - `builder` opens the harness page and mounts the element with a given config; it fails the test
 *   when the page logs an error or a warning, throws, or asks for a file that is not there — a
 *   template that fails to load renders nothing and would otherwise pass for an empty rule.
 */
import {test as base, expect} from '@playwright/test';
import {startHarnessServer} from './harness/server.mjs';

export {expect};

export const test = base.extend({
    harnessServer: [
        async ({}, use) => {
            const server = await startHarnessServer();

            await use(server);
            await server.close();
        },
        {scope: 'worker'}
    ],

    builder: async ({page, harnessServer}, use) => {
        const problems = [];

        page.on('pageerror', (error) => problems.push('page error: ' + error.message));
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') {
                problems.push(`console ${message.type()}: ${message.text()}`);
            }
        });
        page.on('response', (response) => {
            if (response.status() >= 400) {
                problems.push(`HTTP ${response.status()}: ${response.url()}`);
            }
        });

        await page.goto(harnessServer.url + '/');

        await use({
            /**
             * Mounts the element and waits until its first row is rendered.
             *
             * @param {Object} config
             * @returns {Promise<void>}
             */
            mount: async (config) => {
                await page.evaluate((elementConfig) => window.expressionBuilderHarness.mount(elementConfig), config);
                await page.locator('.ufe-expr__row').first().waitFor();
            },

            /**
             * The rule the element currently holds, parsed from its field value.
             *
             * @returns {Promise<Object>}
             */
            storedRule: async () => JSON.parse(
                await page.evaluate(() => window.expressionBuilderHarness.builder().value())
            ),

            /**
             * @returns {Promise<Array<{url: string, body: string, aborted: boolean}>>}
             */
            requests: () => page.evaluate(() => window.expressionBuilderHarness.requests()),

            /**
             * Delivers a response to one recorded request and lets the page settle — in real time, so
             * a test that controls the page's clock can answer as well.
             *
             * @param {number} index
             * @param {*} body JSON body.
             * @param {number} [status] HTTP status; anything but 2xx is a refused request.
             * @returns {Promise<void>}
             */
            answer: (index, body, status = 200) => page.evaluate(([position, json, code]) => {
                window.expressionBuilderHarness.answer(position, code, json);

                return window.expressionBuilderHarness.settled(50);
            }, [index, body, status]),

            /**
             * Makes requests sent from now on fail the moment the component aborts them, as a real
             * `fetch` does, instead of staying pending.
             *
             * @returns {Promise<void>}
             */
            honourAbort: () => page.evaluate(() => window.expressionBuilderHarness.honourAbort()),

            /**
             * Calls the element's destroy().
             *
             * @returns {Promise<void>}
             */
            destroy: () => page.evaluate(() => window.expressionBuilderHarness.builder().destroy())
        });

        expect(problems, 'the harness page ran without errors, warnings or missing files').toEqual([]);
    }
});
