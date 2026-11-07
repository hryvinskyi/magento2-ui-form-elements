/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-reorder module — where a node may move, by pointer or by
 * keyboard, under the depth cap. The module under test is loaded by run.mjs and handed in, with the
 * tree module whose heights the component feeds it.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-reorder module.
 *
 * @param {Object} expressionReorder The module's export object.
 * @param {Object} expressionTree The tree module, for node heights.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionReorder, expressionTree) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});
    const row = (name) => ({kind: 'condition', condition: {name}});
    const group = (...children) => ({kind: 'group', aggregator: 'all', children});

    /**
     * all[ c0, all[ c10, c11 ], c2 ] — slots in depth-first order:
     * [0] [1] [1,0] [1,1] [1,2] [2] [3]
     *
     * @returns {Object}
     */
    const model = () => group(row('c0'), group(row('c10'), row('c11')), row('c2'));
    const paths = (slots) => slots.map((slot) => slot.path);

    test('slotFits: a slot fits when its depth plus the node\'s height stays within the cap', () => {
        assert.strictEqual(expressionReorder.slotFits([0], 0, 1), true);
        assert.strictEqual(expressionReorder.slotFits([1, 0], 0, 1), false);
        assert.strictEqual(expressionReorder.slotFits([0], 1, 2), true);
        assert.strictEqual(expressionReorder.slotFits([1, 0], 1, 2), false);
    });

    test('slotWalk: a row keeps every slot, and sits between its own two', () => {
        const walk = expressionReorder.slotWalk(model(), [0]);

        assert.deepStrictEqual(paths(walk.slots), [[0], [1], [1, 0], [1, 1], [1, 2], [2], [3]]);
        assert.strictEqual(walk.before, 0);
    });

    test('slotWalk: a group loses the slots inside itself', () => {
        const walk = expressionReorder.slotWalk(model(), [1]);

        assert.deepStrictEqual(paths(walk.slots), [[0], [1], [2], [3]]);
        assert.strictEqual(walk.before, 1);
    });

    test('slotWalk: a node outside the tree — the root included — has no walk', () => {
        assert.strictEqual(expressionReorder.slotWalk(model(), null), null);
        assert.strictEqual(expressionReorder.slotWalk(model(), [9]), null);
    });

    test('dropSlots: never the two slots around the node, never one the cap refuses', () => {
        const rowWalk = expressionReorder.slotWalk(model(), [0]);
        const groupWalk = expressionReorder.slotWalk(model(), [1]);
        const groupHeight = expressionTree.height(model().children[1]);

        assert.deepStrictEqual(paths(expressionReorder.dropSlots(rowWalk, 0, 5)), [[1, 0], [1, 1], [1, 2], [2], [3]]);
        assert.deepStrictEqual(paths(expressionReorder.dropSlots(rowWalk, 0, 1)), [[2], [3]]);
        assert.deepStrictEqual(paths(expressionReorder.dropSlots(groupWalk, groupHeight, 5)), [[0], [3]]);
        assert.deepStrictEqual(paths(expressionReorder.dropSlots(groupWalk, groupHeight, 1)), []);
    });

    test('stepSlot: one keystroke steps over the node\'s own two slots, and stops at the ends', () => {
        const walk = expressionReorder.slotWalk(model(), [0]);

        assert.deepStrictEqual(expressionReorder.stepSlot(walk, 1, 0, 5).path, [1, 0]);
        assert.strictEqual(expressionReorder.stepSlot(walk, -1, 0, 5), null);

        const last = expressionReorder.slotWalk(model(), [2]);

        assert.deepStrictEqual(expressionReorder.stepSlot(last, -1, 0, 5).path, [1, 2]);
        assert.strictEqual(expressionReorder.stepSlot(last, 1, 0, 5), null);
    });

    test('stepSlot: slots the cap refuses are passed over, so a keystroke reaches the next usable gap', () => {
        const last = expressionReorder.slotWalk(model(), [2]);

        assert.deepStrictEqual(expressionReorder.stepSlot(last, -1, 0, 1).path, [1]);
        assert.strictEqual(expressionReorder.stepSlot(expressionReorder.slotWalk(model(), [1]), -1, 1, 1), null);
    });

    test('stepForKey: ArrowUp and ArrowDown step, any other key moves nothing', () => {
        assert.strictEqual(expressionReorder.stepForKey('ArrowUp'), -1);
        assert.strictEqual(expressionReorder.stepForKey('ArrowDown'), 1);
        for (const key of ['ArrowLeft', 'Enter', '', 'constructor']) {
            assert.strictEqual(expressionReorder.stepForKey(key), 0, key);
        }
    });

    test('nearestSlot: the nearest gap wins, the first of two equally near ones', () => {
        const candidates = [{id: 'a', y: 0}, {id: 'b', y: 10}, {id: 'c', y: 10}, {id: 'd', y: 30}];

        assert.strictEqual(expressionReorder.nearestSlot(candidates, 10).id, 'b');
        assert.strictEqual(expressionReorder.nearestSlot(candidates, 21).id, 'd');
        assert.strictEqual(expressionReorder.nearestSlot(candidates, -50).id, 'a');
        assert.strictEqual(expressionReorder.nearestSlot([], 10), null);
    });

    test('insideBox: a position inside the box or on its edge is inside; no box is outside', () => {
        const box = {top: 10, bottom: 100, left: 20, right: 200};

        assert.strictEqual(expressionReorder.insideBox(box, 50, 50), true);
        assert.strictEqual(expressionReorder.insideBox(box, 20, 10), true);
        assert.strictEqual(expressionReorder.insideBox(box, 200, 100), true);
        assert.strictEqual(expressionReorder.insideBox(box, 19, 50), false);
        assert.strictEqual(expressionReorder.insideBox(box, 201, 50), false);
        assert.strictEqual(expressionReorder.insideBox(box, 50, 9), false);
        assert.strictEqual(expressionReorder.insideBox(box, 50, 101), false);
        assert.strictEqual(expressionReorder.insideBox(null, 50, 50), false);
    });

    test('insertIndex: a later gap in the same group shifts by the removal, nothing else does', () => {
        assert.strictEqual(expressionReorder.insertIndex(true, 3, 1), 2);
        assert.strictEqual(expressionReorder.insertIndex(true, 1, 2), 1);
        assert.strictEqual(expressionReorder.insertIndex(true, 2, 2), 2, 'the gap directly above the node does not shift');
        assert.strictEqual(expressionReorder.insertIndex(false, 3, 1), 3);
    });

    test('placeOf: the 1-based position among the places the node can occupy', () => {
        assert.deepStrictEqual(expressionReorder.placeOf(expressionReorder.slotWalk(model(), [0])), {position: 1, total: 6});
        assert.deepStrictEqual(expressionReorder.placeOf(expressionReorder.slotWalk(model(), [2])), {position: 6, total: 6});
        assert.deepStrictEqual(expressionReorder.placeOf(expressionReorder.slotWalk(model(), [1])), {position: 2, total: 3});
    });

    test('samePath: equal paths only', () => {
        assert.strictEqual(expressionReorder.samePath([1, 2], [1, 2]), true);
        assert.strictEqual(expressionReorder.samePath([1, 2], [1]), false);
        assert.strictEqual(expressionReorder.samePath([], []), true);
    });

    test('canNestGroupAt: a group may take a child group while the child still fits under the cap', () => {
        assert.strictEqual(expressionReorder.canNestGroupAt(1, 5), true);
        assert.strictEqual(expressionReorder.canNestGroupAt(4, 5), true);
        assert.strictEqual(expressionReorder.canNestGroupAt(5, 5), false);
        assert.strictEqual(expressionReorder.canNestGroupAt(6, 5), false);
    });

    test('sameSlot: the same group and index; no slot is never the same as one', () => {
        const groupA = {};
        const groupB = {};

        assert.strictEqual(expressionReorder.sameSlot({group: groupA, index: 1}, {group: groupA, index: 1}), true);
        assert.strictEqual(expressionReorder.sameSlot({group: groupA, index: 1}, {group: groupA, index: 2}), false);
        assert.strictEqual(expressionReorder.sameSlot({group: groupA, index: 1}, {group: groupB, index: 1}), false);
        assert.strictEqual(expressionReorder.sameSlot(null, {group: groupA, index: 1}), false);
        assert.strictEqual(expressionReorder.sameSlot({group: groupA, index: 1}, null), false);
    });

    test('slotAnchor: a gap is measured at the top of the child after it, the bottom of the last, or the add button', () => {
        assert.deepStrictEqual(expressionReorder.slotAnchor(0, 3), {element: 'child', child: 0, edge: 'top'});
        assert.deepStrictEqual(expressionReorder.slotAnchor(2, 3), {element: 'child', child: 2, edge: 'top'});
        assert.deepStrictEqual(expressionReorder.slotAnchor(3, 3), {element: 'child', child: 2, edge: 'bottom'});
        assert.deepStrictEqual(expressionReorder.slotAnchor(0, 0), {element: 'add', edge: 'top'},
            'an empty group has no child to measure');
    });

    test('marksGapBefore: the indicator sits above the node the target slot comes before', () => {
        const first = {};
        const second = {};
        const target = {group: {children: [first, second]}, index: 1};
        const childrenOf = (group) => group.children;

        assert.strictEqual(expressionReorder.marksGapBefore(target, second, childrenOf), true);
        assert.strictEqual(expressionReorder.marksGapBefore(target, first, childrenOf), false);
        assert.strictEqual(expressionReorder.marksGapBefore({group: target.group, index: 2}, second, childrenOf), false,
            'the gap after the last child belongs to no node');
        assert.strictEqual(expressionReorder.marksGapBefore(null, first, () => {
            throw new Error('no target reads no group');
        }), false);
    });

    test('marksGapAtEnd: the indicator after a group\'s last child is that group\'s own', () => {
        const group = {};
        const other = {};
        let counted = 0;
        const countOf = (count) => () => {
            counted++;

            return count;
        };

        assert.strictEqual(expressionReorder.marksGapAtEnd({group, index: 2}, group, countOf(2)), true);
        assert.strictEqual(expressionReorder.marksGapAtEnd({group, index: 1}, group, countOf(2)), false);
        assert.strictEqual(expressionReorder.marksGapAtEnd({group: other, index: 2}, group, countOf(2)), false);
        assert.strictEqual(expressionReorder.marksGapAtEnd(null, group, countOf(0)), false);
        assert.strictEqual(counted, 2, 'only a target in this group reads its children');
    });

    return tests;
}
