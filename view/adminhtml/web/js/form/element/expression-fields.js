/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure answers to what a field descriptor says about a condition row.
 *
 * A consumer describes every field a rule can test — its type, value type, operators, options,
 * attributes, unit, placeholder — and the product-attribute picker field additionally carries one
 * descriptor per catalogue attribute, which can narrow the operators, carry its own option list
 * and its own unit. This module reads those descriptors: which attribute a picker row has chosen,
 * which operators a row offers, what a fresh row starts on and what it carries over when its field
 * or attribute changes, where the row's options come from, and which single-select its value
 * editor is — the plain `<select>` for a list short enough to scan, the searchable combobox above
 * the configured threshold. It reads, never writes, and holds no wording: every label in a
 * descriptor is the consumer's.
 *
 * `product_attribute_picker` is the component's own vocabulary — the one field type whose rows
 * pick a catalogue attribute first — and it is named here once.
 *
 * Where the answer depends on the picker row's chosen attribute and only sometimes needs it, the
 * attribute's descriptor arrives through a function, so a row that never needs it never reads it;
 * the row's own facts arrive the same way, through a probe asked only as far as the rule needs.
 *
 * Side-effect free and dependency-free, so the same file runs in the admin bundle and under plain
 * Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * Field type of the built-in attribute picker.
     */
    var PRODUCT_ATTRIBUTE_PICKER = 'product_attribute_picker';

    /**
     * Value type of a field whose value editor follows the picked attribute.
     */
    var ATTRIBUTE_VALUE_TYPE = 'product-attribute';

    /**
     * The entries of a descriptor list: an array as it is, an object's own values, anything else
     * as none. A PHP array with gaps in its keys arrives as a JSON object.
     *
     * @param {*} list
     * @returns {Array}
     */
    function entriesOf(list) {
        if (Array.isArray(list)) {
            return list;
        }

        return list && typeof list === 'object'
            ? Object.keys(list).map(function (key) {
                return list[key];
            })
            : [];
    }

    /**
     * The first entry whose `value` is exactly the given one, or null. An entry without a `value`
     * key never matches, not even an undefined value.
     *
     * @param {*} list Descriptor list.
     * @param {*} value Value to find.
     * @returns {Object|null}
     */
    function entryWithValue(list, value) {
        var entries = entriesOf(list);
        var i;

        for (i = 0; i < entries.length; i++) {
            if (entries[i] !== null && typeof entries[i] === 'object'
                && 'value' in entries[i] && entries[i].value === value) {
                return entries[i];
            }
        }

        return null;
    }

    /**
     * True for the attribute picker field.
     *
     * @param {Object|null} field
     * @returns {Boolean}
     */
    function isPicker(field) {
        return !!field && field.type === PRODUCT_ATTRIBUTE_PICKER;
    }

    /**
     * The picked attribute's descriptor on a picker field, or null on any other field and for a
     * code no descriptor carries.
     *
     * @param {Object|null} field
     * @param {*} attributeCode The row's picked attribute code.
     * @returns {Object|null}
     */
    function attributeInfo(field, attributeCode) {
        if (!isPicker(field)) {
            return null;
        }

        return entryWithValue(field.attributes || [], attributeCode);
    }

    /**
     * The picked attribute's descriptor on a picker row, or null on any other row and for a code
     * no descriptor carries. The picked code is read only on a picker row, so no other row depends
     * on it.
     *
     * @param {Object|null|undefined} field The row's field descriptor.
     * @param {Function} codeOf Answers the row's picked attribute code.
     * @returns {Object|null}
     */
    function pickedAttribute(field, codeOf) {
        return isPicker(field) ? attributeInfo(field, codeOf()) : null;
    }

    /**
     * The operators a row offers.
     *
     * A picker row's attribute can narrow the field's list: explicitly, with an `operators` array
     * pinned on the descriptor, or by naming one of the shared sets the config published once
     * (`operatorSet`). The set name is own-property tested, so a name that spells an
     * Object.prototype member resolves to nothing. Every other row, and a picker row whose
     * attribute narrows nothing, offers the field's own operators.
     *
     * @param {Object|null} field
     * @param {Object|null} attribute The picked attribute's descriptor, for a picker row.
     * @param {Object} operatorSets Shared operator sets by name.
     * @returns {Array.<Object>}
     */
    function operatorsFor(field, attribute, operatorSets) {
        var named;

        if (!field) {
            return [];
        }

        if (isPicker(field)) {
            if (attribute && Array.isArray(attribute.operators) && attribute.operators.length) {
                return attribute.operators;
            }
            named = attribute && typeof attribute.operatorSet === 'string'
                && Object.prototype.hasOwnProperty.call(operatorSets, attribute.operatorSet)
                ? operatorSets[attribute.operatorSet]
                : null;

            if (Array.isArray(named) && named.length) {
                return named;
            }
        }

        return field.operators || [];
    }

    /**
     * The operator descriptor with this value, or null.
     *
     * @param {Array.<Object>} operators
     * @param {*} operator
     * @returns {Object|null}
     */
    function operatorEntry(operators, operator) {
        return entryWithValue(operators, operator);
    }

    /**
     * The label of the operator with this value, or the value itself when no descriptor carries it.
     *
     * @param {Array.<Object>} operators
     * @param {*} operator
     * @returns {*}
     */
    function operatorLabel(operators, operator) {
        var entry = entryWithValue(operators, operator);

        return entry ? entry.label : operator;
    }

    /**
     * The label of the picked attribute, or its code when no descriptor carries it.
     *
     * @param {Array.<Object>} attributes The field's attribute descriptors.
     * @param {*} attributeCode
     * @returns {*}
     */
    function attributeLabel(attributes, attributeCode) {
        var entry = entryWithValue(attributes, attributeCode);

        return entry ? entry.label : attributeCode;
    }

    /**
     * The label of the option carrying this value (compared as a string), or the value itself.
     *
     * @param {Array.<Object>} options
     * @param {*} value
     * @returns {*}
     */
    function optionLabel(options, value) {
        var entry = entryWithValue(options, String(value));

        return entry ? entry.label : value;
    }

    /**
     * The operator a row starts on, or switches to when its current one stops being offered: the
     * first one offered, or equality when none is.
     *
     * @param {Array.<Object>} operators
     * @returns {*}
     */
    function defaultOperator(operators) {
        return operators.length ? operators[0].value : '==';
    }

    /**
     * True when the operators include one with this value.
     *
     * @param {Array.<Object>} operators
     * @param {*} operator
     * @returns {Boolean}
     */
    function offersOperator(operators, operator) {
        return entriesOf(operators).some(function (entry) {
            return entry.value === operator;
        });
    }

    /**
     * The attribute a picker row starts on: the field's first, or none.
     *
     * @param {Object|null} field
     * @returns {*}
     */
    function defaultAttribute(field) {
        return field && field.attributes && field.attributes.length ? field.attributes[0].value : '';
    }

    /**
     * The value a fresh row on this field starts with: an empty list for a multiselect, the first
     * option of a select, and empty text otherwise.
     *
     * @param {Object|null} field
     * @returns {*}
     */
    function defaultValue(field) {
        if (!field) {
            return '';
        }

        if (field.valueType === 'multiselect') {
            return [];
        }

        if (field.valueType === 'select' && field.options && field.options.length) {
            return field.options[0].value;
        }

        return '';
    }

    /**
     * The field's value type, `text` for a row with no configured field.
     *
     * @param {Object|null} field
     * @returns {String}
     */
    function valueType(field) {
        return field ? field.valueType : 'text';
    }

    /**
     * True when the field's value editor follows the picked attribute.
     *
     * @param {Object|null} field
     * @returns {Boolean}
     */
    function followsAttribute(field) {
        return !!field && field.valueType === ATTRIBUTE_VALUE_TYPE;
    }

    /**
     * The field's own option list.
     *
     * @param {Object|null} field
     * @returns {Array.<Object>}
     */
    function valueOptions(field) {
        return field ? (field.options || []) : [];
    }

    /**
     * The picker field's attribute descriptors.
     *
     * @param {Object|null} field
     * @returns {Array.<Object>}
     */
    function attributes(field) {
        return field ? (field.attributes || []) : [];
    }

    /**
     * The field's own placeholder — consumer wording — or ''.
     *
     * @param {Object|null} field
     * @returns {String}
     */
    function placeholder(field) {
        return field && field.placeholder ? field.placeholder : '';
    }

    /**
     * The unit a row's value is entered in, or '' when none is declared.
     *
     * A row whose value follows the picked attribute takes the attribute's unit — only the
     * attribute knows whether its number is a price or a weight; every other row takes its field's.
     * The text is a code from the consumer (a currency, a weight unit) and is not translated.
     *
     * @param {Object|null} field
     * @param {Function} attributeOf Answers the picked attribute's descriptor, or null.
     * @returns {String}
     */
    function unit(field, attributeOf) {
        var descriptor;

        if (!field) {
            return '';
        }
        descriptor = followsAttribute(field) ? attributeOf() : field;

        return descriptor && descriptor.unit ? String(descriptor.unit) : '';
    }

    /**
     * The descriptor owning a row's active option list: the picked attribute's when the value
     * follows the attribute, the field's own otherwise, null without a field.
     *
     * @param {Object|null} field
     * @param {Function} attributeOf Answers the picked attribute's descriptor, or null.
     * @returns {Object|null}
     */
    function optionsHost(field, attributeOf) {
        if (!field) {
            return null;
        }

        return followsAttribute(field) ? attributeOf() : field;
    }

    /**
     * True when a descriptor's option list is a hierarchy: its entries carry a `level`. Read off
     * the first entry, because the option providers annotate all entries or none.
     *
     * @param {Object|null} host Descriptor with an `options` list.
     * @returns {Boolean}
     */
    function hasHierarchy(host) {
        var options = host && host.options || [];

        return options.length > 0 && options[0].level !== undefined;
    }

    /**
     * How many options a descriptor holds.
     *
     * @param {Object|null} host
     * @returns {Number}
     */
    function optionCount(host) {
        return host && host.options ? host.options.length : 0;
    }

    /**
     * The descriptor a row's scalar value type is resolved from: the picked attribute's when the
     * value follows the attribute, the field's own otherwise.
     *
     * @param {Object|null} field
     * @param {Function} attributeOf Answers the picked attribute's descriptor, or null.
     * @returns {Object|null}
     */
    function scalarDescriptor(field, attributeOf) {
        return followsAttribute(field) ? attributeOf() : (field || null);
    }

    /**
     * True when the picked attribute's option list has landed and holds something — the row then
     * edits its value through an option picker. A descriptor that only declares a list
     * (`hasOptions`) has none yet.
     *
     * @param {Object|null} attribute The picked attribute's descriptor.
     * @returns {Boolean}
     */
    function hasLoadedOptions(attribute) {
        return !!(attribute && attribute.options && attribute.options.length);
    }

    /**
     * True when the backend suggests values for the picked attribute as the admin types.
     *
     * @param {Object|null} attribute The picked attribute's descriptor.
     * @returns {Boolean}
     */
    function supportsSuggest(attribute) {
        return !!(attribute && attribute.suggest);
    }

    /**
     * The field a fresh row starts on: the first configured one, or none.
     *
     * @param {Array.<Object>} fields The configured fields.
     * @returns {Object|null}
     */
    function defaultField(fields) {
        return fields.length > 0 ? fields[0] : null;
    }

    /**
     * The field type a row without a field of its own carries: the first configured field's, or
     * undefined when none is configured.
     *
     * @param {Array.<Object>|Object} fields The configured fields.
     * @returns {*}
     */
    function defaultFieldType(fields) {
        return fields[0] ? fields[0].type : undefined;
    }

    /**
     * What a row switched onto another field starts with — the field's first operator, its fresh
     * value and its first attribute — or null for a field that is not configured, which leaves the
     * rest of the row as it was.
     *
     * @param {Object|null|undefined} field
     * @returns {{operator: *, value: *, productAttribute: *}|null}
     */
    function fieldSwitchState(field) {
        if (!field) {
            return null;
        }

        return {
            operator: defaultOperator(field.operators || []),
            value: defaultValue(field),
            productAttribute: defaultAttribute(field)
        };
    }

    /**
     * What a picker row switched onto another attribute carries on: its operator while the new
     * attribute still offers it, the first offered one otherwise, and a value restarted in the new
     * editor's shape — an empty list for an attribute with an option list, empty text otherwise —
     * since a value of the previous attribute means nothing for this one.
     *
     * @param {Array.<Object>} operators The operators the row offers under the new attribute.
     * @param {*} currentOperator The row's operator before the switch.
     * @param {Boolean} hasOptions The new attribute has a loaded option list.
     * @returns {{operator: *, value: (Array|String)}}
     */
    function attributeSwitchState(operators, currentOperator, hasOptions) {
        return {
            operator: offersOperator(operators, currentOperator) ? currentOperator : defaultOperator(operators),
            value: hasOptions ? [] : ''
        };
    }

    /**
     * True when an option list is longer than the threshold a native `<select>` stays usable
     * under; anything but a list counts as none.
     *
     * @param {*} options
     * @param {Number} threshold Longest list the plain select still renders.
     * @returns {Boolean}
     */
    function isLargeOptionList(options, threshold) {
        return (Array.isArray(options) ? options.length : 0) > threshold;
    }

    /**
     * True when a row's value is one option out of its `select` field's list, as opposed to the
     * membership operators, which take several.
     *
     * @param {{valueType: Function, usesListOperator: Function}} probe
     * @returns {Boolean}
     */
    function picksOneFieldOption(probe) {
        return probe.valueType() === 'select' && !probe.usesListOperator();
    }

    /**
     * True when a row's value is one option out of the picked attribute's loaded list — the
     * picker-side counterpart of picksOneFieldOption().
     *
     * @param {{valueType: Function, hasOptions: Function, usesListOperator: Function}} probe
     * @returns {Boolean}
     */
    function picksOneAttributeOption(probe) {
        return probe.valueType() === ATTRIBUTE_VALUE_TYPE && probe.hasOptions() && !probe.usesListOperator();
    }

    /**
     * Which single-select a row picking one option renders: the plain `<select>` while its list is
     * short enough to scan — one keystroke opens it and the browser owns its keyboard — and the
     * searchable combobox once the list passes the threshold; null for a row that picks no single
     * option, whose list is then never read.
     *
     * @param {{picksOne: Function, options: Function}} probe
     * @param {Number} threshold Longest list the plain select still renders.
     * @returns {('plain'|'searchable'|null)}
     */
    function singleSelectEditor(probe, threshold) {
        if (!probe.picksOne()) {
            return null;
        }

        return isLargeOptionList(probe.options(), threshold) ? 'searchable' : 'plain';
    }

    /**
     * The breadcrumb index a search over a row's options runs through: the index of a hierarchy,
     * built only then, and none for a flat list, which is searched by label.
     *
     * @param {Object|null} host Descriptor owning the row's active option list.
     * @param {Function} indexOf Answers the list's index.
     * @returns {Object|null}
     */
    function hierarchyIndex(host, indexOf) {
        return hasHierarchy(host) ? indexOf() : null;
    }

    return {
        PRODUCT_ATTRIBUTE_PICKER: PRODUCT_ATTRIBUTE_PICKER,
        ATTRIBUTE_VALUE_TYPE: ATTRIBUTE_VALUE_TYPE,
        hasLoadedOptions: hasLoadedOptions,
        supportsSuggest: supportsSuggest,
        defaultField: defaultField,
        defaultFieldType: defaultFieldType,
        fieldSwitchState: fieldSwitchState,
        attributeSwitchState: attributeSwitchState,
        isLargeOptionList: isLargeOptionList,
        picksOneFieldOption: picksOneFieldOption,
        picksOneAttributeOption: picksOneAttributeOption,
        singleSelectEditor: singleSelectEditor,
        hierarchyIndex: hierarchyIndex,
        entriesOf: entriesOf,
        isPicker: isPicker,
        attributeInfo: attributeInfo,
        pickedAttribute: pickedAttribute,
        operatorsFor: operatorsFor,
        operatorEntry: operatorEntry,
        operatorLabel: operatorLabel,
        attributeLabel: attributeLabel,
        optionLabel: optionLabel,
        defaultOperator: defaultOperator,
        offersOperator: offersOperator,
        defaultAttribute: defaultAttribute,
        defaultValue: defaultValue,
        valueType: valueType,
        followsAttribute: followsAttribute,
        valueOptions: valueOptions,
        attributes: attributes,
        placeholder: placeholder,
        unit: unit,
        optionsHost: optionsHost,
        hasHierarchy: hasHierarchy,
        optionCount: optionCount,
        scalarDescriptor: scalarDescriptor
    };
});
