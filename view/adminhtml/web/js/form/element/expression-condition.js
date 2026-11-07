/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure mapping between one stored condition leaf and the state of the row that edits it.
 *
 * Loading reads a leaf into the state a row starts in: which field it belongs to (a leaf of the
 * picker's child type belongs to the picker, with the leaf's attribute as the picked one), and
 * the operator, value and attribute it carries. Saving writes a row back into the frozen leaf
 * shape. Two pieces of stored state exist only so that an unchanged rule saves byte-identically:
 * the `is_value_processed` flag, echoed as it was loaded, and a value stored as a JSON number,
 * written back as the number while the row still holds it.
 *
 * The group structure around the leaves is expression-tree.js's, the value's editor shapes are
 * expression-value.js's; this module sits between them and the row.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-fields',
    'Hryvinskyi_UiFormElements/js/form/element/expression-value'
], function (expressionFields, expressionValue) {
    'use strict';

    /**
     * The field a stored leaf belongs to and the state its row starts in, or null when the leaf has
     * no type or its type matches no configured field — such a leaf is skipped on load.
     *
     * @param {*} leaf Stored leaf condition.
     * @param {Array.<Object>|Object} fields The configured fields.
     * @param {Object.<String, Object>} fieldsByType The configured fields by type.
     * @returns {{field: Object, overrides: Object}|null}
     */
    function rowSeed(leaf, fields, fieldsByType) {
        var fieldType;
        var productAttribute = '';
        var picker;

        if (!leaf || !leaf.type) {
            return null;
        }
        fieldType = leaf.type;
        picker = expressionFields.entriesOf(fields).filter(expressionFields.isPicker)[0];

        if (picker && leaf.type === picker.childType) {
            fieldType = expressionFields.PRODUCT_ATTRIBUTE_PICKER;
            productAttribute = leaf.attribute || '';
        }

        if (!fieldsByType[fieldType]) {
            return null;
        }

        return {
            field: fieldsByType[fieldType],
            overrides: {
                operator: leaf.operator,
                value: leaf.value,
                productAttribute: productAttribute,
                isValueProcessed: leaf.is_value_processed
            }
        };
    }

    /**
     * The state a row starts in, before its value is shaped for its editor.
     *
     * Each override the row was given wins over the field's default: a stored operator over the
     * field's first, a stored value (anything but null and undefined) over the field's default
     * value, a stored attribute over the field's first. `isValueProcessed` is kept exactly as
     * given — a stored `false` included — and is null for a row the admin adds. `storedNumber` is
     * the value when it arrived as a JSON number: a clone hands its source's over directly, and
     * every other row lets its loaded value speak for itself, so both routes agree.
     *
     * @param {Object|null} field The field the row starts on.
     * @param {Object} [overrides] operator, value, productAttribute, isValueProcessed, storedNumber.
     * @param {*} fallbackFieldType The row's field type when it has no field.
     * @returns {{
     *     fieldType: *,
     *     operator: *,
     *     value: *,
     *     productAttribute: *,
     *     isValueProcessed: *,
     *     storedNumber: (Number|null)
     * }}
     */
    function initialState(field, overrides, fallbackFieldType) {
        var given = overrides || {};
        var storedNumber = given.storedNumber !== undefined ? given.storedNumber : given.value;

        return {
            fieldType: field ? field.type : fallbackFieldType,
            operator: given.operator
                || (field && field.operators && field.operators.length ? field.operators[0].value : '=='),
            value: given.value !== undefined && given.value !== null
                ? given.value
                : expressionFields.defaultValue(field),
            productAttribute: given.productAttribute || expressionFields.defaultAttribute(field),
            isValueProcessed: given.isValueProcessed === undefined ? null : given.isValueProcessed,
            storedNumber: typeof storedNumber === 'number' ? storedNumber : null
        };
    }

    /**
     * The overrides that rebuild a row carrying the same condition: same operator, attribute and
     * stored state, and a copy of a list value so edits on either row never reach the other.
     *
     * @param {{operator: *, value: *, productAttribute: *, isValueProcessed: *, storedNumber: *}} state
     * @returns {Object}
     */
    function cloneOverrides(state) {
        return {
            operator: state.operator,
            value: Array.isArray(state.value) ? state.value.slice() : state.value,
            productAttribute: state.productAttribute,
            isValueProcessed: state.isValueProcessed,
            storedNumber: state.storedNumber
        };
    }

    /**
     * A row written back as a stored leaf.
     *
     * Property ORDER is load-bearing — type, attribute, operator, value, is_value_processed —
     * because the field value is produced by JSON.stringify and an unchanged rule must come back
     * out byte-identical. A picker row is stored under the picker's child type with its picked
     * attribute; every other row under its own type with its field's attribute. The picked
     * attribute is asked for only on a picker row.
     *
     * The stored number comes back only while the row still holds exactly that number, judged by
     * comparing string forms, so the first real edit falls back to the string shape on its own.
     *
     * @param {Object} field The row's field.
     * @param {*} fieldType The row's field type.
     * @param {{operator: *, value: String, storedNumber: (Number|null), isValueProcessed: *}} state
     *     The row's operator, its value already serialised, and its stored state.
     * @param {Function} attributeOf Answers the row's picked attribute code.
     * @returns {Object}
     */
    function toLeaf(field, fieldType, state, attributeOf) {
        var value = state.value;

        if (state.storedNumber !== null && String(state.storedNumber) === value) {
            value = state.storedNumber;
        }

        if (fieldType === expressionFields.PRODUCT_ATTRIBUTE_PICKER) {
            return {
                type: field.childType,
                attribute: attributeOf(),
                operator: state.operator,
                value: value,
                is_value_processed: state.isValueProcessed
            };
        }

        return {
            type: fieldType,
            attribute: field.attribute,
            operator: state.operator,
            value: value,
            is_value_processed: state.isValueProcessed
        };
    }

    /**
     * One row written back as a stored leaf, or null when its field is not configured — such a row
     * drops out of the saved rule, and nothing about it is read. The value is written in its stored
     * shape under the operators the row offers (expression-value serialiseValueOut()), then the
     * leaf takes the frozen shape (toLeaf()).
     *
     * @param {Object|null|undefined} field The row's field descriptor.
     * @param {*} fieldType The row's field type.
     * @param {{
     *     operator: Function,
     *     value: Function,
     *     operators: Function,
     *     attribute: Function,
     *     storedNumber: (Number|null),
     *     isValueProcessed: *
     * }} row The row's state; `operators()` answers the operators it offers.
     * @returns {Object|null}
     */
    function rowLeaf(field, fieldType, row) {
        var operator;

        if (!field) {
            return null;
        }
        operator = row.operator();

        return toLeaf(field, fieldType, {
            operator: operator,
            value: expressionValue.serialiseValueOut(field, operator, row.value(), row.operators()),
            storedNumber: row.storedNumber,
            isValueProcessed: row.isValueProcessed
        }, row.attribute);
    }

    return {
        rowLeaf: rowLeaf,
        rowSeed: rowSeed,
        initialState: initialState,
        cloneOverrides: cloneOverrides,
        toLeaf: toLeaf
    };
});
