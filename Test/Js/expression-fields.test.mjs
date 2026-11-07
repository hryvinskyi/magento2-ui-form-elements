/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-fields module — what a field descriptor says about a row.
 * The module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-fields module.
 *
 * @param {Object} expressionFields The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionFields) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});
    const PICKER = expressionFields.PRODUCT_ATTRIBUTE_PICKER;
    const ops = (...values) => values.map((value) => ({value, label: 'label ' + value}));

    /**
     * A picker field whose attributes narrow its operators three ways: an own list, a named shared
     * set, and nothing at all.
     *
     * @returns {Object}
     */
    const picker = () => ({
        type: PICKER,
        valueType: 'product-attribute',
        operators: ops('==', '!='),
        attributes: [
            {value: 'zz_own', label: 'Own', operators: ops('>=')},
            {value: 'zz_named', label: 'Named', operatorSet: 'zz_membership'},
            {value: 'zz_plain', label: 'Plain', unit: 'zz-unit', options: [{value: '1', label: 'One', level: 1}]},
            {value: 'zz_proto', label: 'Proto', operatorSet: 'toString'}
        ]
    });
    const sets = {zz_membership: ops('()', '!()')};

    test('PRODUCT_ATTRIBUTE_PICKER: the picker field type is the component vocabulary', () => {
        assert.strictEqual(PICKER, 'product_attribute_picker');
        assert.strictEqual(expressionFields.isPicker(picker()), true);
        assert.strictEqual(expressionFields.isPicker({type: 'zz_text'}), false);
        assert.strictEqual(expressionFields.isPicker(null), false);
    });

    test('attributeInfo: the picked descriptor on a picker, null elsewhere and for an unknown code', () => {
        const field = picker();

        assert.strictEqual(expressionFields.attributeInfo(field, 'zz_named'), field.attributes[1]);
        assert.strictEqual(expressionFields.attributeInfo(field, 'zz_missing'), null);
        assert.strictEqual(expressionFields.attributeInfo({type: 'zz_text', attributes: field.attributes}, 'zz_named'), null);
        assert.strictEqual(expressionFields.attributeInfo(null, 'zz_named'), null);
    });

    test('attributeInfo: a descriptor without a value key never matches, not even undefined', () => {
        const field = {type: PICKER, attributes: [{label: 'No value'}, {value: undefined, label: 'Undefined'}]};

        assert.strictEqual(expressionFields.attributeInfo(field, undefined), field.attributes[1]);
    });

    test('operatorsFor: an attribute\'s own list, then a named set, then the field\'s operators', () => {
        const field = picker();
        const operatorsOf = (code) => expressionFields.operatorsFor(field, expressionFields.attributeInfo(field, code), sets);

        assert.strictEqual(operatorsOf('zz_own'), field.attributes[0].operators);
        assert.strictEqual(operatorsOf('zz_named'), sets.zz_membership);
        assert.strictEqual(operatorsOf('zz_plain'), field.operators);
        assert.strictEqual(operatorsOf('zz_proto'), field.operators, 'a set name spelling a prototype member resolves to nothing');
        assert.strictEqual(expressionFields.operatorsFor(field, null, sets), field.operators);
    });

    test('operatorsFor: only a picker is narrowed by an attribute; no field offers nothing', () => {
        const field = {type: 'zz_text', operators: ops('==')};

        assert.strictEqual(expressionFields.operatorsFor(field, {operators: ops('>=')}, sets), field.operators);
        assert.deepStrictEqual(expressionFields.operatorsFor({type: 'zz_text'}, null, sets), []);
        assert.deepStrictEqual(expressionFields.operatorsFor(null, null, sets), []);
    });

    test('operator entries and labels: found by exact value, a missing one reads as itself', () => {
        const operators = ops('==', '()');

        assert.strictEqual(expressionFields.operatorEntry(operators, '()'), operators[1]);
        assert.strictEqual(expressionFields.operatorEntry(operators, '~'), null);
        assert.strictEqual(expressionFields.operatorLabel(operators, '=='), 'label ==');
        assert.strictEqual(expressionFields.operatorLabel(operators, '~'), '~');
        assert.strictEqual(expressionFields.offersOperator(operators, '()'), true);
        assert.strictEqual(expressionFields.offersOperator(operators, '~'), false);
    });

    test('attribute and option labels: an attribute by its code, an option by its value as a string', () => {
        const field = picker();
        const options = [{value: '5', label: 'Five'}];

        assert.strictEqual(expressionFields.attributeLabel(field.attributes, 'zz_named'), 'Named');
        assert.strictEqual(expressionFields.attributeLabel(field.attributes, 'zz_gone'), 'zz_gone');
        assert.strictEqual(expressionFields.optionLabel(options, 5), 'Five');
        assert.strictEqual(expressionFields.optionLabel(options, 6), 6);
    });

    test('defaults: the first operator or equality, the first attribute, the value a fresh row starts with', () => {
        assert.strictEqual(expressionFields.defaultOperator(ops('()', '==')), '()');
        assert.strictEqual(expressionFields.defaultOperator([]), '==');
        assert.strictEqual(expressionFields.defaultAttribute(picker()), 'zz_own');
        assert.strictEqual(expressionFields.defaultAttribute({type: 'zz_text'}), '');
        assert.strictEqual(expressionFields.defaultAttribute(null), '');
        assert.deepStrictEqual(expressionFields.defaultValue({valueType: 'multiselect'}), []);
        assert.strictEqual(expressionFields.defaultValue({valueType: 'select', options: [{value: 'zz_first'}]}), 'zz_first');
        assert.strictEqual(expressionFields.defaultValue({valueType: 'select', options: []}), '');
        assert.strictEqual(expressionFields.defaultValue({valueType: 'text'}), '');
        assert.strictEqual(expressionFields.defaultValue(null), '');
    });

    test('valueType, valueOptions, attributes, placeholder: read off the field, neutral without one', () => {
        const field = {valueType: 'select', options: [{value: '1'}], attributes: [{value: 'a'}], placeholder: 'Pick'};

        assert.strictEqual(expressionFields.valueType(field), 'select');
        assert.strictEqual(expressionFields.valueType(null), 'text');
        assert.strictEqual(expressionFields.valueOptions(field), field.options);
        assert.deepStrictEqual(expressionFields.valueOptions({}), []);
        assert.strictEqual(expressionFields.attributes(field), field.attributes);
        assert.deepStrictEqual(expressionFields.attributes(null), []);
        assert.strictEqual(expressionFields.placeholder(field), 'Pick');
        assert.strictEqual(expressionFields.placeholder({}), '');
    });

    test('unit: the attribute answers for a value that follows it, the field for every other', () => {
        const field = picker();
        let asked = 0;
        const attributeOf = () => {
            asked++;

            return field.attributes[2];
        };

        assert.strictEqual(expressionFields.unit(field, attributeOf), 'zz-unit');
        assert.strictEqual(asked, 1);
        assert.strictEqual(expressionFields.unit({valueType: 'text', unit: 'kg'}, attributeOf), 'kg');
        assert.strictEqual(asked, 1, 'a field whose value does not follow the attribute never asks for it');
        assert.strictEqual(expressionFields.unit({valueType: 'text', unit: 0}, attributeOf), '');
        assert.strictEqual(expressionFields.unit(field, () => null), '');
        assert.strictEqual(expressionFields.unit(null, attributeOf), '');
    });

    test('optionsHost and hasHierarchy: whose options a row edits, and whether they form a tree', () => {
        const field = picker();
        const attribute = field.attributes[2];

        assert.strictEqual(expressionFields.optionsHost(field, () => attribute), attribute);
        assert.strictEqual(expressionFields.optionsHost({valueType: 'select'}, () => attribute).valueType, 'select');
        assert.strictEqual(expressionFields.optionsHost(null, () => attribute), null);
        assert.strictEqual(expressionFields.hasHierarchy(attribute), true);
        assert.strictEqual(expressionFields.hasHierarchy({options: [{value: '1', label: 'Flat'}]}), false);
        assert.strictEqual(expressionFields.hasHierarchy({options: []}), false);
        assert.strictEqual(expressionFields.hasHierarchy(null), false);
        assert.strictEqual(expressionFields.optionCount(attribute), 1);
        assert.strictEqual(expressionFields.optionCount(null), 0);
    });

    test('scalarDescriptor: the attribute for a value that follows it, the field otherwise, null without one', () => {
        const field = picker();
        const attribute = field.attributes[0];
        const text = {valueType: 'text'};

        assert.strictEqual(expressionFields.scalarDescriptor(field, () => attribute), attribute);
        assert.strictEqual(expressionFields.scalarDescriptor(text, () => attribute), text);
        assert.strictEqual(expressionFields.scalarDescriptor(null, () => attribute), null);
    });

    /**
     * A probe whose every member answers a fixed value and records, in order, that it was asked.
     *
     * @param {Object.<String, *>} answers Member name → the value it answers.
     * @returns {Object} The probe, with `asked` listing the members asked.
     */
    const lazy = (answers) => {
        const probe = {asked: []};

        for (const [name, value] of Object.entries(answers)) {
            probe[name] = () => {
                probe.asked.push(name);

                return value;
            };
        }

        return probe;
    };
    const optionsOf = (count) => Array.from({length: count}, (unused, at) => ({value: String(at), label: 'zz ' + at}));

    test('ATTRIBUTE_VALUE_TYPE: the value type whose editor follows the picked attribute', () => {
        assert.strictEqual(expressionFields.ATTRIBUTE_VALUE_TYPE, 'product-attribute');
        assert.strictEqual(expressionFields.followsAttribute({valueType: expressionFields.ATTRIBUTE_VALUE_TYPE}), true);
    });

    test('hasLoadedOptions: a non-empty landed list, not the mere promise of one', () => {
        assert.strictEqual(expressionFields.hasLoadedOptions({options: optionsOf(1)}), true);
        assert.strictEqual(expressionFields.hasLoadedOptions({options: []}), false);
        assert.strictEqual(expressionFields.hasLoadedOptions({hasOptions: true}), false,
            'a declared list that has not arrived yet');
        assert.strictEqual(expressionFields.hasLoadedOptions(null), false);
    });

    test('supportsSuggest: the attribute says the backend suggests its values', () => {
        assert.strictEqual(expressionFields.supportsSuggest({suggest: true}), true);
        assert.strictEqual(expressionFields.supportsSuggest({suggest: false}), false);
        assert.strictEqual(expressionFields.supportsSuggest({}), false);
        assert.strictEqual(expressionFields.supportsSuggest(null), false);
    });

    test('defaultField and defaultFieldType: a fresh row starts on the first configured field', () => {
        const first = {type: 'zz_first'};

        assert.strictEqual(expressionFields.defaultField([first, {type: 'zz_second'}]), first);
        assert.strictEqual(expressionFields.defaultField([]), null);
        assert.strictEqual(expressionFields.defaultFieldType([first]), 'zz_first');
        assert.strictEqual(expressionFields.defaultFieldType([]), undefined);
    });

    test('fieldSwitchState: what a row switched onto a field starts with; nothing for an unknown field', () => {
        assert.deepStrictEqual(expressionFields.fieldSwitchState(picker()),
            {operator: '==', value: '', productAttribute: 'zz_own'});
        assert.deepStrictEqual(expressionFields.fieldSwitchState({valueType: 'multiselect'}),
            {operator: '==', value: [], productAttribute: ''});
        assert.deepStrictEqual(expressionFields.fieldSwitchState({valueType: 'select', operators: ops('!='), options: optionsOf(2)}),
            {operator: '!=', value: '0', productAttribute: ''});
        assert.strictEqual(expressionFields.fieldSwitchState(null), null);
        assert.strictEqual(expressionFields.fieldSwitchState(undefined), null);
    });

    test('attributeSwitchState: the operator survives when still offered, the value restarts in the editor\'s shape', () => {
        assert.deepStrictEqual(expressionFields.attributeSwitchState(ops('==', '()'), '()', true), {operator: '()', value: []});
        assert.deepStrictEqual(expressionFields.attributeSwitchState(ops('==', '()'), '>=', false), {operator: '==', value: ''});
        assert.deepStrictEqual(expressionFields.attributeSwitchState([], '>=', false), {operator: '==', value: ''},
            'with nothing offered the row falls back to equality');
    });

    test('isLargeOptionList: more options than the threshold; anything but a list is none', () => {
        assert.strictEqual(expressionFields.isLargeOptionList(optionsOf(16), 15), true);
        assert.strictEqual(expressionFields.isLargeOptionList(optionsOf(15), 15), false, 'the threshold itself still scans');
        assert.strictEqual(expressionFields.isLargeOptionList(undefined, 0), false);
        assert.strictEqual(expressionFields.isLargeOptionList({length: 99}, 15), false);
    });

    test('picksOneFieldOption: a select field under a single-value operator; the operator asked only for a select', () => {
        const text = lazy({valueType: 'text', usesListOperator: false});

        assert.strictEqual(expressionFields.picksOneFieldOption(lazy({valueType: 'select', usesListOperator: false})), true);
        assert.strictEqual(expressionFields.picksOneFieldOption(lazy({valueType: 'select', usesListOperator: true})), false);
        assert.strictEqual(expressionFields.picksOneFieldOption(text), false);
        assert.deepStrictEqual(text.asked, ['valueType']);
    });

    test('picksOneAttributeOption: an attribute-following value with a loaded list under a single-value operator', () => {
        const text = lazy({valueType: 'text', hasOptions: true, usesListOperator: false});
        const unloaded = lazy({valueType: 'product-attribute', hasOptions: false, usesListOperator: false});

        assert.strictEqual(expressionFields.picksOneAttributeOption(
            lazy({valueType: 'product-attribute', hasOptions: true, usesListOperator: false})), true);
        assert.strictEqual(expressionFields.picksOneAttributeOption(
            lazy({valueType: 'product-attribute', hasOptions: true, usesListOperator: true})), false);
        assert.strictEqual(expressionFields.picksOneAttributeOption(unloaded), false);
        assert.strictEqual(expressionFields.picksOneAttributeOption(text), false);
        assert.deepStrictEqual(text.asked, ['valueType'], 'only an attribute-following row asks for its list');
        assert.deepStrictEqual(unloaded.asked, ['valueType', 'hasOptions']);
    });

    test('singleSelectEditor: the plain select for a list that scans, the searchable one above the threshold', () => {
        const pickNone = lazy({picksOne: false, options: optionsOf(40)});

        assert.strictEqual(expressionFields.singleSelectEditor(lazy({picksOne: true, options: optionsOf(3)}), 15), 'plain');
        assert.strictEqual(expressionFields.singleSelectEditor(lazy({picksOne: true, options: optionsOf(40)}), 15), 'searchable');
        assert.strictEqual(expressionFields.singleSelectEditor(pickNone, 15), null);
        assert.deepStrictEqual(pickNone.asked, ['picksOne'], 'a row that picks no single option never reads a list');
    });

    test('hierarchyIndex: the index of a hierarchy, asked for only then; a flat list searches without one', () => {
        const index = {roots: []};
        let built = 0;
        const indexOf = () => {
            built++;

            return index;
        };

        assert.strictEqual(expressionFields.hierarchyIndex(picker().attributes[2], indexOf), index);
        assert.strictEqual(expressionFields.hierarchyIndex({options: optionsOf(3)}, indexOf), null);
        assert.strictEqual(expressionFields.hierarchyIndex(null, indexOf), null);
        assert.strictEqual(built, 1);
    });

    test('pickedAttribute: the picked descriptor on a picker row; any other row never reads its attribute', () => {
        const field = picker();
        let read = 0;
        const codeOf = (code) => () => {
            read++;

            return code;
        };

        assert.strictEqual(expressionFields.pickedAttribute(field, codeOf('zz_named')), field.attributes[1]);
        assert.strictEqual(expressionFields.pickedAttribute(field, codeOf('zz_gone')), null);
        assert.strictEqual(expressionFields.pickedAttribute({type: 'zz_text', attributes: field.attributes}, codeOf('zz_named')), null);
        assert.strictEqual(expressionFields.pickedAttribute(undefined, codeOf('zz_named')), null);
        assert.strictEqual(read, 2);
    });

    return tests;
}
