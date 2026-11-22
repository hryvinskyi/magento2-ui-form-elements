/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The expression builder in a real browser: the component and its templates rendered by Magento's
 * own RequireJS, Knockout and template engine (see harness/harness.js for what runs and what is
 * stood in). What these tests hold that the Node suites cannot: every template binding resolves
 * against the component, the dropdowns keep their ARIA contract under the keyboard, a keyboard
 * reorder moves the node and says so, the picker's suggest and list editors and its option-list
 * fetch render and behave, and destroy() leaves no late answer, no pending timer, no live computed
 * and no pointer capture behind.
 *
 * Tests that depend on a timer hold the page's clock (`holdClock`) and advance it by hand, so the
 * suggest debounce, the slow-endpoint wait and every timer destroy() must clear are exact instead
 * of racing real time.
 */
import {test, expect} from './fixtures.mjs';
import {COHERENCE, builderElementConfig, pickerRule} from './scenario.mjs';

/**
 * The field type of the component's built-in attribute picker.
 */
const PICKER = 'product_attribute_picker';

/**
 * Field selects in document order — one per condition row.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Locator}
 */
const fieldSelects = (page) => page.locator('select[aria-label="Field"]');

/**
 * The field type of every row, in document order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const rowFieldTypes = (page) => fieldSelects(page).evaluateAll((selects) => selects.map((select) => select.value));

/**
 * The row whose field select holds the given type.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @returns {import('@playwright/test').Locator}
 */
const rowOf = (page, type) => page.locator('.ufe-expr__row').filter({
    has: page.locator(`select[aria-label="Field"] option:checked[value="${type}"]`)
});

/**
 * The root group's header — the first group header in the document.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Locator}
 */
const rootHeader = (page) => page.locator('.ufe-expr__group-header').first();

/**
 * The page's idle time before a keystroke becomes a suggest request, as the component defaults it.
 */
const SUGGEST_DEBOUNCE = 250;

/**
 * How long a paste report stays under the pills, as the component defaults it.
 */
const PASTE_NOTICE_LIFETIME = 4000;

/**
 * How long a request may take before the component aborts it.
 */
const REQUEST_DEADLINE = 15000;

/**
 * Far past every timer the component starts, its request deadline included.
 */
const PAST_EVERY_TIMER = 60000;

/**
 * Takes the page's timers into the test's hands: from here on nothing the component schedules fires
 * until the test advances the clock. Called once the element is mounted — the loader RequireJS
 * mounts it with schedules its own steps on timers.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const holdClock = async (page) => {
    await page.clock.install({time: 0});
    await page.clock.pauseAt(1000);
};

/**
 * The value column of the nth condition row, in document order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} position
 * @returns {import('@playwright/test').Locator}
 */
const valueColumn = (page, position) => page.locator('.ufe-expr__row').nth(position).locator('.ufe-expr__col--value');

/**
 * The paste report under the pills of the nth condition row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} position
 * @returns {import('@playwright/test').Locator}
 */
const pasteReport = (page, position) => valueColumn(page, position).locator('[role="status"]');

/**
 * Mounts a rule of attribute-picker rows alone, without the match count unless asked for.
 *
 * @param {Object} builder The fixture.
 * @param {Array<[string, string, string]>} rows Attribute code, operator and stored value per row.
 * @param {Object} [overrides] Further element config, as builderElementConfig() takes it.
 * @returns {Promise<void>}
 */
const mountPickerRows = (builder, rows, overrides = {}) => builder.mount(builderElementConfig({
    value: JSON.stringify(pickerRule(rows)),
    ...overrides,
    builderConfig: {countUrl: '', ...overrides.builderConfig}
}));

/**
 * Pastes text into an input the way the browser does: a paste event carrying the text on its
 * clipboard data.
 *
 * @param {import('@playwright/test').Locator} input
 * @param {string} text
 * @returns {Promise<boolean>} True when the page left the event's default action alone — the paste
 *     went on into the input — false when the component consumed it as a list.
 */
const paste = (input, text) => input.evaluate((element, payload) => {
    const data = new DataTransfer();

    data.setData('text/plain', payload);

    return element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
}, text);

/**
 * The URL of every request sent so far, in order.
 *
 * @param {Object} builder The fixture.
 * @returns {Promise<string[]>}
 */
const requestedUrls = async (builder) => (await builder.requests()).map((request) => request.url);

