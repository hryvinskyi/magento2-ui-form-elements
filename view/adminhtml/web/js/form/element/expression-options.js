/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure model of the expression-builder's option lists.
 *
 * The recursive tree structure lives in expression-tree.js and the leaf-value shapes in
 * expression-value.js; this module owns the orthogonal concern of searching and indexing a
 * picker's option list. A hierarchy-annotated option list — entries shaped
 * {value, label, level, parent}, where a level-1 entry's parent is '' — indexes into the
 * parent/child maps a collapsible tree needs plus, per option, a breadcrumb path label and how
 * many entries sit below it. Both are derived client-side by walking the parent chain; no
 * server-side path map exists, and on a multi-thousand-entry catalog none should. Flat option
 * lists (no level/parent keys) index too: every entry becomes a root, its path is its own label
 * and it has nothing below it, so label lookups work uniformly regardless of shape.
 *
 * Two searches live here because they answer two different questions. `pathSearch` searches a
 * HIERARCHY by breadcrumb and returns matches in path order, which is the order a tree renders
 * in. `optionSearch` searches a FLAT list by label and code and returns matches in RELEVANCE
 * order, because a flat list of several hundred entries has no structure to lean on: the first
 * few rows are all an admin reads, so which rows those are is the whole experience.
 *
 * Everything is side-effect free and dependency-free — plain values in, plain values out — so
 * the same file runs in the admin bundle and under plain Node (Test/Js/run.mjs). No user-facing
 * text lives here: the path separator is data formatting, not wording.
 */
