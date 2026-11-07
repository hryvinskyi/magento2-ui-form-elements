/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure shape of the structured preview — the authored rule stated as nested, joined tokens.
 *
 * The preview mirrors what is saved: a group with nothing to show collapses and its parent skips
 * it, exactly as the serialiser drops an empty group, and an entirely empty rule has no preview at
 * all (the consumer's empty-state message shows instead). Inside a group every child but the
 * first carries the joiner word of the group's aggregator; the template parenthesises every group
 * but the root.
 *
 * The words themselves — the joiners, the field, operator and value labels — are presentation and
 * arrive from the component; this module decides only the structure, which label each token takes
 * — the picked attribute's for the picker, the field's own otherwise; an option value's breadcrumb
 * path when the value follows the picked attribute, its option label otherwise — and how a value
 * is printed: a list as its labels in braces, a chosen option as its label, anything else quoted.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-fields'
], function (expressionFields) {
    'use strict';

    /**
     * How a single value is printed, by the row's value type. A value type not listed prints
     * quoted text.
     */
    var SINGLE_VALUE_PRINTERS = {
        /**
         * A select's value is one option: its label.
         *
         * @param {*} value
         * @param {Function} labelOf
         * @returns {String}
         */
        'select': function (value, labelOf) {
            return labelOf(value);
        },

        /**
         * An attribute's value is an option's label while the attribute has an option list, and an
         * unselected one — an options caption writes undefined — prints as the quoted empty value,
         * never as a label lookup. Without a list it is quoted text.
         *
         * @param {*} value
         * @param {Function} labelOf
         * @param {Function} hasOptions
         * @returns {String|null} null to fall back to quoted text.
         */
        'product-attribute': function (value, labelOf, hasOptions) {
            if (!hasOptions()) {
                return null;
            }

            return value === null || value === undefined || value === '' ? '""' : labelOf(value);
        }
    };

    /**
     * The preview of a group, or null when nothing in it renders.
     *
     * @param {Object} group Group node {aggregator, children}, condition children carrying the
     *     caller's payload.
     * @param {Function} describeCondition Answers a condition payload's preview node, or a falsy
     *     value to skip it.
     * @param {{all: String, any: String}} joiners The word joining an 'all' group's children and an
     *     'any' group's.
     * @param {Boolean} isRoot True for the outermost group.
     * @returns {{kind: String, root: Boolean, children: Array.<Object>}|null}
     */
    function previewGroup(group, describeCondition, joiners, isRoot) {
        var joiner = group.aggregator === 'any' ? joiners.any : joiners.all;
        var children = [];

        group.children.forEach(function (child) {
            var node = child.kind === 'group'
                ? previewGroup(child, describeCondition, joiners, false)
                : describeCondition(child.condition);

            if (node) {
                node.joiner = children.length > 0 ? joiner : '';
                children.push(node);
            }
        });

        if (children.length === 0) {
            return null;
        }

        return {kind: 'group', root: isRoot, children: children};
    }

    /**
     * A row's value as one preview string.
     *
     * @param {*} value The row's stored value.
     * @param {String} valueType The row's value type.
     * @param {Function} labelOf Answers one option value's label.
     * @param {Function} hasOptions Answers whether the row's attribute has a loaded option list;
     *     asked only for a value that follows the attribute.
     * @returns {String}
     */
    function valueText(value, valueType, labelOf, hasOptions) {
        var printed = null;

        if (Array.isArray(value)) {
            return '{' + value.map(function (item) {
                return labelOf(item);
            }).join(', ') + '}';
        }

        if (Object.prototype.hasOwnProperty.call(SINGLE_VALUE_PRINTERS, valueType)) {
            printed = SINGLE_VALUE_PRINTERS[valueType](value, labelOf, hasOptions);
        }

        return printed === null ? '"' + (value || '') + '"' : printed;
    }

    /**
     * The preview node of one condition row: field, operator and value as ready-to-print tokens.
     *
     * A row whose field is not configured prints a question mark as its field and nothing else,
     * and nothing about the row is read. The picker prints its picked attribute's label, every
     * other field its own. A value that follows the picked attribute prints each option through
     * its breadcrumb path — a hierarchical list (categories) reads by its ancestors, a flat one by
     * its label, an option-less one as the raw value — and every other value through the field's
     * option labels.
     *
     * @param {Object|null|undefined} field The row's field descriptor.
     * @param {{
     *     attributeLabel: Function,
     *     operatorLabel: Function,
     *     value: Function,
     *     pathLabel: Function,
     *     optionLabel: Function,
     *     hasOptions: Function
     * }} row The row's labels and value, asked in print order.
     * @returns {{kind: String, field: *, operator: *, value: String}}
     */
    function conditionNode(field, row) {
        var token;
        var operator;

        if (!field) {
            return {kind: 'condition', field: '?', operator: '', value: ''};
        }
        token = expressionFields.isPicker(field) ? row.attributeLabel() : field.label;
        operator = row.operatorLabel();

        return {
            kind: 'condition',
            field: token,
            operator: operator,
            value: valueText(
                row.value(),
                field.valueType,
                expressionFields.followsAttribute(field) ? row.pathLabel : row.optionLabel,
                row.hasOptions
            )
        };
    }

    return {
        conditionNode: conditionNode,
        previewGroup: previewGroup,
        valueText: valueText
    };
});