test.describe('template bindings', () => {
    test('renders the stored rule: rows, a nested group, every value editor and the preview', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        expect(await rowFieldTypes(page)).toEqual(['colour', 'size', 'name', 'section', 'code', PICKER]);

        const nested = page.getByRole('group', {name: 'Nested condition group'});

        await expect(nested).toHaveCount(1);
        await expect(nested.locator('select[aria-label="Field"]')).toHaveCount(2);
        await expect(rootHeader(page).locator('.ufe-expr__group-summary')).toHaveText('4 conditions · 1 group');
        await expect(nested.locator('.ufe-expr__group-summary')).toHaveText('2 conditions');

        const colour = rowOf(page, 'colour');

        await expect(colour.locator('select[aria-label="Operator"]')).toHaveValue('==');
        await expect(colour.locator('select[aria-label="Value"]')).toHaveValue('red');
        await expect(rowOf(page, 'size').locator('.ufe-expr__pill:not(.ufe-expr__pill--more)'))
            .toHaveText(['Medium', 'Large']);
        await expect(rowOf(page, 'size').getByRole('button', {name: 'Clear all selected values'})).toBeVisible();
        await expect(rowOf(page, 'section').locator('.ufe-expr__pill')).toHaveText(['Garden']);
        await expect(rowOf(page, 'name').locator('input.ufe-expr__input')).toHaveValue('chair');

        const code = rowOf(page, 'code').getByRole('combobox', {name: 'Value'});

        await expect(code).toHaveValue('Code 3');
        await expect(page.locator('#' + await code.getAttribute('aria-describedby'))).toHaveText('c3');

        const picker = rowOf(page, PICKER);
        const attribute = picker.getByRole('combobox', {name: 'Attribute'});

        await expect(attribute).toHaveValue('Material');
        await expect(page.locator('#' + await attribute.getAttribute('aria-describedby'))).toHaveText('material');
        await expect(picker.locator('select[aria-label="Value"]')).toHaveValue('wood');

        await expect(page.locator('.ufe-expr__preview')).toHaveText(
            'Colour is Red AND Size is one of {Medium, Large} AND ( Name is "chair" OR Section is one of {Garden} )'
            + ' AND Code is Code 3 AND Material is Wood'
        );
        await expect(page.locator('.ufe-expr__preview')).toHaveAttribute('aria-live', 'polite');
    });

    test('renders static wording through the i18n binding and the translation dictionary', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        // The harness dictionary translates exactly this phrase; the rest stay in English.
        await expect(page.locator('.ufe-expr__preview-title')).toHaveText('Expression Preview [dictionary]');
        await expect(page.getByRole('button', {name: '+ Add condition'})).toHaveCount(2);
        await expect(page.getByRole('button', {name: '+ Add group'})).toHaveCount(2);
        await expect(rootHeader(page).getByRole('button', {name: 'Match ALL conditions in this group'})).toHaveText('ALL');
    });

    test('the ALL/ANY toggle switches the group and states it everywhere', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const header = rootHeader(page);
        const all = header.getByRole('button', {name: 'Match ALL conditions in this group'});
        const any = header.getByRole('button', {name: 'Match ANY one condition in this group'});
        const nested = page.getByRole('group', {name: 'Nested condition group'});

        await expect(all).toHaveAttribute('aria-pressed', 'true');
        await expect(any).toHaveAttribute('aria-pressed', 'false');
        await expect(nested.getByRole('button', {name: 'Match ANY one condition in this group'}))
            .toHaveAttribute('aria-pressed', 'true');

        await any.click();

        await expect(any).toHaveAttribute('aria-pressed', 'true');
        await expect(all).toHaveAttribute('aria-pressed', 'false');
        await expect(header.locator('.ufe-expr__group-heading')).toHaveText('At least one condition below must match');
        await expect(page.locator('.ufe-expr__preview')).toHaveText(
            'Colour is Red OR Size is one of {Medium, Large} OR ( Name is "chair" OR Section is one of {Garden} )'
            + ' OR Code is Code 3 OR Material is Wood'
        );
        expect((await builder.storedRule()).aggregator).toBe('any');
    });

    test('adding a condition renders a row, focuses its field and stores it', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        await page.getByRole('button', {name: '+ Add condition'}).last().click();

        await expect(fieldSelects(page)).toHaveCount(7);
        await expect(fieldSelects(page).nth(6)).toBeFocused();
        await expect(rootHeader(page).locator('.ufe-expr__group-summary')).toHaveText('5 conditions · 1 group');
        expect((await builder.storedRule()).conditions).toHaveLength(6);
    });
});

