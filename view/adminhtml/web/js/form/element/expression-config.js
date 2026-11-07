/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure reading of the expression builder's consumer configuration.
 *
 * Two sources reach the component: the `builderConfig` object a consumer's PHP publishes, and the
 * tunables a form's ui_component XML may override per field. Both can hold anything a human typed,
 * so this module turns each into a usable value — the documented default for an absent key, the
 * shipped value for a nonsense number or an unknown choice — and indexes the configured fields by
 * type. Nothing is translated here: every string the config carries is the consumer's own wording
 * and passes through untouched.
 *
 * Side-effect free and dependency-free, so the same file runs in the admin bundle and under plain
 * Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * How the joining of a group's children may be drawn: a tinted rail carrying the aggregator
     * word, the word as a chip between every two children, or the separator lines alone.
     */
    var JOINER_STYLES = Object.freeze(['rail', 'chip', 'none']);

    /**
     * The vertical rhythms the condition rows may take.
     */
    var DENSITIES = Object.freeze(['comfortable', 'compact']);

    /**
     * True for anything but a literal false: a flag that is on unless a form switches it off.
     *
     * @param {*} value Candidate value, from XML.
     * @returns {Boolean}
     */
    function enabledUnlessFalse(value) {
        return value !== false;
    }

    /**
     * A configured text as it is, or '' for anything that is not a string.
     *
     * @param {*} value Candidate value, from XML.
     * @returns {String}
     */
    function textOrEmpty(value) {
        return typeof value === 'string' ? value : '';
    }

    /**
     * One value coerced to a positive finite number, or the fallback when it is anything else.
     *
     * A tunable can be anything a human typed into XML: a non-numeric string, zero, a negative
     * number. Each would travel on as a NaN or a zero into a slice() bound, a timer delay or a
     * query-length threshold, which blanks a dropdown or stalls the type-ahead with no error
     * anywhere — so all of them degrade to the fallback instead.
     *
     * @param {*} value Candidate value, from config or XML.
     * @param {Number} fallback Value to use when the candidate is unusable.
     * @returns {Number}
     */
    function positiveNumber(value, fallback) {
        var number = Number(value);

        return isFinite(number) && number > 0 ? number : fallback;
    }

    /**
     * A configured store id as a non-negative integer.
     *
     * Deliberately not the positive-number guard: for a store id 0 is a meaningful value ("not
     * scoped to one store"), not a broken one. Anything unusable — absent, non-numeric, negative —
     * also reads as 0, which is what a counting endpoint falls back to anyway, so the component and
     * the endpoint agree on the scope even when the config is junk.
     *
     * @param {*} value Candidate store id, from config.
     * @returns {Number}
     */
    function storeId(value) {
        var number = Number(value);

        return isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }

    /**
     * One string tunable constrained to its known values, or the fallback for anything else — the
     * alternative is a modifier class no stylesheet defines, which renders as whichever treatment
     * happens to be the CSS default with no error anywhere.
     *
     * @param {*} value Candidate value, from XML.
     * @param {Array.<String>} allowed Values the tunable may take.
     * @param {*} fallback Value to use when the candidate is not allowed.
     * @returns {*}
     */
    function oneOf(value, allowed, fallback) {
        return allowed.indexOf(value) !== -1 ? value : fallback;
    }

    /**
     * The consumer's `builderConfig` with every documented key present.
     *
     * Absent keys take their documented meaning: no fields, no endpoint (so no suggestions, no lazy
     * option lists and no match count), no wording, no coherence rules, no shared operator sets.
     * `suggestMinQuery` is handed back raw: the server's own minimum outranks the component's
     * tunable only when it is usable, and the tunable is the component's to supply.
     *
     * @param {*} config The `builderConfig` the component received.
     * @returns {{
     *     fields: Array.<Object>,
     *     combineType: String,
     *     suggestUrl: String,
     *     emptyStateMessage: String,
     *     coherence: Object,
     *     countUrl: String,
     *     countLabel: String,
     *     countStoreId: Number,
     *     optionsUrl: String,
     *     operatorSets: Object,
     *     suggestMinQuery: *
     * }}
     */
    function readBuilderConfig(config) {
        return {
            fields: (config && config.fields) || [],
            combineType: (config && config.combineType) || '',
            suggestUrl: (config && config.suggestUrl) || '',
            emptyStateMessage: (config && config.emptyStateMessage) || '',
            coherence: (config && config.coherence) || {},
            countUrl: (config && config.countUrl) || '',
            countLabel: (config && config.countLabel) || '',
            countStoreId: storeId(config && config.countStoreId),
            optionsUrl: (config && config.optionsUrl) || '',
            operatorSets: (config && config.operatorSets) || {},
            suggestMinQuery: config && config.suggestMinQuery
        };
    }

    /**
     * The configured fields keyed by their `type`, a later field winning a repeated type.
     *
     * The map has no prototype, so a row or a stored condition whose type spells an
     * Object.prototype member resolves to no field rather than to a function.
     *
     * @param {Array.<Object>|Object} fields The configured fields; an object's values count.
     * @returns {Object.<String, Object>}
     */
    function indexFieldsByType(fields) {
        var byType = Object.create(null);
        var list = Array.isArray(fields)
            ? fields
            : (fields && typeof fields === 'object' ? Object.keys(fields).map(function (key) {
                return fields[key];
            }) : []);
        var i;

        for (i = 0; i < list.length; i++) {
            byType[list[i].type] = list[i];
        }

        return byType;
    }

    return {
        JOINER_STYLES: JOINER_STYLES,
        DENSITIES: DENSITIES,
        enabledUnlessFalse: enabledUnlessFalse,
        textOrEmpty: textOrEmpty,
        positiveNumber: positiveNumber,
        storeId: storeId,
        oneOf: oneOf,
        readBuilderConfig: readBuilderConfig,
        indexFieldsByType: indexFieldsByType
    };
});
