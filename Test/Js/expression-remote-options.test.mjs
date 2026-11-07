/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-remote-options module — the attribute-option and
 * value-suggest endpoints' contract. The module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-remote-options module.
 *
 * @param {Object} expressionRemoteOptions The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionRemoteOptions) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('optionCodeToFetch: only a declared, unloaded list with an endpoint is fetched', () => {
        assert.strictEqual(expressionRemoteOptions.optionCodeToFetch({value: 7, hasOptions: true}, '/zz/options'), '7');
        assert.strictEqual(expressionRemoteOptions.optionCodeToFetch({value: 'a', hasOptions: true, options: []}, '/zz/options'), null);
        assert.strictEqual(expressionRemoteOptions.optionCodeToFetch({value: 'a'}, '/zz/options'), null);
        assert.strictEqual(expressionRemoteOptions.optionCodeToFetch({value: 'a', hasOptions: true}, ''), null);
        assert.strictEqual(expressionRemoteOptions.optionCodeToFetch(null, '/zz/options'), null);
    });

    test('awaitsOptions: pending until the list lands, never without an endpoint, never after a failure', () => {
        const declared = {value: 'zz_brand', hasOptions: true};

        assert.strictEqual(expressionRemoteOptions.awaitsOptions(declared, '/zz/options', {}), true);
        assert.strictEqual(expressionRemoteOptions.awaitsOptions(declared, '', {}), false);
        assert.strictEqual(expressionRemoteOptions.awaitsOptions(declared, '/zz/options', {zz_brand: true}), false);
        assert.strictEqual(expressionRemoteOptions.awaitsOptions({value: 'x', hasOptions: true, options: [{}]}, '/zz/options', {}), false);
        assert.strictEqual(expressionRemoteOptions.awaitsOptions({value: 'x'}, '/zz/options', {}), false);
        assert.strictEqual(expressionRemoteOptions.awaitsOptions(null, '/zz/options', {}), false);
    });

    test('optionsRequestUrl: the code as a query parameter, after ? or &, encoded', () => {
        assert.strictEqual(expressionRemoteOptions.optionsRequestUrl('/zz/options', 'a b'), '/zz/options?attribute=a%20b');
        assert.strictEqual(expressionRemoteOptions.optionsRequestUrl('/zz/options?key=1', 'x&y'), '/zz/options?key=1&attribute=x%26y');
    });

    test('readOptions: an answer carrying an options list, null for anything else', () => {
        const list = [{value: '1', label: 'One'}];

        assert.strictEqual(expressionRemoteOptions.readOptions({options: list}), list);
        for (const data of [null, {}, {options: 'x'}, {options: {0: 'a'}}]) {
            assert.strictEqual(expressionRemoteOptions.readOptions(data), null, JSON.stringify(data));
        }
    });

    test('suggestRequestUrl: the attribute and the trimmed query, once the query is long enough', () => {
        const sku = {value: 'zz_sku', suggest: true};

        assert.strictEqual(
            expressionRemoteOptions.suggestRequestUrl(sku, 'zz_sku', '  ab c ', 2, '/zz/suggest?key=1'),
            '/zz/suggest?key=1&attribute=zz_sku&q=ab%20c'
        );
        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl(sku, 'zz_sku', 'abc', 3, '/zz/suggest'), '/zz/suggest?attribute=zz_sku&q=abc');
    });

    test('suggestRequestUrl: nothing is asked without suggestions, below the minimum, or without an endpoint', () => {
        const sku = {value: 'zz_sku', suggest: true};

        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl({value: 'zz_name'}, 'zz_name', 'abc', 2, '/zz/suggest'), null);
        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl(null, '', 'abc', 2, '/zz/suggest'), null);
        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl(sku, 'zz_sku', ' a ', 2, '/zz/suggest'), null);
        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl(sku, 'zz_sku', null, 1, '/zz/suggest'), null);
        assert.strictEqual(expressionRemoteOptions.suggestRequestUrl(sku, 'zz_sku', 'abc', 2, ''), null);
    });

    test('readSuggestions: the answer\'s items, or none', () => {
        const items = [{value: 'A'}];

        assert.strictEqual(expressionRemoteOptions.readSuggestions({items}), items);
        assert.deepStrictEqual(expressionRemoteOptions.readSuggestions({}), []);
        assert.deepStrictEqual(expressionRemoteOptions.readSuggestions(null), []);
    });

    test('answeredEmpty: only a finished answer to a real query with nothing in it', () => {
        assert.strictEqual(expressionRemoteOptions.answeredEmpty(false, 0, ' abc ', 3), true);
        assert.strictEqual(expressionRemoteOptions.answeredEmpty(true, 0, 'abc', 3), false);
        assert.strictEqual(expressionRemoteOptions.answeredEmpty(false, 2, 'abc', 3), false);
        assert.strictEqual(expressionRemoteOptions.answeredEmpty(false, 0, ' ab ', 3), false);
        assert.strictEqual(expressionRemoteOptions.answeredEmpty(false, 0, undefined, 1), false);
    });

    test('needsOptionsRequest: a code to fetch that is neither in flight nor failed before', () => {
        assert.strictEqual(expressionRemoteOptions.needsOptionsRequest('7', {}, {}), true);
        assert.strictEqual(expressionRemoteOptions.needsOptionsRequest(null, {}, {}), false);
        assert.strictEqual(expressionRemoteOptions.needsOptionsRequest('7', {7: true}, {}), false,
            'a code already in flight is not asked twice');
        assert.strictEqual(expressionRemoteOptions.needsOptionsRequest('7', {}, {7: true}), false,
            'a broken endpoint costs one request, not one per render');
        assert.strictEqual(expressionRemoteOptions.needsOptionsRequest('constructor', {}, {}), true,
            'a code spelling an Object.prototype member is a code like any other');
    });

    test('suggestListHasContent: an open type-ahead with results, a request in flight or the no-matches verdict', () => {
        const probe = (open, loading, count, empty) => {
            const asked = [];

            return {
                asked,
                isOpen: () => asked.push('isOpen') && open,
                loading: () => asked.push('loading') && loading,
                count: () => asked.push('count') && count,
                answeredEmpty: () => asked.push('answeredEmpty') && empty
            };
        };
        const closed = probe(false, true, 3, true);
        const loading = probe(true, true, 0, false);

        assert.strictEqual(expressionRemoteOptions.suggestListHasContent(loading), true);
        assert.strictEqual(expressionRemoteOptions.suggestListHasContent(probe(true, false, 2, false)), true);
        assert.strictEqual(expressionRemoteOptions.suggestListHasContent(probe(true, false, 0, true)), true);
        assert.strictEqual(expressionRemoteOptions.suggestListHasContent(probe(true, false, 0, false)), false,
            'a query below the threshold was never asked, so there is nothing to say');
        assert.strictEqual(expressionRemoteOptions.suggestListHasContent(closed), false);
        assert.deepStrictEqual(closed.asked, ['isOpen']);
        assert.deepStrictEqual(loading.asked, ['isOpen', 'loading']);
    });

    return tests;
}