test.describe('dropdowns', () => {
    test('a multi-value list follows the combobox contract under the keyboard', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const input = rowOf(page, 'size').getByRole('combobox', {name: 'Search values to add'});

        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(input).not.toHaveAttribute('aria-controls');

        await input.focus();
        await expect(input).toHaveAttribute('aria-expanded', 'true');

        const list = page.locator('#' + await input.getAttribute('aria-controls'));
        const options = list.getByRole('option');

        await expect(list).toHaveAttribute('role', 'listbox');
        await expect(list).toHaveAttribute('aria-multiselectable', 'true');
        await expect(options).toHaveText(['Small', 'Extra large']);
        expect(await options.evaluateAll((entries) => entries.map((entry) => entry.getAttribute('aria-selected'))))
            .toEqual(['false', 'false']);
        await expect(input).not.toHaveAttribute('aria-activedescendant');

        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(0).getAttribute('id'));
        await expect(options.nth(0)).toHaveClass(/ufe-expr__autocomplete-option--active/);

        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(1).getAttribute('id'));

        await input.press('Home');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(0).getAttribute('id'));

        // Up from the first entry returns to the typed text; up again wraps to the last entry.
        await input.press('ArrowUp');
        await expect(input).not.toHaveAttribute('aria-activedescendant');
        await input.press('ArrowUp');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(1).getAttribute('id'));

        await input.press('Enter');

        await expect(rowOf(page, 'size').locator('.ufe-expr__pill:not(.ufe-expr__pill--more)'))
            .toHaveText(['Medium', 'Large', 'Extra large']);
        await expect(options).toHaveText(['Small']);
        await expect(input).toBeFocused();
        expect((await builder.storedRule()).conditions[1].value).toEqual('m,l,xl');

        await input.press('Escape');

        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(list).toHaveCount(0);
    });

    test('the option tree exposes levels and expansion, and Space toggles selection', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const input = rowOf(page, 'section').getByRole('combobox', {name: 'Search values to add'});

        await input.focus();
        await expect(input).toHaveAttribute('aria-expanded', 'true');

        const nodes = page.locator('#' + await input.getAttribute('aria-controls')).getByRole('option');
        const home = nodes.filter({hasText: 'Home'});

        await expect(nodes).toHaveCount(2);
        await expect(home).toHaveAttribute('aria-level', '1');
        await expect(home).toHaveAttribute('aria-expanded', 'false');
        await expect(nodes.filter({hasText: 'Office'})).not.toHaveAttribute('aria-expanded');

        await input.press('ArrowDown');
        await input.press('ArrowRight');

        await expect(home).toHaveAttribute('aria-expanded', 'true');
        await expect(nodes).toHaveCount(4);

        const kitchen = nodes.filter({hasText: 'Kitchen'});

        await expect(kitchen).toHaveAttribute('aria-level', '2');
        await expect(kitchen).toHaveAttribute('aria-selected', 'false');
        await expect(nodes.filter({hasText: 'Garden'})).toHaveAttribute('aria-selected', 'true');

        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await kitchen.getAttribute('id'));
        await input.press('Space');

        await expect(kitchen).toHaveAttribute('aria-selected', 'true');
        await expect(rowOf(page, 'section').locator('.ufe-expr__pill')).toHaveText(['Kitchen', 'Garden']);

        await input.press('ArrowUp');
        await input.press('ArrowLeft');

        await expect(home).toHaveAttribute('aria-expanded', 'false');
        await expect(nodes).toHaveCount(2);
    });

    test('Enter on a collapsed tree parent expands it, and on an expanded one selects it', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const row = rowOf(page, 'section');
        const input = row.getByRole('combobox', {name: 'Search values to add'});

        await input.focus();

        const nodes = page.locator('#' + await input.getAttribute('aria-controls')).getByRole('option');
        const home = nodes.filter({hasText: 'Home'});

        await input.press('ArrowDown');
        await input.press('Enter');

        await expect(home).toHaveAttribute('aria-expanded', 'true');
        await expect(home).toHaveAttribute('aria-selected', 'false');
        await expect(nodes).toHaveCount(4);
        await expect(row.locator('.ufe-expr__pill')).toHaveText(['Garden']);

        await input.press('Enter');

        await expect(home).toHaveAttribute('aria-selected', 'true');
        await expect(home).toHaveAttribute('aria-expanded', 'true');
        await expect(row.locator('.ufe-expr__pill')).toHaveText(['Home', 'Garden']);
    });

    test('the searchable single-select filters, commits by keyboard and closes', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const input = rowOf(page, 'code').getByRole('combobox', {name: 'Value'});

        await input.focus();
        await expect(input).toHaveAttribute('aria-expanded', 'true');

        const list = page.locator('#' + await input.getAttribute('aria-controls'));
        const options = list.getByRole('option');

        await expect(list).toHaveAttribute('role', 'listbox');
        await expect(list).not.toHaveAttribute('aria-multiselectable');
        await expect(options).toHaveCount(20);
        await expect(options.filter({hasText: 'Code 3'})).toHaveAttribute('aria-selected', 'true');
        await expect(options.filter({hasText: 'Code 4'})).toHaveAttribute('aria-selected', 'false');

        await input.fill('Code 17');

        await expect(options).toHaveCount(1);
        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(0).getAttribute('id'));
        await input.press('Enter');

        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(input).toHaveValue('Code 17');
        await expect(page.locator('#' + await input.getAttribute('aria-describedby'))).toHaveText('c17');
        expect((await builder.storedRule()).conditions[3].value).toBe('c17');
    });
});

