/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure rules of the match-count badge: when a rule is worth counting, what the counting endpoint
 * is sent, how its answer is read, and how the number is printed.
 *
 * The badge has four states: `idle` (nothing to count — no endpoint, or an empty rule; no badge),
 * `loading`, `ready` (a number) and `error` (no number could be produced). Counting is opt-in per
 * consumer through `countUrl`, and the wording around the number is the consumer's `countLabel`;
 * the component owns the transient states' wording, this module the number's formatting.
 *
 * Side-effect free and dependency-free, so the same file runs in the admin bundle and under plain
 * Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * What a newly serialised rule asks of the badge, or null when it asks nothing.
     *
     * A rule identical to the one the badge already describes asks nothing: an observable holding
     * an array notifies on every write, equal contents included, and without this an unchanged
     * rule would cost a request and throw a settled number back to `loading`. An empty rule is not
     * a question the component can ask — consumers disagree on what "no conditions" selects, and
     * the endpoint treats such a request as an error — so it settles locally on `idle`. Anything
     * else shows `loading` at once rather than at request time: keeping the previous number up
     * through the debounce would state a count for a rule that no longer exists.
     *
     * @param {String|null} previous The serialised rule the badge describes, null before the first.
     * @param {String} serialised The rule as just serialised; '' when nothing serialises.
     * @returns {{state: String, request: Boolean}|null}
     */
    function planCount(previous, serialised) {
        if (serialised === previous) {
            return null;
        }

        return serialised === '' ? {state: 'idle', request: false} : {state: 'loading', request: true};
    }

    /**
     * The form fields a count request posts, in order: the serialised rule, the store scope and the
     * admin form key — adminhtml validates a POST against the key and answers one without it with
     * a redirect rather than JSON.
     *
     * @param {String} serialised
     * @param {Number} storeId
     * @param {String} formKey
     * @returns {Array.<Array.<String>>} Name/value pairs.
     */
    function requestFields(serialised, storeId, formKey) {
        return [
            ['conditions', serialised],
            ['store_id', String(storeId)],
            ['form_key', formKey]
        ];
    }

    /**
     * The badge state an endpoint answer stands for.
     *
     * Only `{count, capped}` with a non-negative count reads as a count; a numeric string counts
     * too, since the contract is public and JSON encoders differ on integer types. `{error: true}`,
     * an absent, blank, null or non-numeric count, a negative one and an unusable response (null)
     * all read as `error` — "nothing matches" and "no count could be produced" are different
     * statements and must not look alike. A count is floored; `capped` holds only for a literal true.
     *
     * @param {*} data The decoded answer, or null when the response was unusable.
     * @returns {{state: String, count: (Number|null), capped: Boolean}}
     */
    function readAnswer(data) {
        var raw = data ? data.count : null;
        var count = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);

        if (!data || data.error === true || !isFinite(count) || count < 0) {
            return {state: 'error', count: null, capped: false};
        }

        return {state: 'ready', count: Math.floor(count), capped: data.capped === true};
    }

    /**
     * One count as the badge prints it: thousands grouped by a non-breaking space, and a trailing
     * `+` when the endpoint stopped counting at its cap.
     *
     * The cap itself is never named: the endpoint answers with the number it stopped at, so a
     * retuned cap needs no change here. Grouping is computed rather than left to a locale
     * formatter, so the badge reads the same in every admin locale, and a non-breaking space keeps
     * a number from wrapping mid-digits.
     *
     * @param {Number|null} count
     * @param {Boolean} capped
     * @returns {String} '' when there is no number.
     */
    function formatCount(count, capped) {
        var grouped;

        if (count === null || count === undefined) {
            return '';
        }
        grouped = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

        return capped ? grouped + '+' : grouped;
    }

    /**
     * The consumer's wording with the printed number in place of every `%1`.
     *
     * Wording without the placeholder — or none at all — is the same mistake, and degrades to the
     * bare number: the number is the point of the badge. The substitution is a split/join, so
     * nothing in it can be read as a replacement pattern.
     *
     * @param {String} label The consumer's `countLabel`.
     * @param {String} formatted The printed number.
     * @returns {String}
     */
    function labelWithCount(label, formatted) {
        if (label.indexOf('%1') === -1) {
            return formatted;
        }

        return label.split('%1').join(formatted);
    }

    /**
     * True when the consumer counts its matches at all: an endpoint is configured. Without one the
     * component asks nothing and shows no badge.
     *
     * @param {String} countUrl
     * @returns {Boolean}
     */
    function countsMatches(countUrl) {
        return countUrl !== '';
    }

    /**
     * True when the badge has something to say: an endpoint is configured — a consumer that cannot
     * count has no badge at all, whatever the state — and there is a rule to count.
     *
     * @param {String} countUrl
     * @param {String} state
     * @returns {Boolean}
     */
    function badgeVisible(countUrl, state) {
        return countsMatches(countUrl) && state !== 'idle';
    }

    return {
        countsMatches: countsMatches,
        planCount: planCount,
        requestFields: requestFields,
        readAnswer: readAnswer,
        formatCount: formatCount,
        labelWithCount: labelWithCount,
        badgeVisible: badgeVisible
    };
});
