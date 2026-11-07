/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure contract of the two endpoints that supply a picker row's values from the server: the
 * attribute-option endpoint (`optionsUrl`), which answers one optioned attribute's list the moment
 * that attribute is picked, and the value-suggest endpoint (`suggestUrl`), which answers
 * type-ahead suggestions for a free-text attribute.
 *
 * It decides when each is asked, what URL asks it, how its answer is read, and when the type-ahead
 * has something to show; the component sends the request and keeps the state. An attribute descriptor only says that a list EXISTS
 * (`hasOptions`); the list arrives later and is written into the descriptor (`options`).
 *
 * Side-effect free and dependency-free, so the same file runs in the admin bundle and under plain
 * Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * An endpoint URL with query parameters appended, after a `?` or — when the URL already
     * carries a query — an `&`, every value URI-encoded.
     *
     * @param {String} url
     * @param {Array.<Array.<String>>} params Name/value pairs, in order.
     * @returns {String}
     */
    function withQuery(url, params) {
        return url + (url.indexOf('?') === -1 ? '?' : '&') + params.map(function (pair) {
            return pair[0] + '=' + encodeURIComponent(pair[1]);
        }).join('&');
    }

    /**
     * The attribute whose option list should be fetched now, as the code to ask for, or null.
     *
     * Only an attribute that declares a list (`hasOptions`) and has none yet, with an endpoint to
     * ask; whether the code is already in flight or has failed before is needsOptionsRequest()'s
     * question, over the state the caller keeps.
     *
     * @param {Object|null} attribute The picked attribute's descriptor.
     * @param {String} optionsUrl
     * @returns {String|null}
     */
    function optionCodeToFetch(attribute, optionsUrl) {
        if (!attribute || attribute.options || !attribute.hasOptions || optionsUrl === '') {
            return null;
        }

        return String(attribute.value);
    }

    /**
     * True while an attribute's declared list has not arrived yet — the loading placeholder's
     * condition. Never true without an endpoint (nothing will arrive) nor after a failed fetch
     * (nothing more will): both degrade the row to the editors that need no list.
     *
     * @param {Object|null} attribute The picked attribute's descriptor.
     * @param {String} optionsUrl
     * @param {Object.<String, Boolean>} failed Codes whose fetch failed.
     * @returns {Boolean}
     */
    function awaitsOptions(attribute, optionsUrl, failed) {
        if (!attribute || !attribute.hasOptions || attribute.options || optionsUrl === '') {
            return false;
        }

        return failed[String(attribute.value)] !== true;
    }

    /**
     * The URL asking for one attribute's option list.
     *
     * @param {String} optionsUrl
     * @param {String} attributeCode
     * @returns {String}
     */
    function optionsRequestUrl(optionsUrl, attributeCode) {
        return withQuery(optionsUrl, [['attribute', attributeCode]]);
    }

    /**
     * The option list an attribute-option answer carries, or null when it carries none — which
     * the caller records as a failure.
     *
     * @param {*} data Decoded answer, or null when the response was unusable.
     * @returns {Array.<Object>|null}
     */
    function readOptions(data) {
        return data && Array.isArray(data.options) ? data.options : null;
    }

    /**
     * A query as it is sent: trimmed, null and undefined read as ''.
     *
     * @param {*} query
     * @returns {String}
     */
    function trimmedQuery(query) {
        return String(query === null || query === undefined ? '' : query).trim();
    }

    /**
     * The URL asking for suggestions, or null when nothing is to be asked: the attribute does not
     * support suggestions, the query is shorter than the minimum — the endpoint answers nothing
     * below its own minimum — or there is no endpoint.
     *
     * @param {Object|null} attribute The picked attribute's descriptor.
     * @param {*} attributeCode The row's picked attribute code.
     * @param {*} query What the admin typed.
     * @param {Number} minQuery Shortest query worth asking about.
     * @param {String} suggestUrl
     * @returns {String|null}
     */
    function suggestRequestUrl(attribute, attributeCode, query, minQuery, suggestUrl) {
        var trimmed = trimmedQuery(query);

        if (!attribute || !attribute.suggest || trimmed.length < minQuery || !suggestUrl) {
            return null;
        }

        return withQuery(suggestUrl, [['attribute', attributeCode], ['q', trimmed]]);
    }

    /**
     * The suggestions a suggest answer carries; none for anything else.
     *
     * @param {*} data Decoded answer.
     * @returns {Array.<Object>}
     */
    function readSuggestions(data) {
        return data && data.items ? data.items : [];
    }

    /**
     * True when the endpoint has answered a real query with nothing.
     *
     * Each condition is load-bearing: while a request is in flight the answer is not in yet,
     * suggestions still on screen are not "no matches", and a query below the minimum was never
     * asked at all.
     *
     * @param {Boolean} loading A request is in flight.
     * @param {Number} suggestionCount Suggestions on screen.
     * @param {*} query The text the suggestions are for.
     * @param {Number} minQuery
     * @returns {Boolean}
     */
    function answeredEmpty(loading, suggestionCount, query, minQuery) {
        return !loading && suggestionCount === 0 && trimmedQuery(query).length >= minQuery;
    }

    /**
     * True when an option list is to be requested now: there is a code to fetch, it is not already
     * in flight — one request per code at a time — and its fetch has not failed before, so a broken
     * endpoint costs one request, not one per render.
     *
     * @param {String|null} code From optionCodeToFetch().
     * @param {Object.<String, Boolean>} inFlight Codes whose request is in flight.
     * @param {Object.<String, Boolean>} failed Codes whose fetch failed.
     * @returns {Boolean}
     */
    function needsOptionsRequest(code, inFlight, failed) {
        return code !== null && inFlight[code] !== true && failed[code] !== true;
    }

    /**
     * True when an open type-ahead has something to say: suggestions, a request in flight, or the
     * "no matches" verdict. A query below the request threshold was never sent, so an open
     * type-ahead can have nothing at all to show — and an empty bordered box under the input
     * would be all it rendered.
     *
     * @param {{isOpen: Function, loading: Function, count: Function, answeredEmpty: Function}} probe
     *     `count()` answers how many suggestions are on screen, `answeredEmpty()` answeredEmpty()'s
     *     verdict for the row's query.
     * @returns {Boolean}
     */
    function suggestListHasContent(probe) {
        return probe.isOpen() && (probe.loading() || probe.count() > 0 || probe.answeredEmpty());
    }

    return {
        needsOptionsRequest: needsOptionsRequest,
        suggestListHasContent: suggestListHasContent,
        optionCodeToFetch: optionCodeToFetch,
        awaitsOptions: awaitsOptions,
        optionsRequestUrl: optionsRequestUrl,
        readOptions: readOptions,
        suggestRequestUrl: suggestRequestUrl,
        readSuggestions: readSuggestions,
        answeredEmpty: answeredEmpty
    };
});