test.describe('reorder', () => {
    test('arrow keys on a drag handle move the row, keep focus on it and announce the position', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const status = page.locator('.ufe-expr__move-status');
        const handle = rowOf(page, 'colour').getByRole('button', {name: 'Reorder condition'});

        // Rendered from first paint and empty: a live region inserted with its first message is
        // announced only by chance.
        await expect(status).toHaveCount(1);
        await expect(status).toHaveAttribute('role', 'status');
        await expect(status).toHaveAttribute('aria-live', 'polite');
        await expect(status).toHaveText('');

        /**
         * Presses a key on the colour row's handle once it holds focus again: after a move the
         * handle is re-rendered and focus comes back to it a moment later.
         *
         * @param {string} key
         * @returns {Promise<void>}
         */
        const pressOnHandle = async (key) => {
            await expect(handle).toBeFocused();
            await handle.press(key);
        };
        const storedOrder = async () => (await builder.storedRule()).conditions.map(
            (node) => node.type === 'test/combine' ? node.conditions.map((child) => child.type) : node.type
        );
        const nested = page.getByRole('group', {name: 'Nested condition group'});

        await handle.focus();
        await pressOnHandle('ArrowDown');

        await expect.poll(() => rowFieldTypes(page)).toEqual(['size', 'colour', 'name', 'section', 'code', PICKER]);
        await expect(status).toHaveText('Moved to position 2 of 8');
        expect(await storedOrder()).toEqual(['size', 'colour', ['name', 'section'], 'code', 'test/attribute']);

        // The next slot down is the first one inside the nested group, then the one after its first row.
        await pressOnHandle('ArrowDown');

        await expect(status).toHaveText('Moved to position 3 of 8');
        await expect(nested.locator('select[aria-label="Field"] option:checked[value="colour"]')).toHaveCount(1);
        expect(await storedOrder()).toEqual(['size', ['colour', 'name', 'section'], 'code', 'test/attribute']);

        await pressOnHandle('ArrowDown');

        await expect(status).toHaveText('Moved to position 4 of 8');
        expect(await storedOrder()).toEqual(['size', ['name', 'colour', 'section'], 'code', 'test/attribute']);

        // Back to the top; at the first slot the key moves nothing.
        for (const position of [3, 2, 1]) {
            await pressOnHandle('ArrowUp');
            await expect(status).toHaveText(`Moved to position ${position} of 8`);
        }
        await pressOnHandle('ArrowUp');

        expect(await storedOrder()).toEqual(['colour', 'size', ['name', 'section'], 'code', 'test/attribute']);
        await expect(handle).toBeFocused();
    });

    test('a pointer drag drops the row at the gap nearest the pointer and announces it', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const row = rowOf(page, 'colour');
        const handleBox = await row.getByRole('button', {name: 'Reorder condition'}).boundingBox();
        const sizeBox = await rowOf(page, 'size').boundingBox();

        if (handleBox === null || sizeBox === null) {
            throw new Error('The rows are not rendered');
        }

        const x = handleBox.x + handleBox.width / 2;

        await page.mouse.move(x, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await expect(row).toHaveClass(/ufe-expr__row--dragging/);

        // Just above the lower edge of the Size row: the gap after it is the nearest one.
        await page.mouse.move(x, sizeBox.y + sizeBox.height - 2, {steps: 8});
        await expect(page.locator('.ufe-expr__drop-indicator:visible')).toHaveCount(1);
        await page.mouse.up();

        await expect.poll(() => rowFieldTypes(page)).toEqual(['size', 'colour', 'name', 'section', 'code', PICKER]);
        await expect(row).not.toHaveClass(/ufe-expr__row--dragging/);
        await expect(page.locator('.ufe-expr__move-status')).toHaveText('Moved to position 2 of 8');
        await expect(page.locator('.ufe-expr__drop-indicator:visible')).toHaveCount(0);
    });
});

test.describe('suggest editors', () => {
    test('a query is asked once it reaches the minimum, and a newer query aborts the older', async ({page, builder}) => {
        await mountPickerRows(builder, [['reference', '==', '']]);
        await holdClock(page);

        const input = valueColumn(page, 0).getByRole('combobox', {name: 'Value'});

        await input.focus();
        await input.pressSequentially('ab');
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        // Below the minimum the endpoint is not asked, and nothing is left open under the input.
        expect(await builder.requests()).toEqual([]);
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(input).not.toHaveAttribute('aria-controls');

        await input.pressSequentially('c');
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        expect(await builder.requests()).toEqual([{url: '/suggest?attribute=reference&q=abc', body: '', aborted: false}]);

        const list = page.locator('#' + await input.getAttribute('aria-controls'));

        await expect(input).toHaveAttribute('aria-expanded', 'true');
        await expect(list).toHaveAttribute('role', 'listbox');
        await expect(list.getByRole('option')).toHaveText(['Searching…']);
        await expect(list.getByRole('option')).toHaveAttribute('aria-disabled', 'true');

        // Two keystrokes inside one debounce window are one request, and it supersedes the first.
        await input.pressSequentially('de');
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        expect(await builder.requests()).toEqual([
            {url: '/suggest?attribute=reference&q=abc', body: '', aborted: true},
            {url: '/suggest?attribute=reference&q=abcde', body: '', aborted: false}
        ]);

        await builder.answer(1, {items: [{value: 'abc-1', label: 'ABC One'}, {value: 'abc-2', label: 'ABC Two'}]});
        // The superseded query's answer arrives late and writes nothing.
        await builder.answer(0, {items: [{value: 'old', label: 'Old'}]});

        const options = list.getByRole('option');

        await expect(options).toHaveText(['ABC One', 'ABC Two']);
        await expect(input).toHaveAttribute('aria-expanded', 'true');
        await expect(input).not.toHaveAttribute('aria-activedescendant');
        expect(await options.evaluateAll((entries) => entries.map((entry) => entry.getAttribute('aria-selected'))))
            .toEqual(['false', 'false']);

        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(0).getAttribute('id'));
        await expect(options.nth(0)).toHaveClass(/ufe-expr__autocomplete-option--active/);

        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(1).getAttribute('id'));

        await input.press('Enter');

        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(list).toHaveCount(0);
        await expect(input).toHaveValue('abc-2');
        await expect(input).toBeFocused();
        expect((await builder.storedRule()).conditions[0].value).toBe('abc-2');
        expect(await builder.requests()).toHaveLength(2);
    });

    test('an answer with nothing says so, and a refused request is no suggestions at all', async ({page, builder}) => {
        await mountPickerRows(builder, [['reference', '==', '']]);
        await holdClock(page);

        const input = valueColumn(page, 0).getByRole('combobox', {name: 'Value'});

        await input.focus();
        await input.pressSequentially('abc');
        await page.clock.runFor(SUGGEST_DEBOUNCE);
        await builder.answer(0, {items: []});

        const list = page.locator('#' + await input.getAttribute('aria-controls'));

        await expect(list.getByRole('option')).toHaveText(['No matches']);
        await expect(list.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
        await expect(input).not.toHaveAttribute('aria-activedescendant');

        // Down arrow has nothing to highlight: the state rows are never part of what the keyboard walks.
        await input.press('ArrowDown');
        await expect(input).not.toHaveAttribute('aria-activedescendant');

        await input.pressSequentially('d');
        await page.clock.runFor(SUGGEST_DEBOUNCE);
        await expect(list.getByRole('option')).toHaveText(['Searching…']);
        await builder.answer(1, {items: [{value: 'abcd', label: 'ABCD'}]}, 500);

        await expect(list.getByRole('option')).toHaveText(['No matches']);
        expect(await builder.requests()).toHaveLength(2);
    });

    test('the list editor adds a suggestion as a pill', async ({page, builder}) => {
        await mountPickerRows(builder, [['reference', '()', 'A1']]);
        await holdClock(page);

        const column = valueColumn(page, 0);
        const input = column.getByRole('combobox', {name: 'Search or type a value to add'});

        await expect(column.locator('.ufe-expr__pill')).toHaveText(['A1']);
        await expect(input).toHaveAttribute('aria-expanded', 'false');

        await input.focus();
        await input.pressSequentially('abc');
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        expect(await requestedUrls(builder)).toEqual(['/suggest?attribute=reference&q=abc']);

        await builder.answer(0, {items: [{value: 'abc-1', label: 'ABC One'}, {value: 'abc-2', label: 'ABC Two'}]});

        const list = page.locator('#' + await input.getAttribute('aria-controls'));
        const options = list.getByRole('option');

        await expect(input).toHaveAttribute('aria-expanded', 'true');
        await expect(options).toHaveText(['ABC One', 'ABC Two']);
        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', await options.nth(0).getAttribute('id'));
        await input.press('Enter');

        await expect(column.locator('.ufe-expr__pill')).toHaveText(['A1', 'abc-1']);
        await expect(input).toHaveValue('');
        await expect(input).toBeFocused();
        expect((await builder.storedRule()).conditions[0].value).toBe('A1,abc-1');
    });
    test('Enter with nothing highlighted adds the typed text as a pill, trimmed', async ({page, builder}) => {
        await mountPickerRows(builder, [['reference', '()', 'A1']]);
        await holdClock(page);

        const column = valueColumn(page, 0);
        const input = column.getByRole('combobox', {name: 'Search or type a value to add'});

        await input.focus();
        await input.fill('  zz-typed  ');
        await input.press('Enter');

        await expect(column.locator('.ufe-expr__pill')).toHaveText(['A1', 'zz-typed']);
        await expect(input).toHaveValue('');
        expect((await builder.storedRule()).conditions[0].value).toBe('A1,zz-typed');
        expect(await builder.requests()).toEqual([]);
    });
});

