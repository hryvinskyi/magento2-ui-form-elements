/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure coherence rules of an authored expression: which fields a row may pick, and which parts of
 * a rule can never match or lack the context they need.
 *
 * A consumer may name one CONTEXT field (`coherence.contextAttribute`) and declare that some
 * fields only make sense under certain context values (`coherence.requirements`, keyed by a
 * field's type or attribute, each listing the context values it accepts). Two things follow:
 *
 * - a field with a requirement is offered to a row only when the row's conjunctive scope — the
 *   conditions guaranteed whenever the row is relevant — holds a context condition naming one of
 *   the accepted values, so an OR-joined branch never borrows another branch's context row;
 * - a rule is reported when one of its AND-groups jointly demands context values that cannot hold
 *   together (`coherence.contradictionWarning`), and when a row with a requirement has no
 *   satisfying context in its scope (the requirement's `warning`).
 *
 * Every warning text is the consumer's own, already translated; this module only decides which
 * ones apply and to which group. The structural questions — scope, closure, group enumeration,
 * satisfiability — are expression-tree.js's.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-tree',
    'Hryvinskyi_UiFormElements/js/form/element/expression-value',
    'Hryvinskyi_UiFormElements/js/form/element/expression-fields'
], function (expressionTree, expressionValue, expressionFields) {
    'use strict';

    /**
     * How a context condition names the values it targets, by operator: equality names one value,
     * membership names a list. A context condition under any other operator targets nothing.
     */
    var TARGETED_VALUES = {
        '==': function (value) {
            return [value];
        },
        '()': function (value) {
            return expressionValue.asArray(value);
        }
    };

    /**
     * The field type of the configured context field, or null when no context attribute is
     * configured or no field carries it — which turns every coherence rule off.
     *
     * @param {Array.<Object>|Object} fields The configured fields.
     * @param {Object} coherence The consumer's coherence config.
     * @returns {*}
     */
    function contextFieldType(fields, coherence) {
        var attribute = coherence.contextAttribute;
        var field;

        if (!attribute) {
            return null;
        }
        field = expressionFields.entriesOf(fields).filter(function (candidate) {
            return candidate.attribute === attribute;
        })[0];

        return field ? field.type : null;
    }

    /**
     * True when a scope holds a context condition targeting one of the accepted values —
     * `context == value` or `context is one of {…, value, …}`.
     *
     * @param {Array.<{condition: Object}>} scope Condition nodes of a conjunctive scope.
     * @param {Array} contextValues Accepted context values.
     * @param {*} contextType Field type of the context field; null satisfies nothing.
     * @returns {Boolean}
     */
    function scopeSatisfies(scope, contextValues, contextType) {
        var targets = Object.create(null);
        var i;

        if (!contextType) {
            return false;
        }

        for (i = 0; i < contextValues.length; i++) {
            targets[contextValues[i]] = true;
        }

        return scope.some(function (node) {
            var condition = node.condition;

            if (condition.fieldType !== contextType
                || !Object.prototype.hasOwnProperty.call(TARGETED_VALUES, condition.operator)) {
                return false;
            }

            return TARGETED_VALUES[condition.operator](condition.value).some(function (value) {
                return targets[String(value)] === true;
            });
        });
    }

    /**
     * The key a field's requirement is declared under — its type, then its attribute — or null when
     * it has none. Both lookups are own-property tested, so a field typed or keyed like an
     * Object.prototype member (`constructor`, `toString`) is never read as carrying a requirement
     * the consumer did not declare.
     *
     * @param {Object} requirements
     * @param {Object} field
     * @returns {String|null}
     */
    function requirementKeyOf(requirements, field) {
        var declared = function (key) {
            return Object.prototype.hasOwnProperty.call(requirements, key) && !!requirements[key];
        };

        if (declared(field.type)) {
            return field.type;
        }

        return declared(field.attribute) ? field.attribute : null;
    }

    /**
     * The requirement a field is subject to — looked up by its type, then by its attribute — or
     * undefined.
     *
     * @param {Object} requirements
     * @param {Object} field
     * @returns {Object|undefined}
     */
    function requirementOf(requirements, field) {
        var key = requirementKeyOf(requirements, field);

        return key === null ? undefined : requirements[key];
    }

    /**
     * The fields a row may pick.
     *
     * A field without a requirement is always offered, and so is the row's current field, so an
     * existing row stays editable whatever its scope says. Any other field is offered only when
     * the row's scope satisfies its requirement; a row outside the tree has no scope and is offered
     * none of them.
     *
     * @param {Array.<Object>} fields The configured fields.
     * @param {Object} coherence The consumer's coherence config.
     * @param {Array.<Object>|null} scope The row's conjunctive scope, or null.
     * @param {*} currentFieldType The row's current field type.
     * @returns {Array.<Object>}
     */
    function availableFields(fields, coherence, scope, currentFieldType) {
        var requirements = coherence.requirements || {};
        var contextType = contextFieldType(fields, coherence);

        return expressionFields.entriesOf(fields).filter(function (field) {
            var requirement = requirementOf(requirements, field);

            if (!requirement || currentFieldType === field.type) {
                return true;
            }

            return scope !== null && scopeSatisfies(scope, requirement.contexts || [], contextType);
        });
    }

    /**
     * The aggregator of the group holding the group at `path`.
     *
     * @param {Object} model Root group.
     * @param {Array.<Number>} path Non-empty path of a group.
     * @returns {String}
     */
    function parentAggregatorAt(model, path) {
        var current = model;
        var i;

        for (i = 0; i < path.length - 1; i++) {
            current = current.children[path[i]];
        }

        return current.aggregator;
    }

    /**
     * The context field's operator/value pairs among a closure's conditions.
     *
     * @param {Array.<{condition: Object}>} closure
     * @param {*} contextType
     * @returns {Array.<{operator: *, value: *}>}
     */
    function contextConditionsIn(closure, contextType) {
        return closure.filter(function (node) {
            return node.condition.fieldType === contextType;
        }).map(function (node) {
            return {operator: node.condition.operator, value: node.condition.value};
        });
    }

    /**
     * Contradiction reports: one per AND-group whose conjunctive closure demands context values
     * that cannot hold together, reported at the topmost group jointly guaranteeing it — a group
     * whose parent is also an AND-group hands the report up, because its closure is part of the
     * parent's.
     *
     * @param {Object} model Root group.
     * @param {Array.<Object>} groups groupsWithPaths() of the model.
     * @param {*} contextType
     * @returns {Array.<Object>} The reporting groups' entries.
     */
    function contradictingGroups(model, groups, contextType) {
        return groups.filter(function (entry) {
            var rows;

            if (entry.group.aggregator !== 'all') {
                return false;
            }

            if (entry.path.length > 0 && parentAggregatorAt(model, entry.path) === 'all') {
                return false;
            }
            rows = contextConditionsIn(expressionTree.conjunctiveClosure(entry.group), contextType);

            return rows.length >= 2 && expressionTree.solveContradictions(rows);
        });
    }

    /**
     * Missing-context reports: a row whose field has a requirement with a warning, and whose own
     * scope satisfies none of its context values. Each group's direct rows are checked with their
     * own scope, at most once per requirement key per group; a requirement without warning text
     * gates the field list but reports nothing.
     *
     * @param {Object} model Root group.
     * @param {Object} entry One groupsWithPaths() entry.
     * @param {Object.<String, Object>} fieldsByType
     * @param {Object} requirements
     * @param {*} contextType
     * @returns {Array.<String>} The warnings, in row order.
     */
    function missingContextWarnings(model, entry, fieldsByType, requirements, contextType) {
        var warned = Object.create(null);
        var warnings = [];

        entry.group.children.forEach(function (child, index) {
            var field;
            var key;
            var requirement;

            if (child.kind !== 'condition') {
                return;
            }
            field = fieldsByType[child.condition.fieldType];

            if (!field) {
                return;
            }
            key = requirementKeyOf(requirements, field);

            if (key === null || warned[key] === true) {
                return;
            }
            requirement = requirements[key];

            if (!requirement.warning || !requirement.contexts || !requirement.contexts.length) {
                return;
            }

            if (!scopeSatisfies(
                expressionTree.conjunctiveScope(model, entry.path.concat([index])),
                requirement.contexts,
                contextType
            )) {
                warnings.push(requirement.warning);
                warned[key] = true;
            }
        });

        return warnings;
    }

    /**
     * Everything wrong with a rule, contradictions first, then missing context, each in
     * depth-first group order.
     *
     * Each warning names its group by depth-first number when the rule has more than one group to
     * point at, and by null otherwise; how a group number is worded is presentation. No context
     * field configured means no warnings at all — and the rule is not even asked for, since
     * building it means reading every row.
     *
     * @param {Function} modelOf Answers the root group, whose conditions carry
     *     {fieldType, operator, value}.
     * @param {Array.<Object>} fields The configured fields.
     * @param {Object.<String, Object>} fieldsByType The configured fields by type.
     * @param {Object} coherence The consumer's coherence config.
     * @returns {Array.<{group: (Number|null), text: String}>}
     */
    function ruleWarnings(modelOf, fields, fieldsByType, coherence) {
        var contextType = contextFieldType(fields, coherence);
        var requirements = coherence.requirements || {};
        var model;
        var groups;
        var warnings = [];

        if (!contextType) {
            return warnings;
        }
        model = modelOf();
        groups = expressionTree.groupsWithPaths(model);

        /**
         * @param {Object} entry
         * @param {String} text
         * @returns {void}
         */
        function report(entry, text) {
            warnings.push({group: groups.length > 1 ? entry.number : null, text: text});
        }

        if (coherence.contradictionWarning) {
            contradictingGroups(model, groups, contextType).forEach(function (entry) {
                report(entry, coherence.contradictionWarning);
            });
        }
        groups.forEach(function (entry) {
            missingContextWarnings(model, entry, fieldsByType, requirements, contextType).forEach(function (text) {
                report(entry, text);
            });
        });

        return warnings;
    }

    return {
        contextFieldType: contextFieldType,
        scopeSatisfies: scopeSatisfies,
        availableFields: availableFields,
        ruleWarnings: ruleWarnings
    };
});
