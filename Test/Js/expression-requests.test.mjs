/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-requests module — the lifecycle of the requests the
 * builder sends: superseding, the deadline, and the teardown. The module under test is loaded by
 * run.mjs and handed in; the platform it drives is Node's own AbortController and a hand-cranked
 * timer, so a deadline can be made to pass without waiting for it.
 */
import assert from 'node:assert/strict';

/**
 * A platform whose timers fire only when the test says so.
 *
 * @returns {{platform: Object, timers: Array.<{fn: Function, ms: Number, cleared: Boolean}>, fire: Function}}
 */
function fakePlatform() {
    const timers = [];

    return {
        timers,
        platform: {
            abortController: () => new AbortController(),
            setTimer(fn, ms) {
                const timer = {fn, ms, cleared: false};

                timers.push(timer);

                return timer;
            },
            clearTimer(timer) {
                timer.cleared = true;
            }
        },
        fire(timer) {
            assert.strictEqual(timer.cleared, false, 'a cleared deadline never fires');
            timer.fn();
        }
    };
}

/**
 * Builds the full test list against a loaded expression-requests module.
 *
 * @param {Object} expressionRequests The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionRequests) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    test('the deadline is fifteen seconds', () => {
        assert.strictEqual(expressionRequests.REQUEST_DEADLINE, 15000);
    });

    test('start: a live signal and one deadline armed for the request', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const ticket = requests.start('count');

        assert.strictEqual(ticket.signal.aborted, false);
        assert.strictEqual(timers.length, 1);
        assert.strictEqual(timers[0].ms, expressionRequests.REQUEST_DEADLINE);
    });

    test('settle: an answered request may write, its deadline is cleared and its key is free again', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const first = requests.start('count');

        assert.strictEqual(first.settle(), true);
        assert.strictEqual(timers[0].cleared, true);

        const second = requests.start('count');

        assert.strictEqual(first.signal.aborted, false, 'a settled request is not aborted by the next one');
        assert.strictEqual(second.signal.aborted, false);
    });

    test('a newer request under the same key aborts the one it supersedes, which never writes', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const older = requests.start('suggest:7');
        const newer = requests.start('suggest:7');

        assert.strictEqual(older.signal.aborted, true);
        assert.strictEqual(timers[0].cleared, true, 'the superseded deadline is cleared, not left to fire');
        assert.strictEqual(newer.signal.aborted, false);
        assert.strictEqual(older.settle(), false, 'a late answer to the superseded request is dropped');
        assert.strictEqual(newer.settle(), true);
    });

    test('a late settle of a superseded request leaves its successor in flight', () => {
        const {platform} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const older = requests.start('count');
        const newer = requests.start('count');

        older.settle();
        requests.cancel('count');

        assert.strictEqual(newer.signal.aborted, true, 'the key still addressed the successor');
        assert.strictEqual(newer.settle(), false);
    });

    test('requests under different keys never supersede each other', () => {
        const {platform} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const one = requests.start('suggest:1');
        const two = requests.start('suggest:2');
        const options = requests.start('options:color');

        assert.strictEqual(one.signal.aborted, false);
        assert.strictEqual(two.signal.aborted, false);
        assert.strictEqual(options.signal.aborted, false);
    });

    test('the deadline aborts the request, and the request still writes its outcome', () => {
        const {platform, timers, fire} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const ticket = requests.start('count');

        fire(timers[0]);

        assert.strictEqual(ticket.signal.aborted, true);
        assert.strictEqual(ticket.settle(), true, 'an expired request shows its failure state');
    });

    test('a deadline that passed frees the key: the next request starts unhindered', () => {
        const {platform, timers, fire} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const expired = requests.start('count');

        fire(timers[0]);
        const next = requests.start('count');

        assert.strictEqual(next.signal.aborted, false);
        assert.strictEqual(next.settle(), true);
        assert.strictEqual(expired.settle(), true);
    });

    test('cancel: aborts the request under the key without a successor; an unknown key is a no-op', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const ticket = requests.start('suggest:3');

        requests.cancel('suggest:4');
        assert.strictEqual(ticket.signal.aborted, false);

        requests.cancel('suggest:3');
        assert.strictEqual(ticket.signal.aborted, true);
        assert.strictEqual(timers[0].cleared, true);
        assert.strictEqual(ticket.settle(), false);
        requests.cancel('suggest:3');
    });

    test('dispose: every request in flight is aborted, none writes, no deadline is left armed', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const count = requests.start('count');
        const suggest = requests.start('suggest:5');
        const options = requests.start('options:size');

        requests.dispose();

        for (const ticket of [count, suggest, options]) {
            assert.strictEqual(ticket.signal.aborted, true);
            assert.strictEqual(ticket.settle(), false);
        }
        assert.ok(timers.every((timer) => timer.cleared), 'every deadline is cleared');
        requests.dispose();
    });

    test('dispose: an answer that already landed is not written once the tracker is disposed', () => {
        const {platform} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const ticket = requests.start('count');

        requests.dispose();

        assert.strictEqual(ticket.settle(), false);
    });

    test('dispose: a request started afterwards is born aborted, arms no deadline and never writes', () => {
        const {platform, timers} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);

        requests.dispose();
        const ticket = requests.start('options:color');

        assert.strictEqual(ticket.signal.aborted, true);
        assert.strictEqual(timers.length, 0);
        assert.strictEqual(ticket.settle(), false);
    });

    test('settle is idempotent: a second call answers the same and clears nothing new', () => {
        const {platform} = fakePlatform();
        const requests = expressionRequests.createRequestTracker(platform);
        const kept = requests.start('count');
        const dropped = requests.start('suggest:9');

        requests.cancel('suggest:9');

        assert.strictEqual(kept.settle(), true);
        assert.strictEqual(kept.settle(), true);
        assert.strictEqual(dropped.settle(), false);
        assert.strictEqual(dropped.settle(), false);
    });

    return tests;
}
