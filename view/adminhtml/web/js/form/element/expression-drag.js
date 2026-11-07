/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The DOM side of a pointer drag in the expression builder: the drag handle's pointer capture,
 * the Escape listener a drag needs, and the measuring of the rendered nodes.
 *
 * The component keeps the drag's state (which node is held, which gap the indicator marks) and
 * every decision about it — where a node may go and which gap a pointer is nearest to are
 * expression-reorder.js's. This module only does what needs the page:
 *
 * - **The capture.** The handle captures the pointer, so every later move and the release are
 *   delivered to it even once the pointer has left the handle, the row or the window — no
 *   document-level move listener, and no drag lost the moment the pointer outruns the element it
 *   started on.
 * - **Escape.** Key events follow focus, which a drag deliberately leaves where it was, so the
 *   capture cannot deliver Escape: a document-level key listener lives exactly as long as the drag
 *   does. It neither stops propagation nor suppresses the default action — cancelling a drag is
 *   not a reason to swallow a keystroke the rest of the page may also have a use for.
 * - **Measuring.** An element's box, by id, as plain edges.
 *
 * The document is handed in, so the module holds no global and runs under plain Node against a
 * recording document (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * The DOM half of one component's pointer drags. One drag at a time: starting another
     * releases the one still held.
     *
     * @param {{
     *     addEventListener: Function,
     *     removeEventListener: Function,
     *     getElementById: function(String): (Object|null)
     * }} doc The document the builder is rendered in.
     * @returns {{
     *     start: function(Object, (Number|null), Function): void,
     *     release: function(): void,
     *     measure: function(String): ({top: Number, bottom: Number, left: Number, right: Number}|null)
     * }}
     */
    function createPointerDrag(doc) {
        var handle = null;
        var pointerId = null;
        var escapeListener = null;

        /**
         * Drops every trace of the drag: the Escape listener and the pointer capture.
         *
         * The capture is released only while the handle still holds it — releasing a capture that
         * has already lapsed throws, and by the time an interrupted drag gets here it usually has.
         * Idempotent: with no drag held it does nothing.
         *
         * @returns {void}
         */
        function release() {
            var heldBy = handle;
            var heldId = pointerId;

            if (escapeListener !== null) {
                doc.removeEventListener('keydown', escapeListener, true);
                escapeListener = null;
            }
            handle = null;
            pointerId = null;

            if (heldBy !== null && heldId !== null
                && typeof heldBy.hasPointerCapture === 'function'
                && typeof heldBy.releasePointerCapture === 'function'
                && heldBy.hasPointerCapture(heldId)) {
                heldBy.releasePointerCapture(heldId);
            }
        }

        /**
         * Takes hold of a drag: the handle captures the pointer, and Escape calls onEscape until
         * the drag is released.
         *
         * @param {Object} dragHandle The element the drag started on.
         * @param {Number|null} dragPointerId The pointer's id; null when the event carried none,
         *     which leaves nothing to capture.
         * @param {Function} onEscape Called when Escape is pressed during the drag.
         * @returns {void}
         */
        function start(dragHandle, dragPointerId, onEscape) {
            release();
            handle = dragHandle;
            pointerId = dragPointerId;

            if (pointerId !== null && typeof handle.setPointerCapture === 'function') {
                handle.setPointerCapture(pointerId);
            }
            escapeListener = function (keyEvent) {
                if (keyEvent && keyEvent.key === 'Escape') {
                    onEscape();
                }
            };
            doc.addEventListener('keydown', escapeListener, true);
        }

        /**
         * The box of a rendered element, or null when it is not on the page.
         *
         * Re-read on every call: the layout moves under a drag (the page scrolls, a dropdown
         * closes, a pill list reflows), so a box measured at drag start goes stale.
         *
         * @param {String} domId Id of the element to measure.
         * @returns {{top: Number, bottom: Number, left: Number, right: Number}|null}
         */
        function measure(domId) {
            var element = doc.getElementById(domId);
            var rect;

            if (!element || typeof element.getBoundingClientRect !== 'function') {
                return null;
            }
            rect = element.getBoundingClientRect();

            return {top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right};
        }

        return {
            start: start,
            release: release,
            measure: measure
        };
    }

    return {
        createPointerDrag: createPointerDrag
    };
});
