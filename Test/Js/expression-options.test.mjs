/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-options model — option-list indexing, breadcrumb search and
 * flat label/code search, the counterpart of the expression-tree (structure) and expression-value
 * (leaf values) suites. The module under test is loaded by run.mjs and handed in, so this file
 * stays a plain catalogue of named assertions.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-options module.
 *
 * @param {Object} expressionOptions The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionOptions) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    /**
     * A three-level hierarchy with a duplicate leaf name under two parents and one orphan whose
     * parent id is not in the list — the shape the category providers emit: path-ordered, plain
     * labels, level-1 entries with parent ''.
     *
     * @returns {Array.<Object>}
     */
    const categoryOptions = () => [
        {value: '3', label: 'Components', level: 1, parent: ''},
        {value: '31', label: 'Storage', level: 2, parent: '3'},
        {value: '311', label: 'Internal Hard Drives', level: 3, parent: '31'},
        {value: '312', label: 'SSDs', level: 3, parent: '31'},
        {value: '32', label: 'Memory', level: 2, parent: '3'},
        {value: '4', label: 'Networking', level: 1, parent: ''},
        {value: '41', label: 'Internal Hard Drives', level: 2, parent: '4'},
        {value: '9', label: 'Stranded', level: 3, parent: '999'}
    ];

    const values = (options) => options.map((option) => option.value);

    /**
     * Option values of a search result — pathSearch answers {items, capped}, and most assertions
     * are about which options came back in which order.
     *
     * @param {{items: Array.<Object>}} result
     * @returns {Array.<*>}
     */
    const found = (result) => values(result.items);

    /* ---------------- buildTreeIndex ---------------- */

    test('buildTreeIndex: roots, children map and value lookup for a three-level hierarchy', () => {
        const options = categoryOptions();
        const index = expressionOptions.buildTreeIndex(options);

        // Level-1 entries are roots; the orphan joins them instead of vanishing.
        assert.deepStrictEqual(values(index.roots), ['3', '4', '9']);

        assert.deepStrictEqual(values(index.childrenByParent['3']), ['31', '32']);
        assert.deepStrictEqual(values(index.childrenByParent['31']), ['311', '312']);
        assert.deepStrictEqual(values(index.childrenByParent['4']), ['41']);
        assert.strictEqual(index.childrenByParent['311'], undefined); // leaves own no entry
        assert.strictEqual(index.childrenByParent['999'], undefined); // the orphan is a root, not a child

        // byValue hands back the caller's own option objects, never copies.
        assert.strictEqual(index.byValue['311'], options[2]);
        assert.strictEqual(index.byValue['9'], options[7]);
        assert.strictEqual(index.byValue['999'], undefined);
    });

    test('buildTreeIndex: pathByValue derives breadcrumbs from the parent chain', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        assert.strictEqual(index.pathByValue['3'], 'Components');
        assert.strictEqual(index.pathByValue['31'], 'Components › Storage');
        assert.strictEqual(index.pathByValue['311'], 'Components › Storage › Internal Hard Drives');
        assert.strictEqual(index.pathByValue['41'], 'Networking › Internal Hard Drives');
        // An orphan's chain breaks immediately: its path is its own label.
        assert.strictEqual(index.pathByValue['9'], 'Stranded');
    });

    test('buildTreeIndex: descendantCountByValue counts every entry below a node, sparsely', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        // All descendants, not just direct children: Components holds Storage, its two leaves and
        // Memory.
        assert.strictEqual(index.descendantCountByValue['3'], 4);
        assert.strictEqual(index.descendantCountByValue['31'], 2);
        assert.strictEqual(index.descendantCountByValue['4'], 1);

        // Sparse: an entry with nothing below it has no key, so an absent key means zero and the
        // map stays the size of the ancestor set rather than of the whole list.
        assert.strictEqual(index.descendantCountByValue['311'], undefined);
        assert.strictEqual(index.descendantCountByValue['32'], undefined);

        // An orphan credits nothing: its chain breaks at a parent that is not in the list, and the
        // missing parent is not an entry anyone can render a count on.
        assert.strictEqual(index.descendantCountByValue['9'], undefined);
        assert.strictEqual(index.descendantCountByValue['999'], undefined);
        assert.deepStrictEqual(Object.keys(index.descendantCountByValue).sort(), ['3', '31', '4']);
    });

    test('buildTreeIndex: a cycle leaves the counts bounded rather than hanging the page', () => {
        const index = expressionOptions.buildTreeIndex([
            {value: 'a', label: 'A', level: 2, parent: 'b'},
            {value: 'b', label: 'B', level: 2, parent: 'a'}
        ]);

        // The climb is capped at one hop per option, so each node is credited by both entries. The
        // numbers are meaningless for a malformed list — that it terminates at all is the point.
        assert.strictEqual(index.descendantCountByValue['a'], 2);
        assert.strictEqual(index.descendantCountByValue['b'], 2);
    });

    test('buildTreeIndex: a flat list (no level/parent keys) indexes as all-roots with own-label paths', () => {
        const options = [
            {value: 'a', label: 'Alpha'},
            {value: 7, label: 'Seven'},
            {value: 'b', label: 'Beta'}
        ];
        const index = expressionOptions.buildTreeIndex(options);

        assert.deepStrictEqual(values(index.roots), ['a', 7, 'b']);
        assert.deepStrictEqual(Object.keys(index.childrenByParent), []);
        assert.deepStrictEqual(Object.keys(index.descendantCountByValue), []);
        assert.strictEqual(index.pathByValue['a'], 'Alpha');
        assert.strictEqual(index.pathByValue['7'], 'Seven'); // numeric values key as strings
        assert.strictEqual(index.byValue['7'], options[1]);
    });

    test('buildTreeIndex: empty and non-array input yield an empty index', () => {
        for (const input of [[], null, undefined, 'nope']) {
            const index = expressionOptions.buildTreeIndex(input);

            assert.deepStrictEqual(index.roots, []);
            assert.deepStrictEqual(Object.keys(index.childrenByParent), []);
            assert.deepStrictEqual(Object.keys(index.byValue), []);
            assert.deepStrictEqual(Object.keys(index.pathByValue), []);
            assert.deepStrictEqual(Object.keys(index.descendantCountByValue), []);
        }
    });

    test('buildTreeIndex: a malformed parent cycle terminates instead of hanging', () => {
        const index = expressionOptions.buildTreeIndex([
            {value: 'a', label: 'A', level: 2, parent: 'b'},
            {value: 'b', label: 'B', level: 2, parent: 'a'}
        ]);

        // Both parents resolve, so neither node is a root; the breadcrumb walk stops after one
        // hop per option and keeps what it collected.
        assert.deepStrictEqual(index.roots, []);
        assert.strictEqual(index.pathByValue['a'], 'A › B › A');
        assert.strictEqual(index.pathByValue['b'], 'B › A › B');
    });

    /* ---------------- pathSearch ---------------- */

    test('pathSearch: a token matches anywhere in the breadcrumb, case-insensitively, in path order', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        // An ancestor's name matches the whole subtree, parents before children.
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'components', 100)), ['3', '31', '311', '312', '32']);
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'STORAGE', 100)), ['31', '311', '312']);
        // A duplicated leaf name alone finds every bearer.
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'internal', 100)), ['311', '41']);
        assert.deepStrictEqual(expressionOptions.pathSearch(index, 'no such thing', 100).items, []);
    });

    test('pathSearch: every whitespace-separated token must appear, so ancestors disambiguate duplicates', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'storage internal', 100)), ['311']);
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'networking internal', 100)), ['41']);
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, '  Internal   drives ', 100)), ['311', '41']);
    });

    test('pathSearch: the cap stops the walk after that many matches', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'components', 2)), ['3', '31']);
        assert.deepStrictEqual(expressionOptions.pathSearch(index, 'components', 0).items, []);
    });

    test('pathSearch: `capped` reports that the walk stopped early, never that more matches exist', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        // Truncated: five options match 'components', two were collected.
        assert.strictEqual(expressionOptions.pathSearch(index, 'components', 2).capped, true);
        // A cap of zero stops before the first visit at all.
        assert.strictEqual(expressionOptions.pathSearch(index, 'components', 0).capped, true);

        // Exhausted: the walk ran out of options before the cap, so nothing was cut.
        assert.strictEqual(expressionOptions.pathSearch(index, 'components', 100).capped, false);
        assert.strictEqual(expressionOptions.pathSearch(index, 'no such thing', 100).capped, false);
        assert.strictEqual(expressionOptions.pathSearch(index, '', 100).capped, false);

        // The honest limit of the flag: 'internal' has exactly two matches, and a cap of two stops
        // the walk on the second one with an option still unvisited. `capped` says the search
        // stopped — it cannot say whether anything further would have matched, and a caller wording
        // a hint from it must not claim more matches exist.
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, 'internal', 2)), ['311', '41']);
        assert.strictEqual(expressionOptions.pathSearch(index, 'internal', 2).capped, true);

        // An empty index has nothing to stop early on, whatever the cap.
        const empty = expressionOptions.buildTreeIndex([]);
        assert.strictEqual(expressionOptions.pathSearch(empty, 'x', 0).capped, false);
    });

    test('pathSearch: a blank query matches everything up to the cap, in path order', () => {
        const index = expressionOptions.buildTreeIndex(categoryOptions());

        assert.deepStrictEqual(
            found(expressionOptions.pathSearch(index, '', 100)),
            ['3', '31', '311', '312', '32', '4', '41', '9']
        );
        assert.deepStrictEqual(found(expressionOptions.pathSearch(index, '   ', 3)), ['3', '31', '311']);
        assert.strictEqual(expressionOptions.pathSearch(index, '   ', 3).capped, true);
    });

    test('pathSearch: an option missing from pathByValue matches by its own label', () => {
        const option = {value: 'x', label: 'Fallback Label'};
        const index = {
            roots: [option],
            childrenByParent: {},
            byValue: {x: option},
            pathByValue: {}
        };

        assert.deepStrictEqual(expressionOptions.pathSearch(index, 'fallback', 100).items, [option]);
        assert.deepStrictEqual(expressionOptions.pathSearch(index, 'absent', 100).items, []);
    });

    /* ---------------- optionSearch ---------------- */

    /**
     * A flat list whose LABELS COLLIDE — the shape a product-attribute list really has: several
     * attributes share a display label and differ only by the prefix of their code, so the label
     * alone cannot identify one. Alphabetical by label, which is the order the option provider
     * emits.
     *
     * @returns {Array.<Object>}
     */
    const attributeOptions = () => [
        {value: 'brand_notes', label: 'Additional Brand Notes'},
        {value: 'desktop_brand', label: 'Brand'},
        {value: 'dock_brand', label: 'Brand'},
        {value: 'laptop_brand', label: 'Brand'},
        {value: 'monitors_brand', label: 'Brand'},
        {value: 'sku', label: 'SKU'},
        {value: 'dock_warranty', label: 'Warranty'}
    ];

    test('optionSearch: one token finds every bearer of a repeated label, in input order', () => {
        const result = expressionOptions.optionSearch(attributeOptions(), 'brand', 100);

        // The four identically-labelled entries rank ahead of the one that only CONTAINS the word,
        // and among themselves they keep the input order they arrived in.
        assert.deepStrictEqual(found(result), [
            'desktop_brand',
            'dock_brand',
            'laptop_brand',
            'monitors_brand',
            'brand_notes'
        ]);
        assert.strictEqual(result.capped, false);
    });

    test('optionSearch: every token must appear, in the label or in the code, so a code fragment narrows', () => {
        const options = attributeOptions();

        // Two tokens split across the two haystacks: 'brand' is the label, 'dock' only the code.
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'dock brand', 100)), ['dock_brand']);
        // Order inside the query is irrelevant — both tokens simply have to be found.
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'brand dock', 100)), ['dock_brand']);
        // The whole code is one token and matches the same single entry.
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'dock_brand', 100)), ['dock_brand']);
        // A token nothing carries eliminates every candidate the other token found.
        assert.deepStrictEqual(expressionOptions.optionSearch(options, 'brand tablet', 100).items, []);
    });

    test('optionSearch: matching is case-insensitive on both the label and the code', () => {
        const options = attributeOptions();

        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'DOCK BRAND', 100)), ['dock_brand']);
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'sKu', 100)), ['sku']);
    });

    test('optionSearch: ranks exact code, then label prefix, code prefix, label body, code body', () => {
        // One option per tier, deliberately in the WORST possible input order, so only the ranking
        // can produce the expected sequence.
        const options = [
            {value: 'x_note_ram', label: 'Storage note'},   // code contains  → tier 4
            {value: 'ram_speed', label: 'Speed'},           // code prefix    → tier 2
            {value: 'z9', label: 'System RAM size'},        // label contains → tier 3
            {value: 'q1', label: 'RAM type'},               // label prefix   → tier 1
            {value: 'ram', label: 'Memory'}                 // exact code     → tier 0
        ];

        assert.deepStrictEqual(
            found(expressionOptions.optionSearch(options, 'ram', 100)),
            ['ram', 'q1', 'ram_speed', 'z9', 'x_note_ram']
        );
    });

    test('optionSearch: a multi-token query ranks below every whole-query match', () => {
        const options = [
            {value: 'dock_brand', label: 'Brand'},
            {value: 'a1', label: 'Dock brand override'}
        ];

        // The second option's label carries the query verbatim (a label prefix, tier 1); the first
        // matches only because both tokens turn up across its label and code (the last tier).
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'dock brand', 100)), ['a1', 'dock_brand']);
    });

    test('optionSearch: a blank query returns the head of the list, untouched by ranking', () => {
        const options = attributeOptions();

        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, '', 3)), [
            'brand_notes',
            'desktop_brand',
            'dock_brand'
        ]);
        assert.strictEqual(expressionOptions.optionSearch(options, '', 3).capped, true);
        assert.strictEqual(expressionOptions.optionSearch(options, '   ', 100).items.length, options.length);
        assert.strictEqual(expressionOptions.optionSearch(options, '   ', 100).capped, false);
    });

    test('optionSearch: the cap cuts the ranked result and says so', () => {
        const options = attributeOptions();

        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'brand', 2)), [
            'desktop_brand',
            'dock_brand'
        ]);
        assert.strictEqual(expressionOptions.optionSearch(options, 'brand', 2).capped, true);
        // Exactly as many matches as the cap allows is not a cut.
        assert.strictEqual(expressionOptions.optionSearch(options, 'brand', 5).capped, false);
        // A cap of zero yields nothing and reports the cut, like the breadcrumb search does.
        assert.deepStrictEqual(expressionOptions.optionSearch(options, 'brand', 0).items, []);
        assert.strictEqual(expressionOptions.optionSearch(options, 'brand', 0).capped, true);
        // Nothing matched, so nothing was cut, whatever the cap.
        assert.strictEqual(expressionOptions.optionSearch(options, 'nope', 0).capped, false);
        // A cap that is not a non-negative number means unlimited.
        assert.strictEqual(expressionOptions.optionSearch(options, 'brand', null).items.length, 5);
        assert.strictEqual(expressionOptions.optionSearch(options, 'brand', null).capped, false);
    });

    test('optionSearch: numeric values search as strings and options come back by reference', () => {
        const options = [
            {value: 7, label: 'Seven'},
            {value: 42, label: 'Forty-two'},
            {value: 'x', label: null}
        ];
        const result = expressionOptions.optionSearch(options, '4', 100);

        assert.deepStrictEqual(found(result), [42]);
        assert.strictEqual(result.items[0], options[1], 'the caller keeps its own objects');
        // A label-less option is searchable by its code and never throws.
        assert.deepStrictEqual(found(expressionOptions.optionSearch(options, 'x', 100)), ['x']);
    });

    test('optionSearch: empty and non-array input yield an empty, uncapped result', () => {
        for (const input of [[], null, undefined, 'nope']) {
            assert.deepStrictEqual(expressionOptions.optionSearch(input, 'brand', 100), {items: [], capped: false});
            assert.deepStrictEqual(expressionOptions.optionSearch(input, '', 0), {items: [], capped: false});
        }
    });

    return tests;
}
