/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure recursive model of the expression-builder's condition tree.
 *
 * The serialised field value is a nested Magento condition tree: Combine nodes nesting to arbitrary
 * depth with leaf condition objects between them. This module converts that tree to and from a plain
 * recursive group model, answers structural questions about the model (which conditions a node is
 * guaranteed to hold under, group enumeration, node movement, insertion slots) and runs the
 * satisfiability check over same-attribute constraint rows. Structure only: everything about the
 * values inside a leaf — editor shapes, typed-editor detection, validators — lives in its sibling
 * expression-value.js. Everything here is side-effect free and framework-free — plain objects in,
 * plain objects out — so the same file runs in the admin bundle and under plain Node
 * (`Test/Js/run.mjs`).
 */
define(['underscore'], function (_) {
    'use strict';

    /**
     * @typedef {Object} GroupNode
     * @property {'group'} kind
     * @property {('all'|'any')} aggregator 'all' = every child must hold, 'any' = at least one.
     * @property {Array.<GroupNode|ConditionNode>} children
     */

    /**
     * @typedef {Object} ConditionNode
     * @property {'condition'} kind
     * @property {Object} condition Leaf condition object, carried verbatim — this module never
     *     inspects or rewrites it beyond handing it back on serialisation.
     */

    /**
     * True when the value is a non-null object (arrays included).
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isObjectLike(value) {
        return !!value && typeof value === 'object';
    }

    /**
     * True when the value is a group node.
     *
     * @param {*} node
     * @returns {Boolean}
     */
    function isGroup(node) {
        return isObjectLike(node) && node.kind === 'group';
    }

    /**
     * True when the value is a usable child index (non-negative integer).
     *
     * @param {*} value
     * @returns {Boolean}
     */
    function isIndex(value) {
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
    }

    /**
     * Collapses any aggregator value to the two the model knows: exactly 'any' stays 'any',
     * everything else — including a missing or unknown value — reads as 'all'.
     *
     * @param {*} aggregator
     * @returns {('all'|'any')}
     */
    function normaliseAggregator(aggregator) {
        return aggregator === 'any' ? 'any' : 'all';
    }

    /**
     * Builds a Combine node in the frozen serialisation shape.
     *
     * Property insertion order is load-bearing: the field value is produced by JSON.stringify, so
     * this exact order — type, attribute, operator, value, is_value_processed, aggregator,
     * conditions — is what makes a load→save cycle over an unchanged rule byte-identical and keeps
     * the form from going dirty on open.
     *
     * @param {String} combineType Condition class name stored in the Combine's `type`.
     * @param {('all'|'any')} aggregator
     * @param {Array.<Object>} children Serialised child conditions.
     * @returns {Object} Combine node.
     */
    function buildCombine(combineType, aggregator, children) {
        return {
            type: combineType,
            attribute: null,
            operator: null,
            value: '1',
            is_value_processed: null,
            aggregator: aggregator,
            conditions: children
        };
    }

    /**
     * Converts a stored condition tree into the recursive group model.
     *
     * A child whose `type` equals `combineType` recurses into a group; every other child is kept as
     * a leaf verbatim — whitelisting condition types is the server's concern, not this model's.
     * Malformed input never throws: a missing or non-array `conditions` yields an empty group, a
     * null child is skipped, an unknown aggregator reads as 'all'. Any stored shape loads
     * losslessly, nested Combines included.
     *
     * @param {*} tree Parsed condition tree (the JSON-decoded field value).
     * @param {String} combineType Condition class name that marks Combine nodes.
     * @returns {GroupNode} Root group (possibly childless).
     */
    function treeToModel(tree, combineType) {
        var source = isObjectLike(tree) ? tree : {};
        var children = [];

        if (_.isArray(source.conditions)) {
            _.each(source.conditions, function (child) {
                if (child === null || child === undefined) {
                    return;
                }

                if (isObjectLike(child) && child.type === combineType) {
                    children.push(treeToModel(child, combineType));
                } else {
                    children.push({kind: 'condition', condition: child});
                }
            });
        }

        return {
            kind: 'group',
            aggregator: normaliseAggregator(source.aggregator),
            children: children
        };
    }

    /**
     * Serialises one group of the model into condition-tree form, dropping empty groups.
     *
     * @param {GroupNode} group
     * @param {String} combineType Condition class name to write into Combine nodes.
     * @returns {Object|null} Combine node, or null when the group has no surviving children.
     */
    function combineFromGroup(group, combineType) {
        var children = [];

        _.each(group.children || [], function (child) {
            if (isGroup(child)) {
                var nested = combineFromGroup(child, combineType);

                if (nested !== null) {
                    children.push(nested);
                }
            } else if (isObjectLike(child) && child.kind === 'condition') {
                children.push(child.condition);
            }
        });

        if (children.length === 0) {
            return null;
        }

        return buildCombine(combineType, normaliseAggregator(group.aggregator), children);
    }

    /**
     * Converts the recursive group model back into the stored condition tree.
     *
     * Inverse of treeToModel. Groups left without children are dropped recursively — a group whose
     * children all dropped drops too — except the root, which is always returned as a Combine
     * object even when childless (mapping the childless root to the field's empty value is the
     * component's decision, not this module's).
     *
     * @param {GroupNode} model Root group.
     * @param {String} combineType Condition class name to write into Combine nodes.
     * @returns {Object} Combine node.
     */
    function modelToTree(model, combineType) {
        var root = isGroup(model) ? model : {kind: 'group', aggregator: 'all', children: []};
        var serialised = combineFromGroup(root, combineType);

        return serialised !== null
            ? serialised
            : buildCombine(combineType, normaliseAggregator(root.aggregator), []);
    }

    /**
     * The condition nodes guaranteed to hold whenever the group holds.
     *
     * Only an 'all' group guarantees anything: its direct condition children plus, recursively, the
     * closure of every direct child group that is itself 'all'. Children of an 'any' group are
     * alternatives, not guarantees, so an 'any' group contributes nothing and yields [].
     *
     * @param {GroupNode} group
     * @returns {Array.<ConditionNode>} Guaranteed condition nodes, depth-first.
     */
    function conjunctiveClosure(group) {
        var closure = [];

        if (!isGroup(group) || group.aggregator !== 'all') {
            return closure;
        }

        _.each(group.children || [], function (child) {
            if (isObjectLike(child) && child.kind === 'condition') {
                closure.push(child);
            } else if (isGroup(child) && child.aggregator === 'all') {
                closure = closure.concat(conjunctiveClosure(child));
            }
        });

        return closure;
    }

    /**
     * The condition nodes guaranteed to hold whenever the node addressed by `path` is relevant.
     *
     * Walks the ancestor chain from the root. Every ancestor group with aggregator 'all' (the
     * immediate parent included) contributes each direct child that does not lie on `path`: a
     * condition child contributes itself, an 'all' child group contributes its conjunctiveClosure,
     * an 'any' child group contributes nothing. Ancestors with aggregator 'any' contribute nothing
     * at all — their other children are alternatives to the branch the path descends into.
     *
     * The closure step keeps nested context honest: in all(all(ctx), node) the inner group's ctx is
     * guaranteed for node exactly as a direct sibling would be.
     *
     * A path that cannot be followed (index off the end, descent through a leaf) stops the walk;
     * the contributions of the ancestors already visited are returned and nothing throws.
     *
     * @param {GroupNode} model Root group.
     * @param {Array.<Number>} path Child indexes from the root to the addressed node.
     * @returns {Array.<ConditionNode>} Guaranteed condition nodes, outermost ancestor first.
     */
    function conjunctiveScope(model, path) {
        var scope = [];
        var current = isGroup(model) ? model : null;
        var indexes = _.isArray(path) ? path : [];
        var depth;
        var onPathIndex;
        var next;

        for (depth = 0; current !== null && depth < indexes.length; depth++) {
            onPathIndex = indexes[depth];

            if (current.aggregator === 'all') {
                /* eslint-disable no-loop-func */
                _.each(current.children || [], function (child, idx) {
                    if (idx === onPathIndex) {
                        return;
                    }

                    if (isObjectLike(child) && child.kind === 'condition') {
                        scope.push(child);
                    } else if (isGroup(child) && child.aggregator === 'all') {
                        scope = scope.concat(conjunctiveClosure(child));
                    }
                });
                /* eslint-enable no-loop-func */
            }

            next = (current.children || [])[onPathIndex];
            current = isGroup(next) ? next : null;
        }

        return scope;
    }

    /**
     * Enumerates every group in the model depth-first, root first.
     *
     * @param {GroupNode} model Root group.
     * @returns {Array.<{group: GroupNode, path: Array.<Number>, number: Number}>} `path` addresses
     *     the group from the root ([] for the root itself); `number` is 1-based in depth-first
     *     order — a stable display numbering for per-group messages.
     */
    function groupsWithPaths(model) {
        var result = [];

        /**
         * @param {GroupNode} group
         * @param {Array.<Number>} path
         * @returns {void}
         */
        function walk(group, path) {
            result.push({group: group, path: path, number: result.length + 1});

            _.each(group.children || [], function (child, idx) {
                if (isGroup(child)) {
                    walk(child, path.concat([idx]));
                }
            });
        }

        if (isGroup(model)) {
            walk(model, []);
        }

        return result;
    }

    /**
     * Structural copy of a model node: fresh group objects and children arrays, condition nodes
     * shared by reference — this module treats leaf payloads as opaque and never mutates them.
     *
     * @param {GroupNode|ConditionNode} node
     * @returns {GroupNode|ConditionNode}
     */
    function cloneModel(node) {
        if (!isGroup(node)) {
            return node;
        }

        return {
            kind: 'group',
            aggregator: node.aggregator,
            children: _.map(node.children || [], cloneModel)
        };
    }

    /**
     * Resolves a path to the group it addresses, or null when any step leaves the tree or the
     * addressed node is not a group.
     *
     * @param {GroupNode} root
     * @param {Array.<Number>} path
     * @returns {GroupNode|null}
     */
    function resolveGroup(root, path) {
        var current = root;
        var i;

        for (i = 0; i < path.length; i++) {
            if (!isGroup(current) || !isIndex(path[i])) {
                return null;
            }
            current = (current.children || [])[path[i]];
        }

        return isGroup(current) ? current : null;
    }

    /**
     * True when `prefix` addresses the same node as `path` or an ancestor of it.
     *
     * @param {Array.<Number>} prefix
     * @param {Array.<Number>} path
     * @returns {Boolean}
     */
    function pathIsPrefix(prefix, path) {
        var i;

        if (prefix.length > path.length) {
            return false;
        }

        for (i = 0; i < prefix.length; i++) {
            if (prefix[i] !== path[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Moves a node to an insertion slot, immutably.
     *
     * `fromPath` addresses the node; `toPath` is a slot — the path of the receiving group plus the
     * insertion index into its children (0…length), both expressed against the model BEFORE the
     * move. A move within one group compensates for the removal shift, so the slot index means
     * "the gap you saw", not "the gap after removal". Aggregators are never touched — they belong
     * to groups, and moving a node must never rewrite the logic around it.
     *
     * @param {GroupNode} model Root group; never modified.
     * @param {Array.<Number>} fromPath Path of the node to move (never the root).
     * @param {Array.<Number>} toPath Receiving group path plus insertion index.
     * @returns {GroupNode|null} The new root group, or null when either path is out of range or
     *     the slot lies inside the moved node's own subtree.
     */
    function moveNode(model, fromPath, toPath) {
        if (!_.isArray(fromPath) || !_.isArray(toPath) || fromPath.length === 0 || toPath.length === 0) {
            return null;
        }

        var slotGroupPath = toPath.slice(0, -1);
        var slotIndex = toPath[toPath.length - 1];

        if (pathIsPrefix(fromPath, slotGroupPath)) {
            return null;
        }

        var root = cloneModel(model);

        if (!isGroup(root)) {
            return null;
        }

        var sourceGroup = resolveGroup(root, fromPath.slice(0, -1));
        var fromIndex = fromPath[fromPath.length - 1];

        if (sourceGroup === null || !isIndex(fromIndex) || fromIndex >= sourceGroup.children.length) {
            return null;
        }

        var targetGroup = resolveGroup(root, slotGroupPath);

        if (targetGroup === null || !isIndex(slotIndex) || slotIndex > targetGroup.children.length) {
            return null;
        }

        var node = sourceGroup.children[fromIndex];
        sourceGroup.children.splice(fromIndex, 1);

        var insertIndex = slotIndex;

        if (targetGroup === sourceGroup && slotIndex > fromIndex) {
            insertIndex -= 1;
        }
        targetGroup.children.splice(insertIndex, 0, node);

        return root;
    }

    /**
     * Depth-first list of every insertion slot in the model.
     *
     * Each group contributes one slot per gap between its children, first (index 0) and last
     * (index length) included; a slot's path is the receiving group's path plus the insertion
     * index — exactly the `toPath` moveNode takes. A group's slot at index i precedes the slots
     * inside its i-th child, so walking the list front to back visits the gaps in visual order.
     *
     * @param {GroupNode} model Root group.
     * @returns {Array.<{path: Array.<Number>}>}
     */
    function slotList(model) {
        var slots = [];

        /**
         * @param {GroupNode} group
         * @param {Array.<Number>} path
         * @returns {void}
         */
        function walk(group, path) {
            var children = group.children || [];
            var i;

            for (i = 0; i <= children.length; i++) {
                slots.push({path: path.concat([i])});

                if (i < children.length && isGroup(children[i])) {
                    walk(children[i], path.concat([i]));
                }
            }
        }

        if (isGroup(model)) {
            walk(model, []);
        }

        return slots;
    }

    /**
     * Filters a slot list down to the slots a node may move to without entering its own subtree.
     *
     * Removes ONLY the slots lying inside the node; the two no-op slots directly around the node
     * (before and after it in its own parent) stay in the list — whether to skip or idle on them
     * is the caller's decision, not this module's.
     *
     * @param {Array.<{path: Array.<Number>}>} slots Slot list in slotList's output shape.
     * @param {Array.<Number>} nodePath Path of the node being moved.
     * @returns {Array.<{path: Array.<Number>}>}
     */
    function excludeSubtree(slots, nodePath) {
        return _.filter(slots, function (slot) {
            return !(slot.path.length > nodePath.length && pathIsPrefix(nodePath, slot.path));
        });
    }

    /**
     * Satisfiability check over constraint rows that all target one shared attribute.
     *
     * Tracks the set of values still possible after applying every row in order: `==` narrows to a
     * single value, `!=` excludes one value, `()` intersects with a set, `!()` excludes a set. The
     * rows contradict when no value can satisfy all of them — two different equalities, an equality
     * against an exclusion of the same value, membership sets with an empty intersection, or an
     * exclusion removing the last remaining possibility.
     *
     * @param {Array.<{operator: String, value: *}>} contextRows Operator/value pairs of the rows
     *     to check together; values may be scalars, CSV strings or arrays.
     * @returns {Boolean} True when the rows can never hold at the same time.
     */
    function solveContradictions(contextRows) {
        var possible = null; // null means unconstrained
        var excluded = {};
        var contradiction = false;

        _.each(contextRows, function (row) {
            if (contradiction) return;
            var op = row.operator;
            var value = row.value;
            var listedValues = _.isArray(value) ? _.map(value, String) : (value ? String(value).split(',') : []);

            if (op === '==') {
                var val = String(value);
                if (excluded[val]) { contradiction = true; return; }
                if (possible === null) {
                    possible = {}; possible[val] = true;
                } else if (!possible[val]) {
                    contradiction = true;
                } else {
                    possible = {}; possible[val] = true;
                }
            } else if (op === '!=') {
                var val2 = String(value);
                excluded[val2] = true;
                if (possible && possible[val2]) {
                    delete possible[val2];
                    if (_.keys(possible).length === 0) contradiction = true;
                }
            } else if (op === '()') {
                if (listedValues.length === 0) return;
                var set = {};
                _.each(listedValues, function (v) { if (!excluded[v]) set[v] = true; });
                if (_.keys(set).length === 0) { contradiction = true; return; }
                if (possible === null) {
                    possible = set;
                } else {
                    var intersection = {};
                    _.each(_.keys(set), function (k) { if (possible[k]) intersection[k] = true; });
                    if (_.keys(intersection).length === 0) contradiction = true;
                    possible = intersection;
                }
            } else if (op === '!()') {
                _.each(listedValues, function (v) { excluded[v] = true; });
                if (possible) {
                    _.each(listedValues, function (v) { delete possible[v]; });
                    if (_.keys(possible).length === 0) contradiction = true;
                }
            }
        });

        return contradiction;
    }

    return {
        treeToModel: treeToModel,
        modelToTree: modelToTree,
        conjunctiveClosure: conjunctiveClosure,
        conjunctiveScope: conjunctiveScope,
        groupsWithPaths: groupsWithPaths,
        moveNode: moveNode,
        slotList: slotList,
        excludeSubtree: excludeSubtree,
        solveContradictions: solveContradictions
    };
});
