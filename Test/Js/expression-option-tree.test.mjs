/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-option-tree module — the hierarchical picker's view state.
 * The module under test is loaded by run.mjs and handed in, with the options module whose index it
 * reads.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-option-tree module.
 *
 * @param {Object} expressionOptionTree The module's export object.
 * @param {Object} expressionOptions The options module, to build the index as the component does.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionOptionTree, expressionOptions) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    /**
     * A two-root hierarchy, three levels deep under the first root, with one node whose value spells
     * an Object.prototype member.
     *
     * @returns {Object} The index of it.
     */
    const index = () => expressionOptions.buildTreeIndex([
        {value: '3', label: 'Components', level: 1, parent: ''},
        {value: '31', label: 'Storage', level: 2, parent: '3'},
        {value: '311', label: 'SSDs', level: 3, parent: '31'},
        {value: '312', label: 'Drives', level: 3, parent: '31'},
        {value: '32', label: 'Memory', level: 2, parent: '3'},
        {value: 'constructor', label: 'Odd', level: 1, parent: ''},
        {value: 'c1', label: 'Child', level: 2, parent: 'constructor'}
    ]);
    const values = (nodes) => nodes.map((node) => node.value);

    test('visibleNodes: roots always, children only under an expanded parent', () => {
        assert.deepStrictEqual(values(expressionOptionTree.visibleNodes(index(), {}, [])), ['3', 'constructor']);
        assert.deepStrictEqual(values(expressionOptionTree.visibleNodes(index(), {3: true}, [])), ['3', '31', '32', 'constructor']);
        assert.deepStrictEqual(values(expressionOptionTree.visibleNodes(index(), {3: true, 31: true}, [])),
            ['3', '31', '311', '312', '32', 'constructor']);
    });

    test('visibleNodes: a node valued like a prototype member is collapsed until expanded', () => {
        assert.deepStrictEqual(values(expressionOptionTree.visibleNodes(index(), {}, [])), ['3', 'constructor']);
        assert.deepStrictEqual(values(expressionOptionTree.visibleNodes(index(), {constructor: true}, [])),
            ['3', 'constructor', 'c1']);
    });

    test('visibleNodes: each node carries what the picker renders', () => {
        const [root, storage] = expressionOptionTree.visibleNodes(index(), {3: true}, ['311']);

        assert.deepStrictEqual(root, {
            value: '3', label: 'Components', level: 1, indent: '5px', hasChildren: true, expanded: true,
            selected: false, mixed: true, selectedInside: 1, descendants: 4
        });
        assert.deepStrictEqual(storage, {
            value: '31', label: 'Storage', level: 2, indent: '22px', hasChildren: true, expanded: false,
            selected: false, mixed: true, selectedInside: 1, descendants: 2
        });
    });

    test('visibleNodes: a selected node reads as selected, never as partly selected', () => {
        const [root] = expressionOptionTree.visibleNodes(index(), {}, ['3', '311']);

        assert.strictEqual(root.selected, true);
        assert.strictEqual(root.mixed, false);
        assert.strictEqual(root.selectedInside, 1);
    });

    test('selectedAncestorCounts: every ancestor of a selected value is credited once per value', () => {
        const counts = expressionOptionTree.selectedAncestorCounts(index(), ['311', '312', '32', 'unknown']);

        assert.strictEqual(counts['3'], 3);
        assert.strictEqual(counts['31'], 2);
        assert.strictEqual(counts['311'], undefined);
        assert.strictEqual(counts['32'], undefined);
    });

    test('selectedAncestorCounts: a malformed parent cycle terminates', () => {
        const cyclic = expressionOptions.buildTreeIndex([
            {value: 'a', label: 'A', level: 1, parent: 'b'},
            {value: 'b', label: 'B', level: 1, parent: 'a'}
        ]);

        assert.deepStrictEqual(Object.assign({}, expressionOptionTree.selectedAncestorCounts(cyclic, ['a'])), {b: 1, a: 1});
    });

    test('toggleExpansion: flips one node in a fresh map, a prototype-named node included', () => {
        const start = {3: true};
        const opened = expressionOptionTree.toggleExpansion(start, '31');
        const closed = expressionOptionTree.toggleExpansion(opened, 3);

        assert.deepStrictEqual(Object.keys(opened).sort(), ['3', '31']);
        assert.deepStrictEqual(Object.keys(closed), ['31']);
        assert.deepStrictEqual(Object.keys(start), ['3'], 'the map passed in is never changed');
        assert.deepStrictEqual(Object.keys(expressionOptionTree.toggleExpansion({}, 'constructor')), ['constructor']);
        assert.deepStrictEqual(Object.keys(expressionOptionTree.toggleExpansion({constructor: true}, 'constructor')), []);
    });

    test('expandAll: exactly the parents', () => {
        assert.deepStrictEqual(Object.keys(expressionOptionTree.expandAll(index())).sort(), ['3', '31', 'constructor']);
    });

    test('pathLabel: the breadcrumb, else the own label, else the value itself', () => {
        const idx = index();

        assert.strictEqual(expressionOptionTree.pathLabel(idx, '311'), 'Components › Storage › SSDs');
        assert.strictEqual(expressionOptionTree.pathLabel(idx, 'unknown'), 'unknown');
        assert.strictEqual(expressionOptionTree.pathLabel(null, 311), '311');

        delete idx.pathByValue['32'];
        assert.strictEqual(expressionOptionTree.pathLabel(idx, '32'), 'Memory');
    });

    test('canExpandAll: a tree on screen no larger than the limit; the size is asked only for a tree', () => {
        const probe = (showsTree, optionCount) => {
            const asked = [];

            return {
                asked,
                showsTree: () => asked.push('showsTree') && showsTree,
                optionCount: () => asked.push('optionCount') && optionCount
            };
        };
        const flatList = probe(false, 10);

        assert.strictEqual(expressionOptionTree.canExpandAll(probe(true, 200), 200), true, 'the limit itself still expands');
        assert.strictEqual(expressionOptionTree.canExpandAll(probe(true, 201), 200), false);
        assert.strictEqual(expressionOptionTree.canExpandAll(flatList, 200), false);
        assert.deepStrictEqual(flatList.asked, ['showsTree']);
    });

    test('selectionToggle: a selected node is deselected, any other selected', () => {
        assert.strictEqual(expressionOptionTree.selectionToggle(true), 'deselect');
        assert.strictEqual(expressionOptionTree.selectionToggle(false), 'select');
    });

    return tests;
}
