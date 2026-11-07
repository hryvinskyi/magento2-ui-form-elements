/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-preview module — the structured preview's shape and how a
 * value prints. The module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-preview module.
 *
 * @param {Object} expressionPreview The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionPreview) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});
    const joiners = {all: 'AND', any: 'OR'};
    const row = (name) => ({kind: 'condition', condition: {name}});
    const group = (aggregator, ...children) => ({kind: 'group', aggregator, children});
    const describe = (payload) => (payload.name === 'skip' ? null : {kind: 'condition', field: payload.name});

    test('previewGroup: children joined by their group\'s word, the first child unjoined', () => {
        const preview = expressionPreview.previewGroup(
            group('all', row('a'), group('any', row('b'), row('c')), row('d')),
            describe,
            joiners,
            true
        );

        assert.deepStrictEqual(preview, {
            kind: 'group',
            root: true,
            children: [
                {kind: 'condition', field: 'a', joiner: ''},
                {
                    kind: 'group',
                    root: false,
                    joiner: 'AND',
                    children: [
                        {kind: 'condition', field: 'b', joiner: ''},
                        {kind: 'condition', field: 'c', joiner: 'OR'}
                    ]
                },
                {kind: 'condition', field: 'd', joiner: 'AND'}
            ]
        });
    });

    test('previewGroup: an empty group collapses and is skipped, a skipped row takes no joiner', () => {
        const preview = expressionPreview.previewGroup(
            group('any', row('skip'), group('all'), group('all', row('skip')), row('a'), row('b')),
            describe,
            joiners,
            true
        );

        assert.deepStrictEqual(preview.children, [
            {kind: 'condition', field: 'a', joiner: ''},
            {kind: 'condition', field: 'b', joiner: 'OR'}
        ]);
    });

    test('previewGroup: a rule with nothing to show has no preview', () => {
        assert.strictEqual(expressionPreview.previewGroup(group('all'), describe, joiners, true), null);
        assert.strictEqual(expressionPreview.previewGroup(group('all', group('any')), describe, joiners, true), null);
    });

    test('valueText: a list prints its labels in braces', () => {
        assert.strictEqual(expressionPreview.valueText(['1', '2'], 'text', (v) => 'L' + v, () => true), '{L1, L2}');
        assert.strictEqual(expressionPreview.valueText([], 'select', (v) => v, () => true), '{}');
    });

    test('valueText: a select prints its option\'s label', () => {
        assert.strictEqual(expressionPreview.valueText('7', 'select', (v) => 'Seven' + v, () => false), 'Seven7');
    });

    test('valueText: an attribute value prints a label only while the attribute has its list', () => {
        let asked = 0;
        const hasOptions = (answer) => () => {
            asked++;

            return answer;
        };

        assert.strictEqual(expressionPreview.valueText('7', 'product-attribute', (v) => 'L' + v, hasOptions(true)), 'L7');
        assert.strictEqual(expressionPreview.valueText(undefined, 'product-attribute', (v) => 'L' + v, hasOptions(true)), '""');
        assert.strictEqual(expressionPreview.valueText('', 'product-attribute', (v) => 'L' + v, hasOptions(true)), '""');
        assert.strictEqual(expressionPreview.valueText('7', 'product-attribute', (v) => 'L' + v, hasOptions(false)), '"7"');
        assert.strictEqual(asked, 4);
        expressionPreview.valueText('7', 'text', (v) => v, hasOptions(true));
        assert.strictEqual(asked, 4, 'a value that does not follow an attribute never asks about its list');
    });

    test('valueText: anything else is quoted text, an empty or zero value as the empty string', () => {
        assert.strictEqual(expressionPreview.valueText('abc', 'text', (v) => v, () => true), '"abc"');
        assert.strictEqual(expressionPreview.valueText(null, 'text', (v) => v, () => true), '""');
        assert.strictEqual(expressionPreview.valueText(0, 'integer', (v) => v, () => true), '""');
        assert.strictEqual(expressionPreview.valueText('x', 'constructor', (v) => 'L' + v, () => true), '"x"');
    });

    /**
     * A row probe for conditionNode() that records what it was asked, in order.
     *
     * @param {*} value The row's stored value.
     * @param {Boolean} hasOptions Whether the row's attribute has a loaded option list.
     * @returns {Object}
     */
    const rowProbe = (value, hasOptions) => {
        const asked = [];

        return {
            asked,
            attributeLabel: () => asked.push('attributeLabel') && 'Colour',
            operatorLabel: () => asked.push('operatorLabel') && 'is',
            value: () => asked.push('value') && value,
            pathLabel: (item) => asked.push('pathLabel') && 'Path ' + item,
            optionLabel: (item) => asked.push('optionLabel') && 'Option ' + item,
            hasOptions: () => asked.push('hasOptions') && hasOptions
        };
    };

    test('conditionNode: an unconfigured field prints a question mark and nothing else', () => {
        const row = rowProbe('7', true);

        assert.deepStrictEqual(expressionPreview.conditionNode(null, row), {kind: 'condition', field: '?', operator: '', value: ''});
        assert.deepStrictEqual(row.asked, []);
    });

    test('conditionNode: the picker prints its picked attribute, its values through their breadcrumb path', () => {
        const picker = {type: 'product_attribute_picker', label: 'Product attribute', valueType: 'product-attribute'};
        const row = rowProbe(['3', '31'], true);

        assert.deepStrictEqual(expressionPreview.conditionNode(picker, row),
            {kind: 'condition', field: 'Colour', operator: 'is', value: '{Path 3, Path 31}'});
        assert.deepStrictEqual(row.asked, ['attributeLabel', 'operatorLabel', 'value', 'pathLabel', 'pathLabel']);
    });

    test('conditionNode: any other field prints its own label, its values through its option labels', () => {
        const row = rowProbe('7', false);

        assert.deepStrictEqual(expressionPreview.conditionNode({type: 'zz_select', label: 'Size', valueType: 'select'}, row),
            {kind: 'condition', field: 'Size', operator: 'is', value: 'Option 7'});
        assert.deepStrictEqual(row.asked, ['operatorLabel', 'value', 'optionLabel']);
    });

    return tests;
}
