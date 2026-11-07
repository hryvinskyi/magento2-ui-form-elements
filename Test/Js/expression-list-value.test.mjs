/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-list-value module — editing a list-valued condition. The
 * module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-list-value module.
 *
 * @param {Object} expressionListValue The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionListValue) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('appendValues: strings appended once, against the list and within the batch, in a fresh list', () => {
        const current = ['a', 2];
        const result = expressionListValue.appendValues(current, ['b', 'a', 'b', 2, 3]);

        assert.deepStrictEqual(result, {values: ['a', 2, 'b', '3'], added: 2});
        assert.deepStrictEqual(current, ['a', 2], 'the list passed in is never changed');
    });

    test('appendValues: a value spelling an Object.prototype member is a value like any other', () => {
        assert.deepStrictEqual(expressionListValue.appendValues([], ['constructor', 'toString']), {
            values: ['constructor', 'toString'], added: 2
        });
    });

    test('removeValue: every copy of the value goes, compared as strings', () => {
        assert.deepStrictEqual(expressionListValue.removeValue(['1', 2, '3', '2'], 2), ['1', '3']);
        assert.deepStrictEqual(expressionListValue.removeValue([], 'x'), []);
    });

    test('holds: a list by membership, a single value by equality, as strings', () => {
        assert.strictEqual(expressionListValue.holds(['1', 2], '2'), true);
        assert.strictEqual(expressionListValue.holds(['1'], 'constructor'), false);
        assert.strictEqual(expressionListValue.holds(5, '5'), true);
        assert.strictEqual(expressionListValue.holds(null, ''), true);
        assert.strictEqual(expressionListValue.holds(undefined, 'x'), false);
    });

    test('visiblePills: everything while it fits or is expanded, the head otherwise', () => {
        const pills = ['a', 'b', 'c', 'd'];

        assert.deepStrictEqual(expressionListValue.visiblePills(pills, false, 4), pills);
        assert.deepStrictEqual(expressionListValue.visiblePills(pills, false, 2), ['a', 'b']);
        assert.deepStrictEqual(expressionListValue.visiblePills(pills, true, 2), pills);
        assert.deepStrictEqual(expressionListValue.visiblePills('not a list', false, 2), []);
    });

    test('hiddenPillCount: what a collapsed list hides, 0 when it fits', () => {
        assert.strictEqual(expressionListValue.hiddenPillCount(['a', 'b', 'c', 'd'], 2), 2);
        assert.strictEqual(expressionListValue.hiddenPillCount(['a', 'b'], 2), 0);
        assert.strictEqual(expressionListValue.hiddenPillCount(null, 2), 0);
    });

    test('pasteLookup + resolvePaste: a value verbatim, a label case-insensitively, a depth prefix ignored', () => {
        const lookup = expressionListValue.pasteLookup([
            {value: '10', label: 'Storage'},
            {value: '11', label: '— — SSD'},
            {value: '12', label: 'Storage'},
            {value: 'constructor', label: ''}
        ]);
        const resolved = expressionListValue.resolvePaste(['10', 'storage', 'ssd', '— — SSD', 'toString', 'constructor', 'missing'], lookup);

        assert.deepStrictEqual(resolved, {values: ['10', '10', '11', '11', 'constructor'], skipped: 2});
    });

    test('resolvePaste: without a lookup every entry is taken verbatim', () => {
        assert.deepStrictEqual(expressionListValue.resolvePaste(['SKU-1', 'sku-2'], null), {values: ['SKU-1', 'sku-2'], skipped: 0});
    });

    test('pasteLookup: the first option carrying a label wins it', () => {
        const lookup = expressionListValue.pasteLookup([{value: '1', label: 'Dup'}, {value: '2', label: 'dup'}]);

        assert.strictEqual(lookup.byLabel.dup, '1');
    });

    test('canClearAll: two or more stored values', () => {
        assert.strictEqual(expressionListValue.canClearAll(['a', 'b']), true);
        assert.strictEqual(expressionListValue.canClearAll(['a']), false);
        assert.strictEqual(expressionListValue.canClearAll([]), false);
    });

    test('collapsesBack: an expanded list that fits the limit again folds; the length is read only when expanded', () => {
        let counted = 0;
        const countOf = (count) => () => {
            counted++;

            return count;
        };

        assert.strictEqual(expressionListValue.collapsesBack(true, countOf(15), 15), true);
        assert.strictEqual(expressionListValue.collapsesBack(true, countOf(16), 15), false);
        assert.strictEqual(expressionListValue.collapsesBack(false, countOf(3), 15), false);
        assert.strictEqual(counted, 2);
    });

    test('freeTextEntry: the typed text trimmed, nothing for blank input', () => {
        assert.strictEqual(expressionListValue.freeTextEntry('  SKU-1 '), 'SKU-1');
        assert.strictEqual(expressionListValue.freeTextEntry('   '), null);
        assert.strictEqual(expressionListValue.freeTextEntry(null), null);
        assert.strictEqual(expressionListValue.freeTextEntry(undefined), null);
    });

    test('offerExclusions: only a list-valued row leaves what it holds out of the offer', () => {
        let read = 0;
        const valuesOf = () => {
            read++;

            return ['1', '2'];
        };

        assert.deepStrictEqual(expressionListValue.offerExclusions(() => true, valuesOf), ['1', '2']);
        assert.deepStrictEqual(expressionListValue.offerExclusions(() => false, valuesOf), [],
            'a single-value row keeps its own value on offer');
        assert.strictEqual(read, 1);
    });

    test('planPaste: text without a separator is not a list, and the browser pastes it', () => {
        assert.strictEqual(expressionListValue.planPaste('SKU-1', 'options', () => {
            throw new Error('a single value never resolves');
        }), null);
        assert.strictEqual(expressionListValue.planPaste('', 'free', null), null);
    });

    test('planPaste: a list of nothing but separators parses no entry and resolves nothing', () => {
        assert.deepStrictEqual(expressionListValue.planPaste(',;\n', 'options', () => {
            throw new Error('nothing to resolve');
        }), {parsed: 0, values: [], skipped: 0});
    });

    test('planPaste: the options mode resolves through the lookup, any other mode takes entries as typed', () => {
        const lookup = expressionListValue.pasteLookup([{value: '10', label: 'Red'}, {value: '11', label: 'Blue'}]);

        assert.deepStrictEqual(expressionListValue.planPaste('red, 11\nGreen', 'options', () => lookup),
            {parsed: 3, values: ['10', '11'], skipped: 1});
        assert.deepStrictEqual(expressionListValue.planPaste('red, 11\nGreen', 'free', () => lookup),
            {parsed: 3, values: ['red', '11', 'Green'], skipped: 0});
    });

    return tests;
}
