/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the value-sync module — when a mounted builder's value is reported to its
 * caller and when a value the caller hands in is loaded. The module under test is loaded by run.mjs
 * and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded value-sync module.
 *
 * @param {Object} valueSync The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(valueSync) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});
    const RAW = '{ "aggregator": "all" }';
    const CANONICAL = '{"aggregator":"all"}';

    test('the builder\'s rewrite of the value it was mounted with is not an edit', () => {
        const sync = valueSync.createValueSync(RAW);

        sync.loaded(CANONICAL);

        assert.strictEqual(sync.changed(CANONICAL), false);
    });

    test('an edit is reported once', () => {
        const sync = valueSync.createValueSync('');

        sync.loaded('');

        assert.strictEqual(sync.changed('{"a":1}'), true);
        assert.strictEqual(sync.changed('{"a":1}'), false);
        assert.strictEqual(sync.changed('{"a":2}'), true);
    });

    test('the value the builder holds, or the raw value last handed in, is not loaded again', () => {
        const sync = valueSync.createValueSync(RAW);

        sync.loaded(CANONICAL);

        assert.strictEqual(sync.wants(CANONICAL), false);
        assert.strictEqual(sync.wants(RAW), false);
    });

    test('an edit handed straight back by the caller is not loaded', () => {
        const sync = valueSync.createValueSync('');

        sync.loaded('');
        sync.changed('{"a":1}');

        assert.strictEqual(sync.wants('{"a":1}'), false);
    });

    test('a different value is loaded, and neither its write nor its rewrite is reported', () => {
        const sync = valueSync.createValueSync('');

        sync.loaded('');

        assert.strictEqual(sync.wants(RAW), true);
        assert.strictEqual(sync.changed(RAW), false);
        sync.loaded(CANONICAL);
        assert.strictEqual(sync.changed(CANONICAL), false);
        assert.strictEqual(sync.wants(RAW), false);
    });

    test('after an edit, the raw value handed in before it is loaded again', () => {
        const sync = valueSync.createValueSync(RAW);

        sync.loaded(CANONICAL);
        sync.changed('{"a":1}');

        assert.strictEqual(sync.wants(RAW), true);
    });

    test('clearing the rule is a value like any other', () => {
        const sync = valueSync.createValueSync(CANONICAL);

        sync.loaded(CANONICAL);

        assert.strictEqual(sync.wants(''), true);
        sync.loaded('');
        assert.strictEqual(sync.changed(''), false);
        assert.strictEqual(sync.changed(CANONICAL), true);
    });

    return tests;
}
