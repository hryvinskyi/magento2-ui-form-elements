/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-count module — the match-count badge's rules. The module
 * under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-count module.
 *
 * @param {Object} expressionCount The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionCount) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('planCount: an unchanged rule asks nothing, an empty one settles idle, any other one loads', () => {
        assert.strictEqual(expressionCount.planCount('{"a":1}', '{"a":1}'), null);
        assert.strictEqual(expressionCount.planCount('', ''), null);
        assert.deepStrictEqual(expressionCount.planCount(null, ''), {state: 'idle', request: false});
        assert.deepStrictEqual(expressionCount.planCount('{"a":1}', ''), {state: 'idle', request: false});
        assert.deepStrictEqual(expressionCount.planCount(null, '{"a":1}'), {state: 'loading', request: true});
        assert.deepStrictEqual(expressionCount.planCount('{"a":1}', '{"a":2}'), {state: 'loading', request: true});
    });

    test('requestFields: the rule, the store as a string and the form key, in that order', () => {
        assert.deepStrictEqual(expressionCount.requestFields('{"a":1}', 3, 'zz-key'), [
            ['conditions', '{"a":1}'],
            ['store_id', '3'],
            ['form_key', 'zz-key']
        ]);
    });

    test('readAnswer: a non-negative count reads as ready, floored, capped only on a literal true', () => {
        assert.deepStrictEqual(expressionCount.readAnswer({count: 12, capped: false}), {state: 'ready', count: 12, capped: false});
        assert.deepStrictEqual(expressionCount.readAnswer({count: '12.9', capped: true}), {state: 'ready', count: 12, capped: true});
        assert.deepStrictEqual(expressionCount.readAnswer({count: 0, capped: 'yes'}), {state: 'ready', count: 0, capped: false});
    });

    test('readAnswer: no usable count is an error, never a zero', () => {
        const error = {state: 'error', count: null, capped: false};

        for (const data of [null, undefined, {}, {error: true, count: 5}, {count: null}, {count: ''},
            {count: 'many'}, {count: -1}, {count: Infinity}]) {
            assert.deepStrictEqual(expressionCount.readAnswer(data), error, JSON.stringify(data));
        }
    });

    test('formatCount: thousands grouped by a non-breaking space, a plus when capped, nothing without a count', () => {
        assert.strictEqual(expressionCount.formatCount(0, false), '0');
        assert.strictEqual(expressionCount.formatCount(999, false), '999');
        assert.strictEqual(expressionCount.formatCount(1000, false), '1\u00a0000');
        assert.strictEqual(expressionCount.formatCount(1234567, true), '1\u00a0234\u00a0567+');
        assert.strictEqual(expressionCount.formatCount(null, true), '');
        assert.strictEqual(expressionCount.formatCount(undefined, false), '');
    });

    test('labelWithCount: every placeholder replaced, the bare number without one', () => {
        assert.strictEqual(expressionCount.labelWithCount('%1 of %1 match', '5'), '5 of 5 match');
        assert.strictEqual(expressionCount.labelWithCount('Matching', '5'), '5');
        assert.strictEqual(expressionCount.labelWithCount('', '5'), '5');
        assert.strictEqual(expressionCount.labelWithCount('Found %1', '$&'), 'Found $&');
    });

    test('badgeVisible: only with an endpoint, and only with a rule to count', () => {
        assert.strictEqual(expressionCount.badgeVisible('/zz/count', 'loading'), true);
        assert.strictEqual(expressionCount.badgeVisible('/zz/count', 'error'), true);
        assert.strictEqual(expressionCount.badgeVisible('/zz/count', 'idle'), false);
        assert.strictEqual(expressionCount.badgeVisible('', 'ready'), false);
    });

    test('countsMatches: a consumer counts only with an endpoint', () => {
        assert.strictEqual(expressionCount.countsMatches('/zz/count'), true);
        assert.strictEqual(expressionCount.countsMatches(''), false);
    });

    return tests;
}
