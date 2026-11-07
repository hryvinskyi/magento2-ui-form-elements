/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure editing of a list-valued condition — the values a multi-value editor shows as pills.
 *
 * Values join the list one by one (a picked option, a typed value) or many at once (a pasted
 * spreadsheet column), always de-duplicated and stored as strings, the shape the option pickers
 * write. A paste is resolved first: against the row's option list — an option's value verbatim, or
 * its label case-insensitively — when the editor has one, or taken verbatim when it does not. A
 * long list shows its first pills and collapses the rest behind a toggle, and folds back once it
 * fits again; a list of two or more values can be cleared in one action; typed text joins the
 * list trimmed; and what a list already holds is never offered again.
 *
 * Every lookup map here has no prototype, so a value that spells an Object.prototype member — a
 * SKU named `constructor`, say — is a value like any other: it is not "already selected", and a
 * pasted `toString` does not resolve to a function.
 *
 * Splitting pasted text into entries is expression-value.js's, which this module asks; reading an
 * option's bare label is expression-options.js's.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-options',
    'Hryvinskyi_UiFormElements/js/form/element/expression-value'
], function (expressionOptions, expressionValue) {
    'use strict';

    /**
     * Fewest stored values the clear-all control is offered for: below it, the one remove button
     * per pill is already one click.
     */
    var CLEAR_ALL_MINIMUM = 2;

    /**
     * The paste mode that resolves entries against the row's option list; any other mode takes
     * them as typed.
     */
    var PASTE_RESOLVES_OPTIONS = 'options';

    /**
     * The list with new values appended, each stored as a string, skipping values already in the
     * list and repeats within the batch — so pasting a list with repeats behaves exactly like
     * clicking the same option twice. One result for the whole batch, so the caller writes once.
     *
     * @param {Array} current The stored list.
     * @param {Array} values Values to append, in order.
     * @returns {{values: Array.<String>, added: Number}} The new list and how many joined it — the
     *     basis for reporting what a paste did, since de-duplication can swallow entries.
     */
    function appendValues(current, values) {
        var next = current.slice();
        var seen = Object.create(null);
        var added = 0;
        var i;
        var value;

        for (i = 0; i < next.length; i++) {
            seen[String(next[i])] = true;
        }

        for (i = 0; i < values.length; i++) {
            value = String(values[i]);

            if (seen[value] !== true) {
                seen[value] = true;
                next.push(value);
                added++;
            }
        }

        return {values: next, added: added};
    }

    /**
     * The list without one value, compared as strings.
     *
     * @param {Array} current The stored list.
     * @param {*} value Value to remove.
     * @returns {Array}
     */
    function removeValue(current, value) {
        var target = String(value);

        return current.filter(function (stored) {
            return String(stored) !== target;
        });
    }

    /**
     * True when a stored value holds an option value: a list by membership, a single value by
     * equality, everything compared as a string.
     *
     * @param {*} stored The row's stored value.
     * @param {*} optionValue
     * @returns {Boolean}
     */
    function holds(stored, optionValue) {
        var target = String(optionValue);

        if (Array.isArray(stored)) {
            return stored.some(function (value) {
                return String(value) === target;
            });
        }

        return String(stored === null || stored === undefined ? '' : stored) === target;
    }

    /**
     * The pills a list renders: all of them while expanded or while the list fits the limit, the
     * first `limit` otherwise. It only slices, so it serves option objects and raw values alike.
     *
     * @param {*} pills Every pill the editor would render, in order; anything but an array is none.
     * @param {Boolean} expanded True while the admin has the whole list open.
     * @param {Number} limit Pills shown before the rest collapse.
     * @returns {Array}
     */
    function visiblePills(pills, expanded, limit) {
        var list = Array.isArray(pills) ? pills : [];

        if (expanded || list.length <= limit) {
            return list;
        }

        return list.slice(0, limit);
    }

    /**
     * How many pills a collapsed list hides; 0 when the list fits and needs no toggle.
     *
     * @param {*} pills Every pill the editor would render.
     * @param {Number} limit
     * @returns {Number}
     */
    function hiddenPillCount(pills, limit) {
        var total = Array.isArray(pills) ? pills.length : 0;

        return total > limit ? total - limit : 0;
    }

    /**
     * The value-and-label lookup a pasted list resolves through.
     *
     * Every option's value resolves to itself; its label resolves to its value lower-cased, once
     * as given and once without a leading depth prefix, so pasted category names resolve. The
     * first option wins per key, so a label repeated under different parents resolves to the first
     * option carrying it. Built once per paste and never cached, so it cannot outlive a list that
     * changed.
     *
     * @param {Array.<{value: *, label: *}>} options The editor's option list.
     * @returns {{byValue: Object.<String, String>, byLabel: Object.<String, String>}}
     */
    function pasteLookup(options) {
        var byValue = Object.create(null);
        var byLabel = Object.create(null);
        var list = Array.isArray(options) ? options : [];

        list.forEach(function (option) {
            var value = String(option.value);
            var label = String(option.label === null || option.label === undefined ? '' : option.label);
            var stripped = expressionOptions.displayLabel(label).toLowerCase();

            if (byValue[value] === undefined) {
                byValue[value] = value;
            }

            if (label !== '' && byLabel[label.toLowerCase()] === undefined) {
                byLabel[label.toLowerCase()] = value;
            }

            if (stripped !== '' && byLabel[stripped] === undefined) {
                byLabel[stripped] = value;
            }
        });

        return {byValue: byValue, byLabel: byLabel};
    }

    /**
     * Pasted entries as the values to append: resolved through the lookup when there is one —
     * entries that resolve to no option are skipped and counted, rather than stored as values that
     * would silently match nothing — or taken verbatim when there is none, since a free-text list
     * has nothing to check against and refusing unknown SKUs would defeat the paste.
     *
     * @param {Array.<String>} entries Trimmed pasted entries.
     * @param {{byValue: Object, byLabel: Object}|null} lookup From pasteLookup(), or null.
     * @returns {{values: Array.<String>, skipped: Number}}
     */
    function resolvePaste(entries, lookup) {
        var values = [];
        var skipped = 0;

        entries.forEach(function (entry) {
            var key = String(entry);
            var value = key;

            if (lookup) {
                value = lookup.byValue[key] !== undefined ? lookup.byValue[key] : lookup.byLabel[key.toLowerCase()];
            }

            if (value === undefined) {
                skipped++;

                return;
            }
            values.push(value);
        });

        return {values: values, skipped: skipped};
    }

    /**
     * True when a row's clear-all control is worth offering. Counted on the stored values rather
     * than on the rendered pills: a stored value matching no option renders no pill, and clearing
     * is how an admin gets rid of such a leftover.
     *
     * @param {Array} values The stored list.
     * @returns {Boolean}
     */
    function canClearAll(values) {
        return values.length >= CLEAR_ALL_MINIMUM;
    }

    /**
     * True when an expanded pill list fits the collapse limit again and folds back, so a list that
     * later grows past the limit starts collapsed instead of inheriting an expansion asked for on
     * other values. The length is read only for an expanded list.
     *
     * @param {Boolean} expanded The list is shown whole.
     * @param {Function} countOf Answers how many values the row stores.
     * @param {Number} limit Pills shown before the rest collapse.
     * @returns {Boolean}
     */
    function collapsesBack(expanded, countOf, limit) {
        return expanded && countOf() <= limit;
    }

    /**
     * The value a free-text list editor's typed text commits as — trimmed — or null when nothing
     * but blanks, or nothing at all, was typed.
     *
     * @param {*} text The editor's search text.
     * @returns {String|null}
     */
    function freeTextEntry(text) {
        var entry = String(text || '').trim();

        return entry === '' ? null : entry;
    }

    /**
     * The values a row's option offer leaves out: what a list-valued row already holds — picking
     * one twice would add nothing — and nothing for a single-value row, whose chosen value stays
     * on offer. The values are read only for a list-valued row.
     *
     * @param {Function} isListOf Answers whether the row's operator takes a list.
     * @param {Function} valuesOf Answers the row's stored values as a list.
     * @returns {Array}
     */
    function offerExclusions(isListOf, valuesOf) {
        return isListOf() ? valuesOf() : [];
    }

    /**
     * What a paste into a list editor does, or null when the text is not a list — no separator
     * in it — and the browser pastes it into the input as usual.
     *
     * A list is split into trimmed entries and, in the `options` mode, resolved through the row's
     * option list (asked for only then, and only once there is an entry to resolve); in any other
     * mode its entries are taken as typed. A list of nothing but separators parses no entry.
     *
     * @param {*} text Clipboard text.
     * @param {String} mode `options` to resolve against the row's options.
     * @param {Function|null} lookupOf Answers the pasteLookup() of the row's options.
     * @returns {{parsed: Number, values: Array.<String>, skipped: Number}|null}
     */
    function planPaste(text, mode, lookupOf) {
        var entries;
        var resolved;

        if (!expressionValue.hasListSeparators(text)) {
            return null;
        }
        entries = expressionValue.splitPasteText(text);

        if (entries.length === 0) {
            return {parsed: 0, values: [], skipped: 0};
        }
        resolved = resolvePaste(entries, mode === PASTE_RESOLVES_OPTIONS ? lookupOf() : null);

        return {parsed: entries.length, values: resolved.values, skipped: resolved.skipped};
    }

    return {
        canClearAll: canClearAll,
        collapsesBack: collapsesBack,
        freeTextEntry: freeTextEntry,
        offerExclusions: offerExclusions,
        planPaste: planPaste,
        appendValues: appendValues,
        removeValue: removeValue,
        holds: holds,
        visiblePills: visiblePills,
        hiddenPillCount: hiddenPillCount,
        pasteLookup: pasteLookup,
        resolvePaste: resolvePaste
    };
});
