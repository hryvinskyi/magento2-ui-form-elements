/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure view state of the hierarchical option picker: which nodes are on screen, how each one
 * reads (selected, partly selected, expanded, how many entries sit below it), how the set of
 * expanded nodes changes, when the whole tree may be expanded at once, and what toggling a node
 * does to the selection.
 *
 * It works on the index expression-options.js builds once per option list, and on two pieces of
 * row state: the stored list of selected values and the map of expanded node values. Nothing here
 * scales with the size of the option list on a render: the visible nodes are walked from the
 * roots through expanded parents only, and the partly-selected state comes from one upward climb
 * per selected value — (selected values × depth) steps — instead of a downward walk per node,
 * which on a multi-thousand-entry category list is the only cost that would matter.
 *
 * Expansion maps are read by own property, so a node whose value spells an Object.prototype
 * member expands and collapses like any other.
 *
 * Side-effect free and dependency-free, so the same file runs in the admin bundle and under plain
 * Node (Test/Js/run.mjs).
 */
define([], function () {
    'use strict';

    /**
     * Left padding of a level-1 node, in pixels — almost flush with the list edge.
     */
    var ROOT_INDENT = 5;

    /**
     * Extra left padding per level below the roots, in pixels: one caret's width.
     */
    var LEVEL_INDENT = 17;

    /**
     * True when the expansion map marks this node value as expanded.
     *
     * @param {Object} expanded Node value → true.
     * @param {String} key Node value as a string.
     * @returns {Boolean}
     */
    function isExpanded(expanded, key) {
        return !!expanded && Object.prototype.hasOwnProperty.call(expanded, key) && !!expanded[key];
    }

    /**
     * How many selected values sit strictly BELOW each node, keyed by node value; nodes with
     * nothing selected below them are absent. The basis of the checkbox's partly-selected state.
     *
     * Each selected value climbs to its root and credits every ancestor once. The per-value
     * `seen` map makes a malformed parent cycle terminate at its first repeat, so an ancestor is
     * credited at most once per selected value either way.
     *
     * @param {Object} index Index from expression-options buildTreeIndex().
     * @param {Array} selected The row's stored values.
     * @returns {Object.<String, Number>}
     */
    function selectedAncestorCounts(index, selected) {
        var counts = Object.create(null);
        var i;
        var seen;
        var option;
        var key;

        for (i = 0; i < selected.length; i++) {
            option = index.byValue[String(selected[i])];
            seen = Object.create(null);

            while (option !== undefined) {
                key = option.parent === null || option.parent === undefined ? '' : String(option.parent);

                if (key === '' || seen[key] === true) {
                    break;
                }
                seen[key] = true;
                counts[key] = (counts[key] || 0) + 1;
                option = index.byValue[key];
            }
        }

        return counts;
    }

    /**
     * The nodes on screen, depth-first: every root, and a node's children only while the node is
     * expanded. Each wraps one option with what the picker renders:
     * {value, label, level, indent, hasChildren, expanded, selected, mixed, selectedInside,
     * descendants}.
     *
     * Selected nodes stay on screen and stay clickable — the picker toggles both ways, and hiding
     * one would break the tree under it. A selected node reads as selected, never as partly
     * selected: its own state is the definite one, whatever sits below it. `indent` is the row's
     * left padding, so the selection edge and the hover wash still span the full row.
     *
     * @param {Object} index Index from expression-options buildTreeIndex().
     * @param {Object} expanded Node value → true for every expanded node.
     * @param {Array} selected The row's stored values.
     * @returns {Array.<Object>}
     */
    function visibleNodes(index, expanded, selected) {
        var selectedSet = Object.create(null);
        var insideCounts = selectedAncestorCounts(index, selected);
        var nodes = [];
        var i;

        /**
         * @param {Object} option
         * @returns {void}
         */
        function visit(option) {
            var key = String(option.value);
            var children = index.childrenByParent[key] || [];
            var open = isExpanded(expanded, key);
            var isSelected = selectedSet[key] === true;
            var inside = insideCounts[key] || 0;

            nodes.push({
                value: option.value,
                label: option.label,
                level: option.level,
                indent: (Math.max((Number(option.level) || 1) - 1, 0) * LEVEL_INDENT + ROOT_INDENT) + 'px',
                hasChildren: children.length > 0,
                expanded: open,
                selected: isSelected,
                mixed: !isSelected && inside > 0,
                selectedInside: inside,
                descendants: index.descendantCountByValue[key] || 0
            });

            if (open) {
                children.forEach(visit);
            }
        }

        for (i = 0; i < selected.length; i++) {
            selectedSet[String(selected[i])] = true;
        }
        index.roots.forEach(visit);

        return nodes;
    }

    /**
     * The expansion map with one node flipped: expanded when it was collapsed, collapsed when it
     * was expanded. A fresh map every time, never the one passed in.
     *
     * @param {Object} expanded Node value → true.
     * @param {*} value The node to flip.
     * @returns {Object}
     */
    function toggleExpansion(expanded, value) {
        var key = String(value);
        var next = Object.create(null);

        Object.keys(expanded || {}).forEach(function (existing) {
            next[existing] = expanded[existing];
        });

        if (isExpanded(next, key)) {
            delete next[key];
        } else {
            next[key] = true;
        }

        return next;
    }

    /**
     * The expansion map with every branch open: exactly the index's parent values, so nothing is
     * walked and no node is visited twice.
     *
     * @param {Object} index Index from expression-options buildTreeIndex().
     * @returns {Object}
     */
    function expandAll(index) {
        var expanded = Object.create(null);

        Object.keys(index.childrenByParent).forEach(function (key) {
            expanded[key] = true;
        });

        return expanded;
    }

    /**
     * The breadcrumb label of one value — ancestors joined down to the option's own label — or the
     * option's own label when it has no breadcrumb, or the value itself when no option carries it
     * or there is no index.
     *
     * @param {Object|null} index Index from expression-options buildTreeIndex().
     * @param {*} value
     * @returns {String}
     */
    function pathLabel(index, value) {
        var key = String(value);

        if (index) {
            if (index.pathByValue[key] !== undefined) {
                return index.pathByValue[key];
            }

            if (index.byValue[key] !== undefined) {
                return String(index.byValue[key].label);
            }
        }

        return key;
    }

    /**
     * True when a row's tree may be expanded in one action: the tree is on screen and its list is
     * no larger than the limit. Expanding everything renders every node at once, and on a
     * multi-thousand-entry catalogue that is one synchronous render the form stops responding to,
     * so above the limit the per-node carets and the arrow keys are the way into a branch.
     * Collapsing has no limit: it only ever removes rows.
     *
     * @param {{showsTree: Function, optionCount: Function}} probe `optionCount()` is asked only
     *     for a tree on screen.
     * @param {Number} limit Largest list expanded in one action.
     * @returns {Boolean}
     */
    function canExpandAll(probe, limit) {
        return probe.showsTree() && probe.optionCount() <= limit;
    }

    /**
     * What a click or Space on a tree node does to the row's selection: a selected node is
     * deselected, any other is selected — so the node itself is the undo of a mis-click. Only the
     * node's own value moves, never its descendants'.
     *
     * @param {Boolean} selected The row's value holds the node now.
     * @returns {('deselect'|'select')}
     */
    function selectionToggle(selected) {
        return selected ? 'deselect' : 'select';
    }

    return {
        canExpandAll: canExpandAll,
        selectionToggle: selectionToggle,
        selectedAncestorCounts: selectedAncestorCounts,
        visibleNodes: visibleNodes,
        toggleExpansion: toggleExpansion,
        expandAll: expandAll,
        pathLabel: pathLabel
    };
});
