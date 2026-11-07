/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-config module — reading the consumer's builderConfig and the
 * tunables a form's XML may override. The module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-config module.
 *
 * @param {Object} expressionConfig The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionConfig) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('positiveNumber: positive finite numbers and numeric strings pass, everything else falls back', () => {
        assert.strictEqual(expressionConfig.positiveNumber(15, 7), 15);
        assert.strictEqual(expressionConfig.positiveNumber('2.5', 7), 2.5);
        for (const junk of [0, -3, 'abc', '', null, undefined, NaN, Infinity, {}]) {
            assert.strictEqual(expressionConfig.positiveNumber(junk, 7), 7, String(junk));
        }
    });

    test('storeId: 0 is a meaningful scope, fractions floor, junk reads as 0', () => {
        assert.strictEqual(expressionConfig.storeId(3), 3);
        assert.strictEqual(expressionConfig.storeId('4.9'), 4);
        for (const value of [0, '0', -1, 'store', null, undefined, Infinity]) {
            assert.strictEqual(expressionConfig.storeId(value), 0, String(value));
        }
    });

    test('oneOf: an allowed value is kept, anything else degrades to the fallback', () => {
        const allowed = ['rail', 'chip', 'none'];

        assert.strictEqual(expressionConfig.oneOf('chip', allowed, 'rail'), 'chip');
        assert.strictEqual(expressionConfig.oneOf('dotted', allowed, 'rail'), 'rail');
        assert.strictEqual(expressionConfig.oneOf(undefined, allowed, 'rail'), 'rail');
    });

    test('readBuilderConfig: absent keys take their documented meaning', () => {
        for (const raw of [undefined, null, {}]) {
            assert.deepStrictEqual(expressionConfig.readBuilderConfig(raw), {
                fields: [],
                combineType: '',
                suggestUrl: '',
                emptyStateMessage: '',
                coherence: {},
                countUrl: '',
                countLabel: '',
                countStoreId: 0,
                optionsUrl: '',
                operatorSets: {},
                suggestMinQuery: raw === null ? null : undefined
            });
        }
    });

    test('readBuilderConfig: present keys pass through untouched, the store id is sanitised', () => {
        const fields = [{type: 'zz_one'}];
        const coherence = {contextAttribute: 'zz_context'};
        const operatorSets = {zz_set: []};
        const read = expressionConfig.readBuilderConfig({
            fields,
            combineType: 'zz/combine',
            suggestUrl: '/zz/suggest',
            emptyStateMessage: 'Nothing yet',
            coherence,
            countUrl: '/zz/count',
            countLabel: '%1 found',
            countStoreId: '2',
            optionsUrl: '/zz/options',
            operatorSets,
            suggestMinQuery: '3'
        });

        assert.strictEqual(read.fields, fields);
        assert.strictEqual(read.coherence, coherence);
        assert.strictEqual(read.operatorSets, operatorSets);
        assert.strictEqual(read.combineType, 'zz/combine');
        assert.strictEqual(read.countLabel, '%1 found');
        assert.strictEqual(read.countStoreId, 2);
        assert.strictEqual(read.suggestMinQuery, '3');
    });

    test('indexFieldsByType: keys by type, a later field wins a repeated type', () => {
        const first = {type: 'zz_a', label: 'first'};
        const second = {type: 'zz_b'};
        const repeat = {type: 'zz_a', label: 'repeat'};
        const byType = expressionConfig.indexFieldsByType([first, second, repeat]);

        assert.strictEqual(byType.zz_a, repeat);
        assert.strictEqual(byType.zz_b, second);
        assert.deepStrictEqual(Object.keys(byType).sort(), ['zz_a', 'zz_b']);
    });

    test('indexFieldsByType: an object of fields indexes its values, anything else indexes nothing', () => {
        const field = {type: 'zz_a'};

        assert.strictEqual(expressionConfig.indexFieldsByType({0: field}).zz_a, field);
        assert.deepStrictEqual(Object.keys(expressionConfig.indexFieldsByType(null)), []);
    });

    test('indexFieldsByType: a type spelling an Object.prototype member resolves to no field', () => {
        const byType = expressionConfig.indexFieldsByType([{type: 'zz_a'}]);

        assert.strictEqual(byType.constructor, undefined);
        assert.strictEqual(byType.toString, undefined);
    });

    test('JOINER_STYLES and DENSITIES: the values the visual tunables may take', () => {
        assert.deepStrictEqual(expressionConfig.JOINER_STYLES, ['rail', 'chip', 'none']);
        assert.deepStrictEqual(expressionConfig.DENSITIES, ['comfortable', 'compact']);
        assert.strictEqual(expressionConfig.oneOf('zz_junk', expressionConfig.JOINER_STYLES, 'rail'), 'rail');
    });

    test('enabledUnlessFalse: only a literal false switches a flag off', () => {
        assert.strictEqual(expressionConfig.enabledUnlessFalse(false), false);
        for (const value of [true, undefined, null, 0, '', 'false', 'no']) {
            assert.strictEqual(expressionConfig.enabledUnlessFalse(value), true, JSON.stringify(value));
        }
    });

    test('textOrEmpty: a string as given, anything else as no text', () => {
        assert.strictEqual(expressionConfig.textOrEmpty('Targeting rule'), 'Targeting rule');
        assert.strictEqual(expressionConfig.textOrEmpty(''), '');
        for (const value of [undefined, null, 0, {}, ['a']]) {
            assert.strictEqual(expressionConfig.textOrEmpty(value), '', JSON.stringify(value));
        }
    });

    return tests;
}