test.describe('option lists fetched when an attribute is picked', () => {
    const ROWS = [
        ['finish', '()', 'matte'],
        ['finish', '==', ''],
        ['season', '==', 'x'],
        ['material', '==', 'wood']
    ];
    const FINISHES = {
        options: [{value: 'matte', label: 'Matte'}, {value: 'gloss', label: 'Gloss'}, {value: 'satin', label: 'Satin'}]
    };

    test('is asked once per attribute code and shows its loading state until the list lands', async ({page, builder}) => {
        await mountPickerRows(builder, ROWS);
        await holdClock(page);

        // Four rows, three attributes, two of them optioned: one request per optioned code.
        expect((await requestedUrls(builder)).sort()).toEqual(['/options?attribute=finish', '/options?attribute=season']);

        const loading = page.locator('.ufe-expr__value-loading');

        await expect(loading).toHaveCount(3);
        await expect(loading).toHaveText(['Loading values…', 'Loading values…', 'Loading values…']);
        await expect(valueColumn(page, 3).locator('.ufe-expr__value-loading')).toHaveCount(0);
        await expect(valueColumn(page, 3).locator('select[aria-label="Value"]')).toHaveValue('wood');
        await expect(valueColumn(page, 0).getByRole('combobox')).toHaveCount(0);

        // A slow endpoint keeps the placeholder and costs no second request, well inside the deadline.
        await page.clock.runFor(10000);

        await expect(loading).toHaveCount(3);
        expect((await builder.requests()).map((request) => request.aborted)).toEqual([false, false]);

        const finish = (await builder.requests()).findIndex((request) => request.url.endsWith('finish'));

        await builder.answer(finish, FINISHES);

        // Both finish rows are served by the one answer; the other attribute is still on its way.
        await expect(loading).toHaveCount(1);
        await expect(valueColumn(page, 2).locator('.ufe-expr__value-loading')).toHaveText('Loading values…');
        await expect(valueColumn(page, 0).locator('.ufe-expr__pill')).toHaveText(['Matte']);
        await expect(valueColumn(page, 1).locator('select[aria-label="Value"] option'))
            .toHaveText(['— select —', 'Matte', 'Gloss', 'Satin']);

        // The list editor offers what the fetched list holds, minus what the row already has.
        const input = valueColumn(page, 0).getByRole('combobox', {name: 'Search values to add'});

        await input.focus();
        await expect(input).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#' + await input.getAttribute('aria-controls')).getByRole('option'))
            .toHaveText(['Gloss', 'Satin']);

        // Re-rendering a row for another operator reads the list it already has.
        await page.locator('.ufe-expr__row').nth(1).locator('select[aria-label="Operator"]').selectOption('()');

        await expect(valueColumn(page, 1).getByRole('combobox', {name: 'Search values to add'})).toBeVisible();
        expect(await builder.requests()).toHaveLength(2);
    });

    for (const [name, body, status] of [
        ['a refused request', {}, 500],
        ['an answer that carries no list', {message: 'nothing here'}, 200]
    ]) {
        test(`${name} shows the option-less editor once and is not asked again`, async ({page, builder}) => {
            await mountPickerRows(builder, [['season', '==', 'x']]);

            await expect(page.locator('.ufe-expr__value-loading')).toHaveText('Loading values…');
            expect(await requestedUrls(builder)).toEqual(['/options?attribute=season']);

            await builder.answer(0, body, status);

            const input = valueColumn(page, 0).locator('input.ufe-expr__input');

            await expect(page.locator('.ufe-expr__value-loading')).toHaveCount(0);
            await expect(input).toHaveAttribute('aria-label', 'Value');
            await expect(input).toHaveValue('x');

            // Another operator renders another editor for the same row; the broken endpoint costs no more.
            await page.locator('select[aria-label="Operator"]').selectOption('()');

            await expect(valueColumn(page, 0).locator('input.ufe-expr__input')).toHaveValue('x');
            await expect(page.locator('.ufe-expr__value-loading')).toHaveCount(0);
            expect(await builder.requests()).toHaveLength(1);
        });
    }
});

