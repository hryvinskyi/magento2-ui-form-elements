/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-condition module — one stored leaf between storage and the
 * state of its row. The module under test is loaded by run.mjs and handed in, with the config module
 * that indexes the fixture fields.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-condition module.
 *
 * @param {Object} expressionCondition The module's export object.
 * @param {Object} expressionConfig The config module, to index fields as the component does.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionCondition, expressionConfig) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    const textField = {type: 'zz_text', attribute: 'zz_text_attr', valueType: 'text', operators: [{value: '{}'}, {value: '=='}]};
    const listField = {type: 'zz_list', attribute: 'zz_list_attr', valueType: 'multiselect', operators: []};
    const selectField = {type: 'zz_select', attribute: 'zz_select_attr', valueType: 'select', options: [{value: 'zz_first'}]};
    const picker = {
        type: 'product_attribute_picker',
        childType: 'zz/product',
        valueType: 'product-attribute',
        attributes: [{value: 'zz_sku'}, {value: 'zz_price'}]
    };
    const fields = [textField, listField, selectField, picker];
    const byType = expressionConfig.indexFieldsByType(fields);

    test('rowSeed: a leaf of a configured type seeds a row on that field with its stored state', () => {
        const seed = expressionCondition.rowSeed(
            {type: 'zz_text', attribute: 'zz_text_attr', operator: '==', value: 'abc', is_value_processed: false},
            fields,
            byType
        );

        assert.strictEqual(seed.field, textField);
        assert.deepStrictEqual(seed.overrides, {operator: '==', value: 'abc', productAttribute: '', isValueProcessed: false});
    });

    test('rowSeed: a leaf of the picker\'s child type belongs to the picker, its attribute picked', () => {
        const seed = expressionCondition.rowSeed(
            {type: 'zz/product', attribute: 'zz_price', operator: '>=', value: 100, is_value_processed: null},
            fields,
            byType
        );

        assert.strictEqual(seed.field, picker);
        assert.strictEqual(seed.overrides.productAttribute, 'zz_price');
        assert.strictEqual(seed.overrides.value, 100);
    });

    test('rowSeed: a leaf without a type, or of an unconfigured type, is skipped', () => {
        assert.strictEqual(expressionCondition.rowSeed(null, fields, byType), null);
        assert.strictEqual(expressionCondition.rowSeed({operator: '=='}, fields, byType), null);
        assert.strictEqual(expressionCondition.rowSeed({type: 'zz_unknown'}, fields, byType), null);
        assert.strictEqual(expressionCondition.rowSeed({type: 'zz/product'}, [textField], byType), null,
            'without a picker the child type is just an unknown type');
        assert.strictEqual(expressionCondition.rowSeed({type: 'constructor'}, fields, byType), null);
    });

    test('initialState: a fresh row starts on the field\'s defaults', () => {
        assert.deepStrictEqual(expressionCondition.initialState(textField, undefined, 'zz_ignored'), {
            fieldType: 'zz_text', operator: '{}', value: '', productAttribute: '', isValueProcessed: null, storedNumber: null
        });
        assert.deepStrictEqual(expressionCondition.initialState(listField, {}, 'zz_ignored').value, []);
        assert.strictEqual(expressionCondition.initialState(selectField, {}, 'zz_ignored').value, 'zz_first');
        assert.strictEqual(expressionCondition.initialState(selectField, {}, 'zz_ignored').operator, '==');
        assert.strictEqual(expressionCondition.initialState(picker, {}, 'zz_ignored').productAttribute, 'zz_sku');
    });

    test('initialState: a row without a field takes the fallback type', () => {
        const state = expressionCondition.initialState(null, {}, 'zz_text');

        assert.strictEqual(state.fieldType, 'zz_text');
        assert.strictEqual(state.operator, '==');
        assert.strictEqual(state.value, '');
    });

    test('initialState: stored state wins, a stored false is kept, a null value takes the default', () => {
        const state = expressionCondition.initialState(
            picker,
            {operator: '()', value: 'a,b', productAttribute: 'zz_price', isValueProcessed: false},
            'zz_ignored'
        );

        assert.strictEqual(state.operator, '()');
        assert.strictEqual(state.value, 'a,b');
        assert.strictEqual(state.productAttribute, 'zz_price');
        assert.strictEqual(state.isValueProcessed, false);
        assert.strictEqual(expressionCondition.initialState(selectField, {value: null}, 'x').value, 'zz_first');
    });

    test('initialState: a value stored as a JSON number is remembered, a clone hands its number over', () => {
        assert.strictEqual(expressionCondition.initialState(textField, {value: 100}, 'x').storedNumber, 100);
        assert.strictEqual(expressionCondition.initialState(textField, {value: '100'}, 'x').storedNumber, null);
        assert.strictEqual(expressionCondition.initialState(textField, {value: '100', storedNumber: 100}, 'x').storedNumber, 100);
        assert.strictEqual(expressionCondition.initialState(textField, {value: 100, storedNumber: null}, 'x').storedNumber, null);
    });

    test('cloneOverrides: the same condition, with a list value copied rather than shared', () => {
        const list = ['a', 'b'];
        const clone = expressionCondition.cloneOverrides({
            operator: '()', value: list, productAttribute: 'zz_sku', isValueProcessed: false, storedNumber: null
        });

        assert.deepStrictEqual(clone, {operator: '()', value: ['a', 'b'], productAttribute: 'zz_sku', isValueProcessed: false, storedNumber: null});
        assert.notStrictEqual(clone.value, list);
    });

    test('toLeaf: the frozen property order, the field\'s own attribute, the stored flag echoed', () => {
        const leaf = expressionCondition.toLeaf(textField, 'zz_text', {
            operator: '==', value: 'abc', storedNumber: null, isValueProcessed: false
        }, () => {
            throw new Error('a non-picker row never asks for its picked attribute');
        });

        assert.deepStrictEqual(Object.keys(leaf), ['type', 'attribute', 'operator', 'value', 'is_value_processed']);
        assert.deepStrictEqual(leaf, {type: 'zz_text', attribute: 'zz_text_attr', operator: '==', value: 'abc', is_value_processed: false});
    });

    test('toLeaf: a picker row is stored under the child type with its picked attribute', () => {
        const leaf = expressionCondition.toLeaf(picker, 'product_attribute_picker', {
            operator: '==', value: 'X1', storedNumber: null, isValueProcessed: null
        }, () => 'zz_sku');

        assert.deepStrictEqual(Object.keys(leaf), ['type', 'attribute', 'operator', 'value', 'is_value_processed']);
        assert.deepStrictEqual(leaf, {type: 'zz/product', attribute: 'zz_sku', operator: '==', value: 'X1', is_value_processed: null});
    });

    test('toLeaf: a stored number comes back while the row still holds it, and only then', () => {
        const leafOf = (value) => expressionCondition.toLeaf(textField, 'zz_text', {
            operator: '==', value, storedNumber: 100, isValueProcessed: null
        }, () => '').value;

        assert.strictEqual(leafOf('100'), 100);
        assert.strictEqual(leafOf('101'), '101');
        assert.strictEqual(leafOf('100.0'), '100.0');
    });

    test('round trip: a leaf read into a row and written back comes out identical', () => {
        const stored = {type: 'zz/product', attribute: 'zz_price', operator: '>=', value: 100, is_value_processed: false};
        const seed = expressionCondition.rowSeed(stored, fields, byType);
        const state = expressionCondition.initialState(seed.field, seed.overrides, 'x');
        const leaf = expressionCondition.toLeaf(seed.field, state.fieldType, {
            operator: state.operator,
            value: String(state.value),
            storedNumber: state.storedNumber,
            isValueProcessed: state.isValueProcessed
        }, () => state.productAttribute);

        assert.strictEqual(JSON.stringify(leaf), JSON.stringify(stored));
    });

    /**
     * A row probe for rowLeaf() that records which observable it was asked for, in order.
     *
     * @param {Object} state operator, value, operators, attribute, storedNumber, isValueProcessed.
     * @returns {Object}
     */
    const rowProbe = (state) => {
        const asked = [];

        return {
            asked,
            operator: () => asked.push('operator') && state.operator,
            value: () => asked.push('value') && state.value,
            operators: () => asked.push('operators') && state.operators,
            attribute: () => asked.push('attribute') && state.attribute,
            storedNumber: state.storedNumber === undefined ? null : state.storedNumber,
            isValueProcessed: state.isValueProcessed === undefined ? null : state.isValueProcessed
        };
    };

    test('rowLeaf: a row whose field is not configured drops out of the saved rule, unread', () => {
        const row = rowProbe({operator: '==', value: 'x', operators: []});

        assert.strictEqual(expressionCondition.rowLeaf(undefined, 'zz_gone', row), null);
        assert.deepStrictEqual(row.asked, []);
    });

    test('rowLeaf: a list value is written in its stored shape, under the row\'s own operators', () => {
        const row = rowProbe({operator: 'zz_in', value: ['a', 'b'], operators: [{value: 'zz_in', list: true}], isValueProcessed: false});

        assert.deepStrictEqual(expressionCondition.rowLeaf(textField, 'zz_text', row),
            {type: 'zz_text', attribute: 'zz_text_attr', operator: 'zz_in', value: 'a,b', is_value_processed: false});
        assert.deepStrictEqual(row.asked, ['operator', 'value', 'operators']);
    });

    test('rowLeaf: a picker row writes its picked attribute, and a stored number comes back unquoted', () => {
        const row = rowProbe({operator: '>=', value: '100', operators: [], attribute: 'zz_price', storedNumber: 100});

        assert.strictEqual(JSON.stringify(expressionCondition.rowLeaf(picker, 'product_attribute_picker', row)),
            JSON.stringify({type: 'zz/product', attribute: 'zz_price', operator: '>=', value: 100, is_value_processed: null}));
    });

    return tests;
}
