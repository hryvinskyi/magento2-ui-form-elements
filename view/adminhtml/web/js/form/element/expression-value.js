/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure model of the expression-builder's leaf values.
 *
 * The recursive tree structure (groups, paths, moves, slots, contradiction solving) lives in
 * expression-tree.js; this module owns the orthogonal concern of what sits inside a leaf: the
 * shapes a condition value takes between storage and editor (CSV string, array, scalar), the
 * parsing of a pasted list into candidate entries, and two open, data-driven registries the
 * component renders from:
 *
 * - **Value types** describe the scalar editors. Each entry is data, not code branches:
 *     - `attrs`        native input attributes the template binds verbatim ({type: 'date'}, …)
 *     - `validator`    optional name in the validator registry — the type's default advisory
 *                      validator, overridable per operator through an operator entry's `validate`
 *     - `editValue`    optional `(raw) -> String` transform, stored value → input display
 *                      (identity when absent)
 *     - `commitValue`  optional `(input) -> String` transform, input → stored value (identity
 *                      when absent)
 *   `scalarTypeFor()` resolves a descriptor to a type NAME, `valueTypeDef()` resolves a name to
 *   its definition (unknown names fall back to `text`, so a stale registration never blanks an
 *   editor), and `registerValueType()` lets a consumer add or deliberately re-skin a type from a
 *   RequireJS mixin without touching this module.
 *
 * - **Validators** are named `(value) -> Boolean` predicates an operator descriptor picks through
 *   its `validate` key (or a value type through its default `validator`). `registerValidator()`
 *   is the matching mixin seam.
 *
 * Everything is side-effect free and dependency-free — plain values in, plain values out — so the
 * same file runs in the admin bundle and under plain Node (`Test/Js/run.mjs`). No user-facing
 * text lives here: validator messages and placeholders are presentation and belong to the
 * component.
 */
