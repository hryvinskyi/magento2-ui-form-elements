/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-drag module — the DOM side of a pointer drag: the pointer
 * capture, the Escape listener and the measuring of rendered elements. The module under test is
 * loaded by run.mjs and handed in; it is driven here against a recording document and handle,
 * which is the whole surface of the page it touches.
 */
import assert from 'node:assert/strict';

/**
 * A document that records its key listeners and serves elements by id.
 *
 * @param {Object.<String, Object>} [elements] Elements by id.
 * @returns {Object}
 */
function fakeDocument(elements = {}) {
    const listeners = [];

    return {
        listeners,
        addEventListener(type, listener, capture) {
            listeners.push({type, listener, capture});
        },
        removeEventListener(type, listener, capture) {
            const index = listeners.findIndex((entry) => entry.type === type
                && entry.listener === listener && entry.capture === capture);

            if (index !== -1) {
                listeners.splice(index, 1);
            }
        },
        getElementById(id) {
            return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
        },
        press(key) {
            listeners.filter((entry) => entry.type === 'keydown').forEach((entry) => entry.listener({key}));
        }
    };
}

/**
 * A drag handle that records its pointer capture.
 *
 * @returns {Object}
 */
function fakeHandle() {
    const handle = {
        captured: null,
        released: [],
        setPointerCapture(id) {
            handle.captured = id;
        },
        hasPointerCapture(id) {
            return handle.captured === id;
        },
        releasePointerCapture(id) {
            handle.released.push(id);
            handle.captured = null;
        }
    };

    return handle;
}

/**
 * Builds the full test list against a loaded expression-drag module.
 *
 * @param {Object} expressionDrag The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionDrag) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('start: the handle captures the pointer and a capture-phase Escape listener is installed', () => {
        const doc = fakeDocument();
        const handle = fakeHandle();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(handle, 4, () => {});

        assert.strictEqual(handle.captured, 4);
        assert.strictEqual(doc.listeners.length, 1);
        assert.strictEqual(doc.listeners[0].type, 'keydown');
        assert.strictEqual(doc.listeners[0].capture, true);
    });

    test('Escape calls the cancel callback; any other key does nothing', () => {
        const doc = fakeDocument();
        let cancelled = 0;
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(fakeHandle(), 1, () => {
            cancelled++;
        });
        doc.press('Enter');
        assert.strictEqual(cancelled, 0);
        doc.press('Escape');
        assert.strictEqual(cancelled, 1);
    });

    test('start: no pointer id, or a handle that cannot capture, still installs the Escape listener', () => {
        const doc = fakeDocument();
        const handle = fakeHandle();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(handle, null, () => {});
        assert.strictEqual(handle.captured, null);
        assert.strictEqual(doc.listeners.length, 1);

        drag.release();
        drag.start({}, 2, () => {});
        assert.strictEqual(doc.listeners.length, 1);
        drag.release();
        assert.strictEqual(doc.listeners.length, 0);
    });

    test('release: the listener goes, the capture is released, and a second release is a no-op', () => {
        const doc = fakeDocument();
        const handle = fakeHandle();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(handle, 3, () => {});
        drag.release();

        assert.strictEqual(doc.listeners.length, 0);
        assert.deepStrictEqual(handle.released, [3]);

        drag.release();
        assert.deepStrictEqual(handle.released, [3]);
    });

    test('release: a capture that has already lapsed is not released again', () => {
        const doc = fakeDocument();
        const handle = fakeHandle();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(handle, 5, () => {});
        handle.captured = null;
        drag.release();

        assert.deepStrictEqual(handle.released, []);
        assert.strictEqual(doc.listeners.length, 0);
    });

    test('release: nothing to do when no drag ever started', () => {
        const doc = fakeDocument();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.release();

        assert.strictEqual(doc.listeners.length, 0);
    });

    test('start: a second start releases the first drag before taking the new one', () => {
        const doc = fakeDocument();
        const first = fakeHandle();
        const second = fakeHandle();
        const drag = expressionDrag.createPointerDrag(doc);

        drag.start(first, 1, () => {});
        drag.start(second, 2, () => {});

        assert.deepStrictEqual(first.released, [1]);
        assert.strictEqual(second.captured, 2);
        assert.strictEqual(doc.listeners.length, 1);
    });

    test('measure: an element\'s box as plain edges, null for a missing or unmeasurable element', () => {
        const doc = fakeDocument({
            row: {getBoundingClientRect: () => ({top: 10, bottom: 40, left: 5, right: 300, width: 295})},
            text: {}
        });
        const drag = expressionDrag.createPointerDrag(doc);

        assert.deepStrictEqual(drag.measure('row'), {top: 10, bottom: 40, left: 5, right: 300});
        assert.strictEqual(drag.measure('text'), null);
        assert.strictEqual(drag.measure('missing'), null);
    });

    return tests;
}
