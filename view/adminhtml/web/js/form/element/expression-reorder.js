/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure rules of reordering a node inside an expression: where it may go, where one keystroke takes
 * it, whether a pointer is over the authoring area, where each gap is measured and which one it is
 * nearest to, where the drop indicator sits, and how its new place is counted — and the depth cap
 * the authoring button shares with them.
 *
 * Every reorder — a pointer drop or an arrow key on a drag handle — moves a node into an insertion
 * SLOT: a receiving group's path plus the index of the gap it lands in (expression-tree.js lists
 * them depth-first). Three rules sit on top of that list:
 *
 * - **The depth cap.** A slot path's length is its receiving group's depth (the root's slots are
 *   one index long), and a group carries its subtree with it, so a move fits when the slot's
 *   depth plus the node's height stays within the cap. Slots that do not fit are never offered —
 *   not being offered IS the feedback, so a release there drops nothing.
 * - **The node's own place.** The two slots directly around the node describe where it already
 *   is; dropping there rearranges nothing, so neither the pointer nor the keyboard offers them,
 *   and a keystroke steps over them — one keystroke is always exactly one visible change.
 * - **No moving into itself.** The slots inside the node's own subtree are left out of the walk.
 *
 * A node already deeper than the cap stays movable: only the slots it may move INTO are judged,
 * so the destinations still offered are exactly the ones that bring it back inside the cap.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-tree'
], function (expressionTree) {
    'use strict';

    /**
     * How far each reorder key steps through the slot list. Any other key moves nothing.
     */
    var KEY_STEPS = {
        'ArrowUp': -1,
        'ArrowDown': 1
    };

    /**
     * True when two child-index paths address the same node.
     *
     * @param {Array.<Number>} left
     * @param {Array.<Number>} right
     * @returns {Boolean}
     */
    function samePath(left, right) {
        return left.length === right.length && left.every(function (index, at) {
            return index === right[at];
        });
    }

    /**
     * True when moving a node of this height into this slot keeps the tree inside the depth cap.
     *
     * @param {Array.<Number>} slotPath Receiving group path plus insertion index.
     * @param {Number} nodeHeight The moved node's height (expression-tree height()).
     * @param {Number} maxDepth Deepest group level allowed, the outermost group being 1.
     * @returns {Boolean}
     */
    function slotFits(slotPath, nodeHeight, maxDepth) {
        return slotPath.length + nodeHeight <= maxDepth;
    }

    /**
     * The slots a node may move to — every slot of the model outside the node's own subtree — and
     * where the node sits among them: `before` is the gap directly above it, whose path IS the
     * node's path. The gap directly below it is always the next entry, since everything between
     * the two lies inside the node and has been left out.
     *
     * @param {Object} model Root group, index-faithful to what is rendered.
     * @param {Array.<Number>|null} nodePath The node's path; null for a node outside the tree.
     * @returns {{slots: Array.<{path: Array.<Number>}>, before: Number}|null} null when the node is
     *     not in the tree, which includes the root group: it cannot move.
     */
    function slotWalk(model, nodePath) {
        var slots;
        var before = -1;
        var i;

        if (nodePath === null) {
            return null;
        }
        slots = expressionTree.excludeSubtree(expressionTree.slotList(model), nodePath);

        for (i = 0; i < slots.length && before === -1; i++) {
            if (samePath(slots[i].path, nodePath)) {
                before = i;
            }
        }

        return before === -1 ? null : {slots: slots, before: before};
    }

    /**
     * The slots a pointer may drop the node into, in walk order: every slot but the two around the
     * node and those the depth cap refuses.
     *
     * @param {{slots: Array.<{path: Array.<Number>}>, before: Number}} walk The node's slot walk.
     * @param {Number} nodeHeight
     * @param {Number} maxDepth
     * @returns {Array.<{path: Array.<Number>}>}
     */
    function dropSlots(walk, nodeHeight, maxDepth) {
        return walk.slots.filter(function (slot, index) {
            return index !== walk.before && index !== walk.before + 1
                && slotFits(slot.path, nodeHeight, maxDepth);
        });
    }

    /**
     * The next slot one keystroke moves the node to, or null when there is none.
     *
     * Starts one slot beyond the pair describing the node's current place and skips slots the
     * depth cap refuses, so a keystroke lands on the next REACHABLE gap: a subtree too tall for a
     * nested group simply passes over it. Running off either end of the list answers null.
     *
     * @param {{slots: Array.<{path: Array.<Number>}>, before: Number}} walk The node's slot walk.
     * @param {Number} step -1 towards the start of the list, +1 towards its end.
     * @param {Number} nodeHeight
     * @param {Number} maxDepth
     * @returns {{path: Array.<Number>}|null}
     */
    function stepSlot(walk, step, nodeHeight, maxDepth) {
        var index = step < 0 ? walk.before - 1 : walk.before + 2;

        while (walk.slots[index] !== undefined) {
            if (slotFits(walk.slots[index].path, nodeHeight, maxDepth)) {
                return walk.slots[index];
            }
            index += step;
        }

        return null;
    }

    /**
     * How far a key steps a node through its slots: -1, +1, or 0 for a key that moves nothing.
     *
     * @param {String} key Normalised key name.
     * @returns {Number}
     */
    function stepForKey(key) {
        return Object.prototype.hasOwnProperty.call(KEY_STEPS, key) ? KEY_STEPS[key] : 0;
    }

    /**
     * The candidate gap nearest to a vertical position, or null without candidates.
     *
     * The layout is a single column, so a gap is a y coordinate. Of two equally near gaps the
     * FIRST wins, which in depth-first slot order is the outer one.
     *
     * @param {Array.<{y: Number}>} candidates Gaps with their on-screen y coordinate.
     * @param {Number} y Pointer position.
     * @returns {Object|null} The winning candidate itself.
     */
    function nearestSlot(candidates, y) {
        var nearest = null;
        var nearestDistance = 0;
        var distance;
        var i;

        for (i = 0; i < candidates.length; i++) {
            distance = Math.abs(candidates[i].y - y);

            if (nearest === null || distance < nearestDistance) {
                nearest = candidates[i];
                nearestDistance = distance;
            }
        }

        return nearest;
    }

    /**
     * True when a pointer position lies inside a box, its edges included; a missing box (an
     * element that is not on the page) contains nothing, so a drag over an unmeasurable builder
     * cancels rather than dropping somewhere arbitrary.
     *
     * @param {{top: Number, bottom: Number, left: Number, right: Number}|null} box
     * @param {Number} x Pointer position, horizontal.
     * @param {Number} y Pointer position, vertical.
     * @returns {Boolean}
     */
    function insideBox(box, x, y) {
        return box !== null
            && x >= box.left && x <= box.right
            && y >= box.top && y <= box.bottom;
    }

    /**
     * Where a moved node is inserted into its receiving group once it has been taken out of its
     * old place. A move within one group to a later gap shifts by the removal, so the slot index
     * keeps meaning "the gap you saw".
     *
     * @param {Boolean} sameGroup True when the node stays in its own group.
     * @param {Number} slotIndex Gap index, counted in the tree before the move.
     * @param {Number} fromIndex The node's index before the move.
     * @returns {Number}
     */
    function insertIndex(sameGroup, slotIndex, fromIndex) {
        return sameGroup && slotIndex > fromIndex ? slotIndex - 1 : slotIndex;
    }

    /**
     * Where a node now sits, counted in slots: its 1-based position and the number of places it
     * can occupy.
     *
     * Counted in slots rather than siblings, because that is what a move walks: crossing into a
     * nested group is one slot, not one sibling. The total is one less than the slots the node can
     * address, since the two around it describe the same place, which keeps the last position
     * reachable and the total the same after every move.
     *
     * @param {{slots: Array, before: Number}} walk The node's slot walk after the move.
     * @returns {{position: Number, total: Number}}
     */
    function placeOf(walk) {
        return {position: walk.before + 1, total: walk.slots.length - 1};
    }

    /**
     * True when a group at this nesting level may still take a child group: the child lands one
     * level deeper and has to fit under the cap. The authoring button asks this, the pointer and
     * the keyboard ask slotFits(), and both read the one cap, so no path nests past what another
     * allows.
     *
     * @param {Number} depth Nesting level of the asking group, the outermost being 1.
     * @param {Number} maxDepth Deepest group level allowed.
     * @returns {Boolean}
     */
    function canNestGroupAt(depth, maxDepth) {
        return depth < maxDepth;
    }

    /**
     * True when two insertion slots are the same gap: the same receiving group, by identity, and the
     * same index. No slot is never the same as one.
     *
     * @param {{group: *, index: Number}|null} left
     * @param {{group: *, index: Number}|null} right
     * @returns {Boolean}
     */
    function sameSlot(left, right) {
        return left !== null && right !== null && left.group === right.group && left.index === right.index;
    }

    /**
     * Where the gap of one insertion slot is measured on screen: the top edge of the child it
     * comes before, the bottom edge of the last child for the gap after it, and — in an empty
     * group, which has no child to measure — the top of the group's add-condition button, the
     * first thing below where a first child would appear.
     *
     * @param {Number} index Insertion index in the receiving group.
     * @param {Number} childCount How many children the receiving group holds.
     * @returns {{element: ('child'|'add'), child: (Number|undefined), edge: ('top'|'bottom')}}
     */
    function slotAnchor(index, childCount) {
        if (index < childCount) {
            return {element: 'child', child: index, edge: 'top'};
        }

        if (childCount > 0) {
            return {element: 'child', child: childCount - 1, edge: 'bottom'};
        }

        return {element: 'add', edge: 'top'};
    }

    /**
     * True when the drop indicator belongs in the gap directly above this node: the target slot
     * comes before it. A gap is named by the node that follows it, compared by identity, so asking
     * costs no walk of the tree.
     *
     * @param {{group: *, index: Number}|null} target The slot the drag is over, or null.
     * @param {*} node The node asking.
     * @param {Function} childrenOf Answers a group's children; asked only with a target.
     * @returns {Boolean}
     */
    function marksGapBefore(target, node, childrenOf) {
        return target !== null && childrenOf(target.group)[target.index] === node;
    }

    /**
     * True when the drop indicator belongs after this group's last child — the one gap no
     * following node names, and therefore the group's own to answer for. Together with
     * marksGapBefore() every slot is marked exactly once.
     *
     * @param {{group: *, index: Number}|null} target The slot the drag is over, or null.
     * @param {*} group The group asking.
     * @param {Function} childCountOf Answers how many children the group holds; asked only when the
     *     target is in this group.
     * @returns {Boolean}
     */
    function marksGapAtEnd(target, group, childCountOf) {
        return target !== null && target.group === group && target.index === childCountOf();
    }

    return {
        canNestGroupAt: canNestGroupAt,
        sameSlot: sameSlot,
        slotAnchor: slotAnchor,
        marksGapBefore: marksGapBefore,
        marksGapAtEnd: marksGapAtEnd,
        samePath: samePath,
        slotFits: slotFits,
        slotWalk: slotWalk,
        dropSlots: dropSlots,
        stepSlot: stepSlot,
        stepForKey: stepForKey,
        nearestSlot: nearestSlot,
        insideBox: insideBox,
        insertIndex: insertIndex,
        placeOf: placeOf
    };
});
