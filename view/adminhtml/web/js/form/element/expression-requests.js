/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The lifecycle of the requests the expression builder sends: which one a newer request
 * supersedes, how long any of them may take, and which answers may still be written.
 *
 * Every request is started under a KEY naming what it answers for — the match count, one row's
 * suggestions, one attribute's option list. The rules:
 *
 * - **A newer request supersedes the older one under the same key.** The older one is aborted
 *   and its answer, should it land anyway, is never written: a late answer for a query the admin
 *   has since changed would replace the current one.
 * - **Every request has a deadline** (REQUEST_DEADLINE). When it passes the request is aborted,
 *   which fails it the way any broken response fails: the caller writes its failure state — the
 *   badge's "unavailable", the option-less editor, the empty suggestion list — instead of
 *   loading forever.
 * - **Disposing aborts everything in flight**, and a request started afterwards is born aborted.
 *   Nothing answers into a component the form has already discarded.
 *
 * The caller sends the request itself, passes the ticket's signal along, and asks settle() once
 * the answer — or the failure — is in hand: true means write it, false means drop it.
 *
 * The platform it drives — abort controllers and timers — is handed in, so the module holds no
 * global and runs the same in the admin bundle and under plain Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * How long one request may take, in milliseconds, from the moment it starts until its answer
     * has been read. Long enough for a count over a large catalog on a busy server; short enough
     * that a hung endpoint shows its failure state while the admin is still looking at the row.
     */
    var REQUEST_DEADLINE = 15000;

    /**
     * A ticket that was never in flight: aborted from the start, never written.
     *
     * @param {{abortController: Function}} platform
     * @returns {{signal: Object, settle: Function}}
     */
    function deadTicket(platform) {
        var controller = platform.abortController();

        controller.abort();

        return {
            signal: controller.signal,
            settle: function () {
                return false;
            }
        };
    }

    /**
     * A tracker of the requests in flight, by key.
     *
     * @param {{
     *     abortController: function(): {signal: Object, abort: Function},
     *     setTimer: function(Function, Number): *,
     *     clearTimer: function(*): void
     * }} platform The abort-controller factory and the timer functions to use.
     * @returns {{
     *     start: function(String): {signal: Object, settle: function(): Boolean},
     *     cancel: function(String): void,
     *     dispose: function(): void
     * }}
     */
    function createRequestTracker(platform) {
        var inFlight = Object.create(null);
        var disposed = false;

        /**
         * Ends one entry: its deadline cleared, its key freed when the key still names it.
         *
         * @param {String} key
         * @param {Object} entry
         * @returns {void}
         */
        function end(key, entry) {
            if (entry.timer !== null) {
                platform.clearTimer(entry.timer);
                entry.timer = null;
            }

            if (inFlight[key] === entry) {
                delete inFlight[key];
            }
        }

        /**
         * Aborts one entry for good: it is ended, and its answer will never be written.
         *
         * @param {String} key
         * @param {Object} entry
         * @returns {void}
         */
        function drop(key, entry) {
            entry.dropped = true;
            end(key, entry);
            entry.controller.abort();
        }

        /**
         * Aborts the request under a key, if one is in flight, and writes nothing for it.
         *
         * @param {String} key
         * @returns {void}
         */
        function cancel(key) {
            var entry = inFlight[key];

            if (entry !== undefined) {
                drop(key, entry);
            }
        }

        /**
         * Starts a request under a key, superseding the one in flight under it.
         *
         * @param {String} key What the request answers for.
         * @returns {{signal: Object, settle: function(): Boolean}}
         */
        function start(key) {
            var entry;

            if (disposed) {
                return deadTicket(platform);
            }
            cancel(key);
            entry = {controller: platform.abortController(), timer: null, dropped: false};
            entry.timer = platform.setTimer(function () {
                entry.timer = null;
                end(key, entry);
                entry.controller.abort();
            }, REQUEST_DEADLINE);
            inFlight[key] = entry;

            return {
                signal: entry.controller.signal,
                settle: function () {
                    end(key, entry);

                    return !entry.dropped && !disposed;
                }
            };
        }

        /**
         * Aborts every request in flight and refuses every later one.
         *
         * @returns {void}
         */
        function dispose() {
            disposed = true;
            Object.keys(inFlight).forEach(cancel);
        }

        return {
            start: start,
            cancel: cancel,
            dispose: dispose
        };
    }

    return {
        REQUEST_DEADLINE: REQUEST_DEADLINE,
        createRequestTracker: createRequestTracker
    };
});