define([], function () {
    'use strict';

    /**
     * Operators whose value is a list of alternatives rather than a single scalar.
     */
    var LIST_OPERATORS = ['()', '!()'];

    /**
     * Separators of a pasted list: comma, semicolon, tab and both newline flavours — the
     * characters a spreadsheet column, a CSV cell or a hand-typed enumeration arrives with. ONE
     * definition backs both the "is this text a list?" test and the split, so the two can never
     * disagree about what counts as a list. Deliberately not a global regex: a `lastIndex`
     * carried between `test()` calls would make the predicate answer differently for identical
     * input.
     */
    var LIST_SEPARATORS = /[,;\t\r\n]+/;

    /* ---------------- validator predicates ---------------- */

    /**
     * True when a value carries no input at all: null, undefined, or a string that is empty or
     * whitespace-only. The FORMAT validators (number, integer, float, email) pass blank input by
     * design — mirroring native HTML5 validation semantics, they judge the format of present
     * input only, and flagging emptiness is exclusively the `not-empty` validator's
     * responsibility.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isBlankInput(value) {
        return value === null || value === undefined
            || typeof value === 'string' && value.trim() === '';
    }

    /**
     * True when a value compiles as a JavaScript regular expression.
     *
     * @param {*} value Pattern candidate; non-strings are cast, null/undefined read as ''.
     * @returns {Boolean}
     */
    function isValidRegex(value) {
        try {
            // The function-call form compiles the pattern exactly like `new RegExp` would,
            // without keeping the object around.
            RegExp(String(value === null || value === undefined ? '' : value));

            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * True when a value reads as one finite number — or carries no input at all. A format
     * validator: blank input (see {@link isBlankInput}) passes untouched, present input must be a
     * finite number primitive or a string that parses to one. Arrays and other non-scalars fail.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isFiniteNumberValue(value) {
        if (isBlankInput(value)) {
            return true;
        }

        if (typeof value === 'number') {
            return isFinite(value);
        }

        if (typeof value !== 'string') {
            return false;
        }

        return isFinite(Number(value.trim()));
    }

    /**
     * True when a value reads as one whole number — or carries no input at all. A format
     * validator: blank input (see {@link isBlankInput}) passes untouched, present input must be
     * an integer number primitive or a string of digits with an optional leading sign. Decimal
     * points, exponent notation and arrays fail.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isIntegerValue(value) {
        if (isBlankInput(value)) {
            return true;
        }

        if (typeof value === 'number') {
            return isFinite(value) && Math.floor(value) === value;
        }

        if (typeof value !== 'string') {
            return false;
        }

        return /^[+-]?\d+$/.test(value.trim());
    }

    /**
     * True when a string value has the pragmatic shape of one email address — or carries no input
     * at all. A format validator: blank input (see {@link isBlankInput}) passes untouched;
     * present input must read as something before an `@`, a domain with at least one dot, and no
     * whitespace or second `@` anywhere. Deliberately a single regex — full RFC address grammar
     * buys nothing for an advisory editor hint. Only strings qualify as present input, and they
     * are checked untrimmed: a non-blank value with stray surrounding whitespace is flagged
     * rather than silently tolerated into an equality match.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isEmailValue(value) {
        if (isBlankInput(value)) {
            return true;
        }

        if (typeof value !== 'string') {
            return false;
        }

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    /**
     * True when a value carries anything: a non-empty array, or a scalar whose string form is not
     * blank. The number zero counts — it is a value.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isNonEmptyValue(value) {
        if (Array.isArray(value)) {
            return value.length > 0;
        }

        if (value === null || value === undefined) {
            return false;
        }

        return String(value).trim() !== '';
    }

    /* ---------------- validator registry ---------------- */

    /**
     * Named-strategy registry of the advisory value validators. The names are the component's
     * vocabulary and travel through consumer configs (an operator entry's `validate` key) and
     * value-type definitions (the `validator` default); each entry is a pure
     * `(value) -> Boolean` predicate — the messages shown for failures are presentation and live
     * in the component. Responsibilities are split like native HTML5 validation: the format
     * validators (`number`, `integer`, `float`, `email`, `regex`) judge present input only and
     * pass blank input, while flagging emptiness is exclusively `not-empty`'s job — so a pristine
     * editor never shows a format error. A null prototype keeps Object.prototype members from
     * masquerading as validators when a stale config names one that was never registered.
     */
    var validators = Object.create(null);

    validators['regex'] = isValidRegex;
    validators['number'] = isFiniteNumberValue;
    validators['integer'] = isIntegerValue;
    validators['float'] = isFiniteNumberValue;
    validators['email'] = isEmailValue;
    validators['not-empty'] = isNonEmptyValue;

    /**
     * Registers (or deliberately overwrites) a named validator predicate.
     *
     * Defensive by design — this is the consumer-facing mixin seam: a blank or non-string name,
     * or a predicate that is not a function, is silently ignored, so broken third-party input can
     * never clobber a built-in with something uncallable.
     *
     * @param {String} name Validator name, non-blank.
     * @param {Function} predicate Pure `(value) -> Boolean` check.
     * @returns {void}
     */
    function registerValidator(name, predicate) {
        if (typeof name !== 'string' || name.trim() === '') {
            return;
        }

        if (typeof predicate !== 'function') {
            return;
        }
        validators[name] = predicate;
    }

    /* ---------------- scalar value types ---------------- */

    /**
     * Display value for a native date input from a stored condition value — the `date` type's
     * editValue transform.
     *
     * Stored date conditions may carry a full `Y-m-d H:i:s` timestamp, but the native date input
     * only displays `Y-m-d`, so a date-shaped value truncates to its first ten characters. Values
     * not starting with a `Y-m-d` date pass through unchanged; null and undefined read as ''.
     * Display-only: nothing here writes back, so an untouched stored value survives verbatim.
     *
     * @param {*} raw Stored condition value.
     * @returns {String}
     */
    function dateInputValue(raw) {
        var value = raw === null || raw === undefined ? '' : String(raw);

        return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
    }

    /**
     * Registry of the scalar value types — every entry is pure data plus at most a tiny
     * transform, rendered by ONE generic editor in the component's template, so adding a type
     * never adds a template branch. See the module docblock for the entry contract. A null
     * prototype keeps lookups of unregistered names strictly `undefined`.
     */
    var valueTypes = Object.create(null);

    valueTypes['text'] = {attrs: {type: 'text'}, validator: null};
    valueTypes['integer'] = {attrs: {type: 'number', step: '1', inputmode: 'numeric'}, validator: 'integer'};
    valueTypes['float'] = {attrs: {type: 'number', step: 'any', inputmode: 'decimal'}, validator: 'float'};
    valueTypes['date'] = {attrs: {type: 'date'}, validator: null, editValue: dateInputValue};
    valueTypes['time'] = {attrs: {type: 'time'}, validator: null};
    valueTypes['email'] = {attrs: {type: 'email', inputmode: 'email'}, validator: 'email'};

    /**
     * Registers a named value type.
     *
     * Same defensive contract as {@link registerValidator}: a blank or non-string name, or a
     * definition without a plain `attrs` object, is silently ignored. Valid registration
     * overwrites — a consumer may deliberately re-skin a built-in type (say, give `date` a
     * different editor) from a RequireJS mixin.
     *
     * @param {String} name Value-type name, non-blank.
     * @param {Object} definition Entry per the module-docblock contract; `attrs` is mandatory.
     * @returns {void}
     */
    function registerValueType(name, definition) {
        if (typeof name !== 'string' || name.trim() === '') {
            return;
        }

        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            return;
        }

        if (!definition.attrs || typeof definition.attrs !== 'object' || Array.isArray(definition.attrs)) {
            return;
        }
        valueTypes[name] = definition;
    }

    /**
     * The definition registered under a value-type name, falling back to the `text` definition
     * for unknown (or absent) names — so a descriptor naming a type whose mixin did not load
     * still renders a usable free-text editor instead of a blank one.
     *
     * @param {(String|null)} name Value-type name.
     * @returns {Object} Value-type definition.
     */
    function valueTypeDef(name) {
        return (typeof name === 'string' && valueTypes[name]) || valueTypes['text'];
    }

    /**
     * Resolves an attribute descriptor to the name of its scalar value type — the single
     * resolution point for which editor a scalar context renders.
     *
     * Resolution order:
     *  1. an explicit `scalarType` key on the descriptor wins outright (unknown names are
     *     returned as-is — {@link valueTypeDef} falls back to `text` for them);
     *  2. the raw EAV frontend input maps directly: `date`/`datetime` → date, `int` → integer,
     *     `price`/`weight`/`decimal` → float;
     *  3. a `>=` entry in the descriptor's own operator set reads as float — a decimal- or
     *     int-backed attribute whose frontend input is plain text keeps reporting `text` while
     *     carrying the comparison operators, and date inputs never reach this step because the
     *     map already claimed them;
     *  4. everything else — including a missing descriptor — is plain text.
     *
     * @param {(Object|null)} descriptor Attribute or field descriptor
     *     ({scalarType, inputType, operators, …}) or null.
     * @returns {String} Value-type name.
     */
    function scalarTypeFor(descriptor) {
        var inputTypeMap = {
            'date': 'date',
            'datetime': 'date',
            'int': 'integer',
            'price': 'float',
            'weight': 'float',
            'decimal': 'float'
        };
        var operators;
        var i;

        if (!descriptor) {
            return 'text';
        }

        if (typeof descriptor.scalarType === 'string' && descriptor.scalarType !== '') {
            return descriptor.scalarType;
        }

        if (Object.prototype.hasOwnProperty.call(inputTypeMap, descriptor.inputType)) {
            return inputTypeMap[descriptor.inputType];
        }
        operators = descriptor.operators || [];

        for (i = 0; i < operators.length; i++) {
            if (operators[i] && operators[i].value === '>=') {
                return 'float';
            }
        }

        return 'text';
    }

    /* ---------------- value shapes ---------------- */

    /**
     * True when an operator's value is a list of alternatives rather than a single scalar.
     *
     * The membership operators are the one thing an editor has to know before it can decide
     * whether picking a value appends to a list or replaces the whole value — the same decision
     * the shaping helpers below already key on. Exposing the test keeps that single definition:
     * an editor re-spelling the operator literals would drift from the shaping rules the moment
     * the set changes.
     *
     * A consumer whose rule engine spells its membership operators differently (`in`, `not_in`,
     * `between`) marks them on the operator descriptor with `list: true`; passing the operator
     * list the row offers lets that flag count. Only a literal `true` does: the flag says what the
     * stored value is shaped like, so a truthy string must not turn a scalar into a list.
     *
     * @param {*} operator Operator value from a field's operator descriptor.
     * @param {Array} [operators] Operator descriptors ({value, label, list}) the row offers.
     * @returns {Boolean}
     */
    function isListOperator(operator, operators) {
        if (typeof operator !== 'string') {
            return false;
        }
        if (LIST_OPERATORS.indexOf(operator) !== -1) {
            return true;
        }
        if (!Array.isArray(operators)) {
            return false;
        }

        return operators.some(function (descriptor) {
            return descriptor !== null
                && typeof descriptor === 'object'
                && descriptor.value === operator
                && descriptor.list === true;
        });
    }

    /**
     * Normalises a stored condition value into the shape the value editor works with.
     *
     * List-shaped contexts (multiselect fields, `()`/`!()` operators) always get an array — CSV
     * strings split, arrays copy. Scalar contexts get a scalar — an array collapses to its first
     * element. With no field descriptor the value passes through untouched.
     *
     * @param {(Object|null)} field Field descriptor ({valueType, …}) or null.
     * @param {String} operator Current operator value.
     * @param {*} value Stored value: scalar, CSV string or array.
     * @param {Array} [operators] Operators the row offers; the field's own list when omitted.
     * @returns {*} Array for list-shaped contexts, scalar otherwise.
     */
    function normaliseValueIn(field, operator, value, operators) {
        var listShaped;

        if (!field) {
            return value;
        }
        listShaped = field.valueType === 'multiselect'
            || isListOperator(operator, operators === undefined ? field.operators : operators);

        if (listShaped) {
            if (Array.isArray(value)) {
                return value.slice();
            }

            if (value === '' || value === null || value === undefined) {
                return [];
            }

            return String(value).split(',');
        }

        if (Array.isArray(value)) {
            return value.length ? value[0] : '';
        }

        return value;
    }

    /**
     * Serialises an editor value into the string form the condition tree stores.
     *
     * List-shaped contexts (multiselect fields, `()`/`!()` operators) join arrays into a CSV
     * string; everything else casts to string, with null/undefined becoming ''.
     *
     * @param {Object} field Field descriptor ({valueType, …}).
     * @param {String} operator Current operator value.
     * @param {*} value Editor value: scalar or array.
     * @param {Array} [operators] Operators the row offers; the field's own list when omitted.
     * @returns {String}
     */
    function serialiseValueOut(field, operator, value, operators) {
        var listShaped = field.valueType === 'multiselect'
            || isListOperator(operator, operators === undefined ? field.operators : operators);

        if (listShaped && Array.isArray(value)) {
            return value.join(',');
        }

        return value === null || value === undefined ? '' : String(value);
    }

    /**
     * Reads any value as a list: arrays copy, ''/null/undefined become [], any other scalar splits
     * as a CSV string.
     *
     * @param {*} value
     * @returns {Array}
     */
    function asArray(value) {
        if (Array.isArray(value)) {
            return value.slice();
        }

        if (value === '' || value === null || value === undefined) {
            return [];
        }

        return String(value).split(',');
    }

    /* ---------------- pasted lists ---------------- */

    /**
     * True when text carries at least one list separator — a comma, semicolon, tab or newline.
     *
     * This is the decision point for whether a paste is one value or many: text without a
     * separator is a single value the browser should paste into the input untouched, text with one
     * is a list the editor turns into pills.
     *
     * @param {*} text Clipboard text; null and undefined read as ''.
     * @returns {Boolean}
     */
    function hasListSeparators(text) {
        return LIST_SEPARATORS.test(String(text === null || text === undefined ? '' : text));
    }

    /**
     * Splits pasted text into candidate list entries: separator runs break the text, every entry
     * is trimmed, and empties drop out — so a trailing separator, a blank spreadsheet row, a
     * `\r\n` pair or an indented column all yield clean entries rather than phantom blanks.
     *
     * Entries stay verbatim otherwise: no case folding, no de-duplication, no resolution against
     * any option list. What an entry MEANS is the caller's decision — the editor resolves entries
     * against its options (or takes them as free text) and de-duplicates while appending.
     *
     * @param {*} text Clipboard text; null and undefined read as ''.
     * @returns {Array.<String>} Trimmed, non-empty entries in pasted order.
     */
    function splitPasteText(text) {
        var parts = String(text === null || text === undefined ? '' : text).split(LIST_SEPARATORS);
        var entries = [];
        var entry;
        var i;

        for (i = 0; i < parts.length; i++) {
            entry = parts[i].trim();

            if (entry !== '') {
                entries.push(entry);
            }
        }

        return entries;
    }

    return {
        scalarTypeFor: scalarTypeFor,
        valueTypeDef: valueTypeDef,
        registerValueType: registerValueType,
        validators: validators,
        registerValidator: registerValidator,
        isListOperator: isListOperator,
        normaliseValueIn: normaliseValueIn,
        serialiseValueOut: serialiseValueOut,
        asArray: asArray,
        hasListSeparators: hasListSeparators,
        splitPasteText: splitPasteText
    };
});
