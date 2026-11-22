/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Keeps a mounted builder's stored value and its caller's in step without echoes. Pure: it only
 * decides; the mount adapter does the loading and the reporting.
 *
 * Two directions meet here:
 *
 * - an edit in the builder is reported to the caller once, and only when it changes the value;
 * - a value the caller hands in is loaded into the builder only when it differs from what the
 *   builder already holds.
 *
 * The builder rewrites a value it loads into its own serialisation (key order, number formats,
 * conditions it cannot place dropped). That rewrite is not an edit, so it is never reported: a
 * caller that marks its document dirty on every report would otherwise turn dirty the moment it
 * opens. And a caller that hands back the value it was given — a re-render passing the same prop —
 * must not rebuild the tree under the person editing it, so the raw value last handed in counts as
 * held until an edit replaces it.
 */
define([], function () {
    'use strict';

    /**
     * @param {String} initial The value the builder is mounted with.
     * @returns {{loaded: function(String): void, changed: function(String): Boolean, wants: function(String): Boolean}}
     */
    function createValueSync(initial) {
        // The value the builder and the caller agree on: the builder's serialisation of the last
        // value loaded, or the last edit reported.
        var known = initial;
        // The raw value the caller last handed in, as long as no edit has replaced it.
        var given = initial;
        var hasGiven = true;

        return {
            /**
             * Records the builder's own serialisation of the value it has just loaded.
             *
             * @param {String} canonical
             * @returns {void}
             */
            loaded: function (canonical) {
                known = canonical;
            },

            /**
             * Whether a value the builder now holds is an edit to report. Records it when it is.
             *
             * @param {String} value
             * @returns {Boolean}
             */
            changed: function (value) {
                if (value === known) {
                    return false;
                }

                known = value;
                hasGiven = false;

                return true;
            },

            /**
             * Whether a value the caller hands in has to be loaded into the builder. When it does, it
             * becomes the agreed value at once, so the write that loading makes is not reported back;
             * the caller then records the builder's serialisation of it through loaded().
             *
             * @param {String} value
             * @returns {Boolean}
             */
            wants: function (value) {
                if (value === known || (hasGiven && value === given)) {
                    return false;
                }

                known = value;
                given = value;
                hasGiven = true;

                return true;
            }
        };
    }

    return {
        createValueSync: createValueSync
    };
});
