/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The public mount function in a real browser: the builder rendered into a plain element of the
 * page through `Hryvinskyi_UiFormElements/js/expression-builder/mount`, on Magento's own RequireJS,
 * Knockout, layout processor and registry (see harness/harness.js). What these tests hold: the
 * builder renders inside the host and leaves the host's own content alone, the change callback hears
 * edits and nothing else, `setValue` loads a different rule and leaves the one the builder holds
 * alone, a host holds one builder, and `destroy` — also before the builder exists — leaves no
 * rendered element, no registry entry and no reported value behind.
 */
import {test, expect} from './fixtures.mjs';
import {STORED_RULE, builderElementConfig} from './scenario.mjs';

/**
 * Mount options with the stored rule and no match-count endpoint, so the page sends no request.
 *
 * @param {Object} [overrides] Tunables or builderConfig keys to change, as builderElementConfig() takes them.
 * @returns {Object}
 */
const mountOptions = (overrides = {}) => {
    const {builderConfig = {}, ...rest} = overrides;

    return builderElementConfig({builderConfig: {countUrl: '', ...builderConfig}, ...rest});
};

/**
 * A stored rule of one Colour condition.
 *
 * @param {string} colour
 * @returns {string}
 */
const colourRule = (colour) => JSON.stringify({
    type: 'test/combine',
    attribute: null,
    operator: null,
    value: '1',
    is_value_processed: null,
    aggregator: 'all',
    conditions: [{type: 'colour', attribute: 'colour', operator: '==', value: colour, is_value_processed: null}]
});

/**
 * Mounts through the public function and waits until the builder's first row is rendered in the host.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} hostId
 * @param {Object} options
 * @returns {Promise<void>}
 */
const mountInto = async (page, hostId, options) => {
    await page.evaluate(([id, mountWith]) => window.expressionBuilderHarness.mountPublic(id, mountWith), [hostId, options]);
    await page.locator(`#${hostId} .ufe-expr__row`).first().waitFor();
};

/**
 * Lets the page run its deferred work — Knockout's deferred updates, RequireJS's callbacks — in real time.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const settle = (page) => page.evaluate(() => window.expressionBuilderHarness.settled(100));

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} hostId
 * @returns {Promise<string[]>} Every value the builder in the host reported.
 */
const reported = (page, hostId) => page.evaluate((id) => window.expressionBuilderHarness.reported(id), hostId);

/**
 * Adds an element of the page's own to a host before anything is mounted into it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} hostId
 * @returns {Promise<void>}
 */
const prepareHost = (page, hostId) => page.evaluate((id) => {
    const host = document.createElement('section');
    const own = document.createElement('p');

    host.id = id;
    host.className = 'page-own-class';
    own.className = 'page-own-child';
    own.textContent = 'Kept by the page';
    host.appendChild(own);
    document.body.appendChild(host);
}, hostId);