test.describe('paste report', () => {
    const FINISHES = {
        options: [{value: 'matte', label: 'Matte'}, {value: 'gloss', label: 'Gloss'}, {value: 'satin', label: 'Satin'}]
    };

    test('a pasted list adds the known values and reports the unknown ones', async ({page, builder}) => {
        await mountPickerRows(builder, [['finish', '()', 'matte']]);
        await builder.answer(0, FINISHES);
        await holdClock(page);

        const column = valueColumn(page, 0);
        const input = column.getByRole('combobox', {name: 'Search values to add'});
        const report = column.locator('[role="status"]');

        await expect(report).toHaveCount(1);
        await expect(report).toBeHidden();
        await expect(report).toHaveText('');

        // Text with no separator is not a list: the page's own paste goes on into the input.
        await input.focus();
        expect(await paste(input, 'Gloss')).toBe(true);
        await expect(report).toBeHidden();
        await expect(column.locator('.ufe-expr__pill')).toHaveText(['Matte']);

        // A value, a label in any case, a name that is no option, and a repeat of what the row holds.
        expect(await paste(input, 'satin; GLOSS\nUnknown, matte')).toBe(false);

        await expect(column.locator('.ufe-expr__pill')).toHaveText(['Matte', 'Gloss', 'Satin']);
        await expect(report).toBeVisible();
        await expect(report).toHaveText('Added 2 of 4, 1 matched no option');
        expect((await builder.storedRule()).conditions[0].value).toBe('matte,satin,gloss');

        // The report is a transient: a second paste replaces it, and it goes after its lifetime.
        expect(await paste(input, 'Gloss, Satin')).toBe(false);
        await expect(report).toHaveText('Added 0 of 2');

        await page.clock.runFor(PASTE_NOTICE_LIFETIME - 1);
        await expect(report).toBeVisible();

        await page.clock.runFor(1);
        await expect(report).toBeHidden();
        await expect(report).toHaveText('');
        await expect(column.locator('.ufe-expr__pill')).toHaveText(['Matte', 'Gloss', 'Satin']);
    });

    test('a pasted list in a free-text editor is taken as typed, repeats once', async ({page, builder}) => {
        await mountPickerRows(builder, [['reference', '()', '']]);

        const column = valueColumn(page, 0);
        const input = column.getByRole('combobox', {name: 'Search or type a value to add'});

        await input.focus();
        expect(await paste(input, 'SKU-1, SKU-2\nSKU-1')).toBe(false);

        await expect(column.locator('.ufe-expr__pill')).toHaveText(['SKU-1', 'SKU-2']);
        await expect(column.locator('[role="status"]')).toHaveText('Added 2 of 3');
        expect((await builder.storedRule()).conditions[0].value).toBe('SKU-1,SKU-2');
    });
});