define([], function () {
    'use strict';

    /**
     * Joins breadcrumb labels, e.g. `Components › Storage › Internal Hard Drives`.
     */
    var PATH_SEPARATOR = ' › ';

    /**
     * Normalises an option's value or parent into a map key. Values arrive as strings from the
     * config but the module accepts numbers too; null and undefined read as '' — the no-parent
     * marker of a level-1 entry.
     *
     * @param {*} raw Option value or parent reference.
     * @returns {String}
     */
    function toKey(raw) {
        return raw === null || raw === undefined ? '' : String(raw);
    }

    /**
     * Indexes a hierarchy-annotated option list for tree rendering, breadcrumb lookups and
     * subtree sizes.
     *
     * Roots are the entries with no parent ('' / absent) plus any entry whose parent id is not
     * in the list — an unknown parent demotes nobody, the node simply renders at the top level
     * (orphan tolerance) and its breadcrumb stops where the chain breaks. The maps are created
     * without a prototype, so option values can never collide with Object.prototype members.
     * A malformed parent cycle terminates after one hop per option instead of hanging the page;
     * the affected breadcrumbs keep the labels collected up to that point.
     *
     * `descendantCountByValue` is produced by the same upward walk that builds the breadcrumbs —
     * every option credits +1 to each ancestor it can reach — so the whole index still costs one
     * pass over the list plus one chain climb per entry, with no second traversal and no
     * recursion. It is SPARSE: an entry with nothing below it has no key at all, which keeps the
     * map to the ancestors of a multi-thousand-entry list rather than one number per entry, and
     * makes an absent key mean zero. Counts are of ALL descendants, not of direct children.
     * Under a malformed cycle the numbers stay bounded but stop being meaningful (a node can
     * credit itself) — termination is the only guarantee that case gets.
     *
     * Sibling order everywhere follows the input order, so a path-ordered list (every parent
     * before its children) indexes into a path-ordered tree.
     *
     * @param {Array.<{value: *, label: String, level: Number, parent: *}>} options Option list;
     *     anything but an array reads as empty.
     * @returns {{
     *     roots: Array.<Object>,
     *     childrenByParent: Object.<String, Array.<Object>>,
     *     byValue: Object.<String, Object>,
     *     pathByValue: Object.<String, String>,
     *     descendantCountByValue: Object.<String, Number>
     * }} Option objects are the caller's own, never copies.
     */
    function buildTreeIndex(options) {
        var list = Array.isArray(options) ? options : [];
        var byValue = Object.create(null);
        var childrenByParent = Object.create(null);
        var pathByValue = Object.create(null);
        var descendantCountByValue = Object.create(null);
        var roots = [];
        var i;
        var option;
        var parentKey;
        var labels;
        var cursor;
        var hops;

        for (i = 0; i < list.length; i++) {
            byValue[toKey(list[i].value)] = list[i];
        }

        for (i = 0; i < list.length; i++) {
            option = list[i];
            parentKey = toKey(option.parent);

            if (parentKey === '' || byValue[parentKey] === undefined) {
                roots.push(option);
            } else {
                if (childrenByParent[parentKey] === undefined) {
                    childrenByParent[parentKey] = [];
                }
                childrenByParent[parentKey].push(option);
            }
        }

        for (i = 0; i < list.length; i++) {
            option = list[i];
            labels = [String(option.label)];
            cursor = toKey(option.parent);

            for (hops = 0; cursor !== '' && byValue[cursor] !== undefined && hops < list.length; hops++) {
                labels.unshift(String(byValue[cursor].label));
                descendantCountByValue[cursor] = (descendantCountByValue[cursor] || 0) + 1;
                cursor = toKey(byValue[cursor].parent);
            }

            pathByValue[toKey(option.value)] = labels.join(PATH_SEPARATOR);
        }

        return {
            roots: roots,
            childrenByParent: childrenByParent,
            byValue: byValue,
            pathByValue: pathByValue,
            descendantCountByValue: descendantCountByValue
        };
    }

    /**
     * Splits a search query into lower-cased whitespace-separated tokens.
     *
     * @param {*} query Raw search text; null and undefined read as ''.
     * @returns {Array.<String>}
     */
    function tokenise(query) {
        var parts = String(query === null || query === undefined ? '' : query)
            .toLowerCase()
            .split(/\s+/);
        var tokens = [];
        var i;

        for (i = 0; i < parts.length; i++) {
            if (parts[i] !== '') {
                tokens.push(parts[i]);
            }
        }

        return tokens;
    }

    /**
     * Searches an index's options by their breadcrumb path labels.
     *
     * The query splits on whitespace and an option matches when every token appears in its path
     * label, case-insensitively — so a query naming an ancestor and a leaf fragment finds the
     * leaf even when its own label is ambiguous. An option missing from pathByValue matches
     * against its own label instead. A blank query matches everything; the walk visits options
     * in path order (each parent before its children, siblings in input order) and stops as
     * soon as `cap` matches are collected, so a broad query over thousands of options never
     * scans past the cap.
     *
     * `capped` reports that the walk STOPPED EARLY — the cap was reached with options still
     * unvisited. It is deliberately not a claim that more matches exist: the unvisited remainder
     * may hold none, and finding that out would mean scanning everything the cap exists to avoid.
     * A caller wording a hint from this flag must therefore talk about the search stopping, not
     * about how many matches there are in total.
     *
     * @param {{roots: Array.<Object>, childrenByParent: Object, pathByValue: Object}} index
     *     Index produced by buildTreeIndex().
     * @param {*} query Search text.
     * @param {Number} cap Maximum number of matches; anything but a non-negative number means
     *     unlimited.
     * @returns {{items: Array.<Object>, capped: Boolean}} Matching option objects, in path order,
     *     at most `cap` of them, plus whether the walk stopped at the cap.
     */
    function pathSearch(index, query, cap) {
        var tokens = tokenise(query);
        var limit = typeof cap === 'number' && cap >= 0 ? cap : Infinity;
        var matches = [];
        var stack = [];
        var option;
        var key;
        var path;
        var haystack;
        var matched;
        var children;
        var i;

        for (i = index.roots.length - 1; i >= 0; i--) {
            stack.push(index.roots[i]);
        }

        while (stack.length > 0 && matches.length < limit) {
            option = stack.pop();
            key = toKey(option.value);
            path = index.pathByValue[key];
            haystack = String(path === undefined || path === null ? option.label : path).toLowerCase();
            matched = true;

            for (i = 0; i < tokens.length; i++) {
                if (haystack.indexOf(tokens[i]) === -1) {
                    matched = false;
                    break;
                }
            }

            if (matched) {
                matches.push(option);
            }
            children = index.childrenByParent[key];

            if (children !== undefined) {
                for (i = children.length - 1; i >= 0; i--) {
                    stack.push(children[i]);
                }
            }
        }

        return {items: matches, capped: matches.length >= limit && stack.length > 0};
    }

    /**
     * How relevant one option is to a query, as a rank where SMALLER is better.
     *
     * The tiers, in order: the query IS the code; the label starts with the query; the code starts
     * with the query; the label contains it; the code contains it; and last, the query only matches
     * as scattered tokens — every token found somewhere in the label or the code, but the query as
     * typed is nowhere in either. That last tier is what makes a two-word query useful at all: a
     * label and a code narrowed together ("dock brand" against label `Brand`, code `dock_brand`)
     * cannot be a substring of either one, and it is precisely the query that pins down ONE entry
     * among identically-labelled ones.
     *
     * Code before label only for the exact tier, label before code everywhere else: an admin who
     * types a whole code means that entry and nothing else, while an admin typing a fragment is
     * reading labels — the code is what they resort to when the labels turn out to collide.
     *
     * @param {String} label Option's label, lower-cased.
     * @param {String} code Option's value, lower-cased.
     * @param {String} query Whole query, trimmed and lower-cased; '' ranks everything equally.
     * @returns {Number} 0 (best) … 5 (matched only token-wise).
     */
    function rankOf(label, code, query) {
        if (query === '') {
            return 0;
        }

        if (code === query) {
            return 0;
        }

        if (label.indexOf(query) === 0) {
            return 1;
        }

        if (code.indexOf(query) === 0) {
            return 2;
        }

        if (label.indexOf(query) !== -1) {
            return 3;
        }

        if (code.indexOf(query) !== -1) {
            return 4;
        }

        return 5;
    }

    /**
     * Searches a FLAT option list by label and code, best matches first.
     *
     * An option matches when EVERY whitespace-separated token of the query appears in its label or
     * in its value, case-insensitively. Both halves are load-bearing on a list whose labels repeat:
     * one token finds every bearer of a label, and a second token naming part of the code narrows
     * to one — which is the only way to tell identically-labelled entries apart.
     *
     * The result is ordered by relevance (see rankOf) and ties keep INPUT order, so a list handed
     * over alphabetically stays alphabetical inside each tier. The sort is made stable explicitly,
     * by carrying each option's position into the comparison, rather than relying on the engine's
     * sort being stable.
     *
     * The whole list is scanned before the cap is applied — relevance is a property of the whole
     * match set, so a walk that stopped early could only rank what it happened to have seen. The
     * cost is one pass plus a sort over the matches, which is what a several-hundred-entry list
     * costs to render anyway; nothing here is meant for the multi-thousand-entry hierarchies
     * pathSearch exists for.
     *
     * `capped` reports that the RESULT STOPPED at the cap — matches were found that `items` does
     * not carry. It is the same flag pathSearch answers with, and a caller wording a hint from it
     * must talk about the search stopping rather than about how much was left out: the count of
     * omitted matches is deliberately not published, because a caller that renders it would invite
     * an admin to reason about a number the cap exists to make irrelevant.
     *
     * @param {Array.<{value: *, label: String}>} options Option list; anything but an array reads
     *     as empty. Hierarchy keys, if present, are ignored — this is the flat search.
     * @param {*} query Search text; blank matches everything.
     * @param {Number} cap Maximum number of matches; anything but a non-negative number means
     *     unlimited.
     * @returns {{items: Array.<Object>, capped: Boolean}} Matching option objects — the caller's
     *     own, never copies — best first, at most `cap` of them, plus whether the result was cut.
     */
    function optionSearch(options, query, cap) {
        var list = Array.isArray(options) ? options : [];
        var tokens = tokenise(query);
        var limit = typeof cap === 'number' && cap >= 0 ? cap : Infinity;
        var needle = String(query === null || query === undefined ? '' : query).toLowerCase().trim();
        var scored = [];
        var items = [];
        var option;
        var label;
        var code;
        var matched;
        var i;
        var t;

        for (i = 0; i < list.length; i++) {
            option = list[i];
            label = String(option.label === null || option.label === undefined ? '' : option.label)
                .toLowerCase();
            code = toKey(option.value).toLowerCase();
            matched = true;

            for (t = 0; t < tokens.length; t++) {
                if (label.indexOf(tokens[t]) === -1 && code.indexOf(tokens[t]) === -1) {
                    matched = false;
                    break;
                }
            }

            if (matched) {
                scored.push({option: option, rank: rankOf(label, code, needle), at: i});
            }
        }

        scored.sort(function (left, right) {
            return left.rank === right.rank ? left.at - right.at : left.rank - right.rank;
        });

        for (i = 0; i < scored.length && i < limit; i++) {
            items.push(scored[i].option);
        }

        return {items: items, capped: scored.length > items.length};
    }

    return {
        buildTreeIndex: buildTreeIndex,
        pathSearch: pathSearch,
        optionSearch: optionSearch
    };
});