test.describe('mount()', () => {
    test('renders the builder inside the host and leaves the host\'s own class and children alone', async ({page, builder}) => {
        await prepareHost(page, 'pages');
        await mountInto(page, 'pages', mountOptions({label: 'Only when'}));

        const host = page.locator('#pages');

        await expect(host).toHaveClass('page-own-class');
        await expect(host.locator('> .page-own-child')).toHaveText('Kept by the page');
        await expect(host.locator('.ufe-expression-builder')).toHaveCount(1);
        await expect(host.locator('.ufe-expr__heading')).toHaveText('Only when');
        await expect(host.locator('select[aria-label="Field"]')).toHaveCount(6);
    });

    test('reports neither the value it was mounted with nor its own rewrite of it', async ({page, builder}) => {
        // Indented JSON: the builder writes the same rule back in its own, compact form.
        await mountInto(page, 'pages', mountOptions({value: JSON.stringify(STORED_RULE, null, 2)}));
        await settle(page);

        expect(await reported(page, 'pages')).toEqual([]);
    });

    test('reports an edit once, with the value the builder now holds', async ({page, builder}) => {
        await mountInto(page, 'pages', mountOptions());

        await page.locator('#pages .ufe-expr__group-header').first()
            .getByRole('button', {name: 'Match ANY one condition in this group'}).click();
        await settle(page);

        const values = await reported(page, 'pages');

        expect(values).toHaveLength(1);
        expect(JSON.parse(values[0]).aggregator).toBe('any');
    });

    test('setValue loads a different rule without reporting it, and later edits are reported', async ({page, builder}) => {
        await mountInto(page, 'pages', mountOptions());

        await page.evaluate((value) => window.expressionBuilderHarness.handle('pages').setValue(value), colourRule('blue'));

        const rows = page.locator('#pages .ufe-expr__row');

        await expect(rows).toHaveCount(1);
        await expect(rows.locator('select[aria-label="Value"]')).toHaveValue('blue');
        await settle(page);
        expect(await reported(page, 'pages')).toEqual([]);

        await rows.locator('select[aria-label="Value"]').selectOption('green');
        await settle(page);

        const values = await reported(page, 'pages');

        expect(values).toHaveLength(1);
        expect(JSON.parse(values[0]).conditions[0].value).toBe('green');
    });

    test('setValue with the value the builder holds rebuilds nothing', async ({page, builder}) => {
        await mountInto(page, 'pages', mountOptions({value: colourRule('red')}));

        await page.locator('#pages select[aria-label="Value"]').selectOption('green');
        await settle(page);
        await page.evaluate(() => {
            document.querySelector('#pages .ufe-expr__row').dataset.marked = 'yes';
        });

        // The edit handed straight back, then the value the builder was mounted with.
        const [edited] = await reported(page, 'pages');

        await page.evaluate((value) => window.expressionBuilderHarness.handle('pages').setValue(value), edited);
        await settle(page);

        await expect(page.locator('#pages .ufe-expr__row')).toHaveAttribute('data-marked', 'yes');
        expect(await reported(page, 'pages')).toEqual([edited]);
    });

    test('setValue called before the builder exists is applied once it does', async ({page, builder}) => {
        // The value is set right after mount() returns, before RequireJS has created the component.
        await page.evaluate(([options, value]) => window.expressionBuilderHarness.mountPublic('early', options)
            .then(() => window.expressionBuilderHarness.handle('early').setValue(value)), [mountOptions({value: ''}), colourRule('blue')]);

        const rows = page.locator('#early .ufe-expr__row');

        await expect(rows).toHaveCount(1);
        await expect(rows.locator('select[aria-label="Value"]')).toHaveValue('blue');
        await settle(page);
        expect(await reported(page, 'early')).toEqual([]);
    });

    test('a host holds one builder: mounting again returns the handle it has', async ({page, builder}) => {
        await mountInto(page, 'pages', mountOptions());

        expect(await page.evaluate((options) => window.expressionBuilderHarness.mountPublicAgain('pages', options), mountOptions()))
            .toBe(true);
        await settle(page);
        await expect(page.locator('#pages .ufe-expression-builder')).toHaveCount(1);
    });

    test('two hosts get two builders under two registry names; a requested name in use is refused', async ({page, builder}) => {
        await mountInto(page, 'first', mountOptions({name: 'pages_rule'}));
        await mountInto(page, 'second', mountOptions());

        await expect(page.locator('.ufe-expression-builder')).toHaveCount(2);
        expect(await page.evaluate(() => window.expressionBuilderHarness.registryHas('pages_rule'))).toBe(true);
        expect(await page.evaluate(() => window.expressionBuilderHarness.registryHas('ufe_expression_builder_1'))).toBe(true);
        expect(await page.evaluate(
            (options) => window.expressionBuilderHarness.mountPublicError('third', options, () => null),
            mountOptions({name: 'pages_rule'})
        )).toBe('Error: The expression builder name "pages_rule" is already in use');
    });

    test('refuses options it cannot pass on, before rendering anything', async ({page, builder}) => {
        const error = (options) => page.evaluate(
            (mountWith) => window.expressionBuilderHarness.mountPublicError('refused', mountWith, () => null),
            options
        );

        expect(await error(mountOptions({template: 'other'}))).toBe('TypeError: Unknown expression builder option "template"');
        expect(await error({builderConfig: {}})).toBe('TypeError: The expression builder option "value" must be a string');
        expect(await page.evaluate(() => window.expressionBuilderHarness.mountPublicError('refused', {value: '', builderConfig: {}})))
            .toBe('TypeError: The expression builder onChange callback must be a function');
        await expect(page.locator('#refused')).toBeEmpty();
    });
});

test.describe('destroy()', () => {
    test('removes what it rendered and the registry entry, keeps the host\'s own content, reports nothing more', async ({page, builder}) => {
        await prepareHost(page, 'pages');
        await mountInto(page, 'pages', mountOptions({name: 'pages_rule'}));

        // A second destroy and a later setValue are no-ops.
        await page.evaluate(() => {
            const handle = window.expressionBuilderHarness.handle('pages');

            handle.destroy();
            handle.destroy();
            handle.setValue('');
        });
        await settle(page);

        await expect(page.locator('#pages .ufe-expression-builder')).toHaveCount(0);
        await expect(page.locator('#pages > *')).toHaveCount(1);
        await expect(page.locator('#pages > .page-own-child')).toHaveText('Kept by the page');
        expect(await page.evaluate(() => window.expressionBuilderHarness.registryHas('pages_rule'))).toBe(false);
        expect(await reported(page, 'pages')).toEqual([]);
    });

    test('frees the host and the name: a new mount renders again under the same name', async ({page, builder}) => {
        await mountInto(page, 'pages', mountOptions({name: 'pages_rule'}));
        await page.evaluate(() => window.expressionBuilderHarness.handle('pages').destroy());

        await mountInto(page, 'pages', mountOptions({name: 'pages_rule', value: colourRule('red')}));

        await expect(page.locator('#pages .ufe-expression-builder')).toHaveCount(1);
        await expect(page.locator('#pages .ufe-expr__row')).toHaveCount(1);
        expect(await page.evaluate(() => window.expressionBuilderHarness.registryHas('pages_rule'))).toBe(true);
    });

    test('called before the builder exists, disposes it as it arrives and renders nothing', async ({page, builder}) => {
        // With a match-count endpoint: a builder asks for its first count a moment after it is
        // created; one left alive keeps that request open, a disposed one aborts it.
        await page.evaluate((options) => window.expressionBuilderHarness.mountPublic('pages', options)
            .then(() => window.expressionBuilderHarness.handle('pages').destroy()), builderElementConfig({name: 'pages_rule'}));
        await settle(page);

        await expect(page.locator('#pages')).toBeEmpty();
        expect(await page.evaluate(() => window.expressionBuilderHarness.registryHas('pages_rule'))).toBe(false);
        expect((await builder.requests()).filter((request) => !request.aborted)).toEqual([]);

        await mountInto(page, 'pages', mountOptions({name: 'pages_rule'}));
        await expect(page.locator('#pages .ufe-expression-builder')).toHaveCount(1);
    });
});