test.describe('a field value written from outside after initialisation', () => {
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
     * Starts recording every value the element's field takes from now on.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    const recordWrites = (page) => page.evaluate(() => {
        const writes = [];

        window.expressionBuilderHarness.builder().value.subscribe((value) => writes.push(value));
        window.expressionBuilderHarnessWrites = writes;
    });

    /**
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<string[]>} Every value the field took since recordWrites().
     */
    const writes = (page) => page.evaluate(() => window.expressionBuilderHarnessWrites.slice());

    /**
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    const settle = (page) => page.evaluate(() => window.expressionBuilderHarness.settled(100));

    test('is shown by the tree, and an edit afterwards is written once', async ({page, builder}) => {
        await builder.mount(builderElementConfig({builderConfig: {countUrl: ''}}));

        await page.evaluate((value) => window.expressionBuilderHarness.builder().value(value), colourRule('blue'));

        const value = page.locator('select[aria-label="Value"]');

        await expect(fieldSelects(page)).toHaveCount(1);
        await expect(value).toHaveValue('blue');
        await expect(page.locator('.ufe-expr__preview')).toHaveText('Colour is Blue');
        await settle(page);
        expect((await builder.storedRule()).conditions[0].value).toBe('blue');

        await recordWrites(page);
        await value.selectOption('green');
        await settle(page);

        const written = await writes(page);

        expect(written).toHaveLength(1);
        expect(JSON.parse(written[0]).conditions[0].value).toBe('green');
        await expect(value).toHaveValue('green');
    });

    test('reset() brings the tree back to the rule the field started with', async ({page, builder}) => {
        await builder.mount(builderElementConfig({builderConfig: {countUrl: ''}}));

        const all = rootHeader(page).getByRole('button', {name: 'Match ALL conditions in this group'});

        await rootHeader(page).getByRole('button', {name: 'Match ANY one condition in this group'}).click();
        await page.getByRole('button', {name: '+ Add condition'}).last().click();
        await expect(fieldSelects(page)).toHaveCount(7);
        await settle(page);

        await page.evaluate(() => window.expressionBuilderHarness.builder().reset());

        await expect(fieldSelects(page)).toHaveCount(6);
        await expect(all).toHaveAttribute('aria-pressed', 'true');
        expect(await rowFieldTypes(page)).toEqual(['colour', 'size', 'name', 'section', 'code', PICKER]);
        await settle(page);
        expect((await builder.storedRule()).aggregator).toBe('all');
    });

    test('the builder\'s own writes never rebuild the tree', async ({page, builder}) => {
        await builder.mount(builderElementConfig({builderConfig: {countUrl: ''}}));

        await page.evaluate(() => {
            document.querySelector('.ufe-expr__row').dataset.marked = 'yes';
        });
        await recordWrites(page);
        await rowOf(page, 'colour').locator('select[aria-label="Value"]').selectOption('green');
        await page.getByRole('button', {name: '+ Add condition'}).last().click();
        await settle(page);

        await expect(page.locator('.ufe-expr__row').first()).toHaveAttribute('data-marked', 'yes');
        await expect(fieldSelects(page)).toHaveCount(7);
        expect(await writes(page)).toHaveLength(2);
    });
});

test.describe('destroy()', () => {
    test('aborts the request in flight, and its late answer writes nothing', async ({page, builder}) => {
        await builder.mount(builderElementConfig());

        const badge = page.locator('.ufe-expr__count');

        await expect(badge).toHaveText('Counting…');
        await expect.poll(async () => (await builder.requests()).length).toBe(1);

        // The live path first, so the dropped answer below is not dropped for another reason.
        await builder.answer(0, {count: 1234, capped: false});
        await expect(badge).toHaveText(/^1\u00a0234 matches$/);

        await rowOf(page, 'colour').locator('select[aria-label="Value"]').selectOption('blue');
        await expect.poll(async () => (await builder.requests()).length).toBe(2);
        await expect(badge).toHaveText('Counting…');
        expect((await builder.requests())[1].aborted).toBe(false);

        const countState = () => page.evaluate(() => {
            const component = window.expressionBuilderHarness.builder();

            return [component.countState(), component.matchCount(), component.countCapped()];
        });
        const beforeDestroy = await countState();

        await builder.destroy();

        expect((await builder.requests())[1].aborted).toBe(true);

        await builder.answer(1, {count: 99, capped: false});

        await expect(badge).toHaveText('Counting…');
        expect(await countState()).toEqual(beforeDestroy);

        // Nothing is sent after destroy(), whatever the leftover markup is used for.
        await rowOf(page, 'colour').locator('select[aria-label="Value"]').selectOption('green');
        await page.evaluate(() => new Promise((resolve) => {
            window.setTimeout(resolve, 50);
        }));
        expect(await builder.requests()).toHaveLength(2);
    });

    test('a request that outlives its deadline shows the failure state', async ({page, builder}) => {
        await builder.honourAbort();
        await builder.mount(builderElementConfig());
        await expect.poll(async () => (await builder.requests()).length).toBe(1);
        await builder.answer(0, {count: 5, capped: false});
        await holdClock(page);

        const badge = page.locator('.ufe-expr__count');

        await rowOf(page, 'colour').locator('select[aria-label="Value"]').selectOption('blue');
        await page.clock.runFor(1);

        await expect(badge).toHaveText('Counting…');
        expect(await requestedUrls(builder)).toEqual(['/count', '/count']);

        await page.clock.runFor(REQUEST_DEADLINE - 1);

        await expect(badge).toHaveText('Counting…');
        expect((await builder.requests())[1].aborted).toBe(false);

        await page.clock.runFor(1);

        await expect(badge).toHaveText('Count unavailable');
        expect((await builder.requests())[1].aborted).toBe(true);
        expect(await requestedUrls(builder)).toHaveLength(2);
    });

    test('releases the pointer capture of a drag in progress', async ({page, builder}) => {
        await builder.mount(builderElementConfig());
        await page.evaluate(() => {
            document.addEventListener('pointerdown', (event) => {
                document.body.dataset.lastPointerId = String(event.pointerId);
            }, true);
        });

        const row = rowOf(page, 'colour');
        const handle = row.getByRole('button', {name: 'Reorder condition'});
        const box = await handle.boundingBox();

        if (box === null) {
            throw new Error('The drag handle is not rendered');
        }

        /**
         * @returns {Promise<boolean>} Whether the handle holds the pointer that pressed it.
         */
        const handleHoldsPointer = () => handle.evaluate(
            (element) => element.hasPointerCapture(Number(document.body.dataset.lastPointerId))
        );

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        await expect(row).toHaveClass(/ufe-expr__row--dragging/);
        expect(await handleHoldsPointer()).toBe(true);

        await builder.destroy();

        expect(await handleHoldsPointer()).toBe(false);
        await expect(row).not.toHaveClass(/ufe-expr__row--dragging/);

        await page.mouse.move(box.x + box.width / 2, box.y + box.height * 4, {steps: 5});
        await page.mouse.up();

        expect(await rowFieldTypes(page)).toEqual(['colour', 'size', 'name', 'section', 'code', PICKER]);
    });

    /**
     * Leaves a timer of every kind pending, with the page's clock held: a suggest request in flight
     * (its deadline), the next query waiting out its debounce, the match-count request that debounce
     * of the same keystroke defers, the paste report waiting to go, and the deferred focus of a row
     * just added.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} builder The fixture.
     * @returns {Promise<void>}
     */
    const leaveEveryTimerPending = async (page, builder) => {
        await builder.mount(builderElementConfig({
            value: JSON.stringify(pickerRule([['reference', '==', ''], ['reference', '()', '']]))
        }));

        // The count the mount asked for, answered in real time before the clock is held.
        await expect.poll(async () => (await builder.requests()).length).toBe(1);
        await builder.answer(0, {count: 5, capped: false});
        await holdClock(page);

        const input = valueColumn(page, 0).getByRole('combobox', {name: 'Value'});

        await input.focus();
        await input.pressSequentially('abc');
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        expect(await requestedUrls(builder)).toEqual(['/count', '/count', '/suggest?attribute=reference&q=abc']);

        const list = valueColumn(page, 1).getByRole('combobox', {name: 'Search or type a value to add'});

        expect(await paste(list, 'B1, B2')).toBe(false);
        await expect(pasteReport(page, 1)).toHaveText('Added 2 of 2');

        await input.pressSequentially('d');
        await page.getByRole('button', {name: '+ Add condition'}).last().click();
        await expect(fieldSelects(page)).toHaveCount(3);
    };

    test('clears every timer: nothing fires into the view model afterwards', async ({page, builder}) => {
        await leaveEveryTimerPending(page, builder);
        await builder.destroy();

        // What was in flight is aborted by destroy() itself, deadlines included.
        expect((await builder.requests()).map((request) => request.aborted)).toEqual([false, true, true]);

        await page.clock.runFor(PAST_EVERY_TIMER);

        // The debounced query, the deferred count and the deferred focus never fired, and the paste
        // report was not taken down by its timer: it is still on screen, long past its lifetime.
        expect(await requestedUrls(builder)).toEqual(['/count', '/count', '/suggest?attribute=reference&q=abc']);
        await expect(fieldSelects(page).last()).not.toBeFocused();
        await expect(pasteReport(page, 1)).toHaveText('Added 2 of 2');
    });

    test('the same pending timers do fire when the element is not destroyed', async ({page, builder}) => {
        await leaveEveryTimerPending(page, builder);
        await page.clock.runFor(SUGGEST_DEBOUNCE);

        await expect(fieldSelects(page).last()).toBeFocused();
        await expect(pasteReport(page, 1)).toHaveText('Added 2 of 2');
        expect(await requestedUrls(builder)).toEqual([
            '/count',
            '/count',
            '/suggest?attribute=reference&q=abc',
            '/count',
            '/suggest?attribute=reference&q=abcd'
        ]);
        expect((await builder.requests()).map((request) => request.aborted))
            .toEqual([false, true, true, false, false]);

        // The report goes when its lifetime ends, and a request nobody answers is aborted when its
        // deadline passes.
        await page.clock.runFor(PASTE_NOTICE_LIFETIME);
        await expect(pasteReport(page, 1)).toBeHidden();

        await page.clock.runFor(REQUEST_DEADLINE);

        expect((await builder.requests()).map((request) => request.aborted))
            .toEqual([false, true, true, true, true]);
    });

    test('disposes the computeds: a later change reaches no subscriber', async ({page, builder}) => {
        await builder.mount(builderElementConfig({builderConfig: {coherence: COHERENCE}}));
        await expect.poll(async () => (await builder.requests()).length).toBe(1);
        await builder.answer(0, {count: 5, capped: false});

        const colour = rowOf(page, 'colour').locator('select[aria-label="Value"]');
        const warnings = page.locator('.ufe-expr__warning');
        const preview = page.locator('.ufe-expr__preview');

        await expect(warnings).toHaveCount(0);

        // Alive: one change reaches the preview, the warnings, the stored value and the count.
        await colour.selectOption('blue');

        await expect(preview).toContainText('Colour is Blue AND');
        await expect(warnings).toHaveText(['Group 1: Sizes are only sold in red']);
        expect((await builder.storedRule()).conditions[0].value).toBe('blue');
        await expect.poll(async () => (await builder.requests()).length).toBe(2);
        await builder.answer(1, {count: 7, capped: false});

        await builder.destroy();
        await colour.selectOption('red');
        await page.evaluate(() => window.expressionBuilderHarness.settled(200));

        // Disposed: the same kind of change reaches none of them.
        await expect(preview).toContainText('Colour is Blue AND');
        await expect(warnings).toHaveText(['Group 1: Sizes are only sold in red']);
        expect((await builder.storedRule()).conditions[0].value).toBe('blue');
        expect(await builder.requests()).toHaveLength(2);
    });
});
