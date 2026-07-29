/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-tree model. The module under test is loaded by run.mjs and
 * handed in, so this file stays a plain catalogue of named assertions.
 */
import assert from 'node:assert/strict';

const COMBINE = 'test/combine';
const LEAF = 'test/condition';

/**
 * Leaf condition object in the exact property order the component writes.
 *
 * @param {String} attribute
 * @param {String} operator
 * @param {*} value
 * @returns {Object}
 */
function leaf(attribute, operator, value) {
    return {type: LEAF, attribute, operator, value, is_value_processed: null};
}

/**
 * Combine node in the exact property order the component writes.
 *
 * @param {String} aggregator
 * @param {Array.<Object>} conditions
 * @returns {Object}
 */
function combine(aggregator, conditions) {
    return {
        type: COMBINE,
        attribute: null,
        operator: null,
        value: '1',
        is_value_processed: null,
        aggregator,
        conditions
    };
}

/**
 * Group model node.
 *
 * @param {String} aggregator
 * @param {...Object} children
 * @returns {Object}
 */
function group(aggregator, ...children) {
    return {kind: 'group', aggregator, children};
}

/**
 * Condition model node.
 *
 * @param {Object} cond
 * @returns {Object}
 */
function condition(cond) {
    return {kind: 'condition', condition: cond};
}

/**
 * Builds the full test list against a loaded expression-tree module.
 *
 * @param {Object} expressionTree The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionTree) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    /* ---------------- treeToModel ---------------- */

    test('treeToModel: legacy DNF tree (any-root of all-Combines plus a bare leaf) maps to nested groups', () => {
        const a = leaf('a', '==', '1');
        const b = leaf('b', '==', '2');
        const c = leaf('c', '==', '3');
        const d = leaf('d', '==', '4');
        const stored = combine('any', [combine('all', [a, b]), combine('all', [c]), d]);

        assert.deepStrictEqual(expressionTree.treeToModel(stored, COMBINE), group('any',
            group('all', condition(a), condition(b)),
            group('all', condition(c)),
            condition(d)
        ));
    });

    test('treeToModel: nested any-Combine under an all-root is preserved as a nested group (silent-drop regression)', () => {
        const a = leaf('a', '==', '1');
        const b = leaf('b', '==', '2');
        const c = leaf('c', '==', '3');
        const stored = combine('all', [a, combine('any', [b, c])]);

        assert.deepStrictEqual(
            expressionTree.treeToModel(stored, COMBINE),
            group('all', condition(a), group('any', condition(b), condition(c)))
        );
    });

    test('treeToModel: unknown aggregator falls back to "all"', () => {
        const a = leaf('a', '==', '1');
        const model = expressionTree.treeToModel(combine('weird', [a, combine(undefined, [a])]), COMBINE);

        assert.strictEqual(model.aggregator, 'all');
        assert.strictEqual(model.children[1].aggregator, 'all');
    });

    test('treeToModel: leaf-only root becomes a single group of condition children', () => {
        const a = leaf('a', '==', '1');
        const b = leaf('b', '!=', '2');

        assert.deepStrictEqual(
            expressionTree.treeToModel(combine('all', [a, b]), COMBINE),
            group('all', condition(a), condition(b))
        );
    });

    test('treeToModel: malformed input degrades to empty groups instead of throwing', () => {
        assert.deepStrictEqual(
            expressionTree.treeToModel({type: COMBINE, aggregator: 'all', conditions: 'x'}, COMBINE),
            group('all')
        );
        assert.deepStrictEqual(expressionTree.treeToModel(null, COMBINE), group('all'));
        assert.strictEqual(
            expressionTree.treeToModel(combine('all', [null, leaf('a', '==', '1')]), COMBINE).children.length,
            1
        );
    });

    /* ---------------- modelToTree ---------------- */

    test('modelToTree: inverts treeToModel byte-identically on the legacy DNF tree', () => {
        const stored = combine('any', [
            combine('all', [leaf('a', '==', '1'), leaf('b', '==', '2')]),
            combine('all', [leaf('c', '==', '3')]),
            leaf('d', '==', '4')
        ]);
        const back = expressionTree.modelToTree(expressionTree.treeToModel(stored, COMBINE), COMBINE);

        assert.strictEqual(JSON.stringify(back), JSON.stringify(stored));
    });

    test('modelToTree: inverts the nested-group fixture byte-identically', () => {
        const stored = combine('all', [
            leaf('a', '==', '1'),
            combine('any', [leaf('b', '==', '2'), leaf('c', '==', '3')])
        ]);
        const back = expressionTree.modelToTree(expressionTree.treeToModel(stored, COMBINE), COMBINE);

        assert.strictEqual(JSON.stringify(back), JSON.stringify(stored));
    });

    test('modelToTree: empty groups are dropped recursively', () => {
        const a = leaf('a', '==', '1');
        const model = group('all', condition(a), group('any'), group('any', group('all')));

        assert.deepStrictEqual(expressionTree.modelToTree(model, COMBINE), combine('all', [a]));
    });

    test('modelToTree: childless root still serialises to a Combine object', () => {
        assert.deepStrictEqual(expressionTree.modelToTree(group('all'), COMBINE), combine('all', []));
        assert.deepStrictEqual(expressionTree.modelToTree(group('any'), COMBINE), combine('any', []));
    });

    test('modelToTree: Combine property order is the frozen serialisation order', () => {
        const tree = expressionTree.modelToTree(group('any', condition(leaf('a', '==', '1'))), COMBINE);

        assert.deepStrictEqual(
            Object.keys(tree),
            ['type', 'attribute', 'operator', 'value', 'is_value_processed', 'aggregator', 'conditions']
        );
    });

    test('modelToTree: a single-child group is kept as authored, never collapsed', () => {
        const a = leaf('a', '==', '1');
        const model = group('any', group('all', condition(a)));

        assert.deepStrictEqual(expressionTree.modelToTree(model, COMBINE), combine('any', [combine('all', [a])]));
    });

    test('round-trip: a leaf stored with is_value_processed false comes back byte-identically', () => {
        // The PHP rule framework writes that key from a flag it reads back under a different name, so
        // every leaf that has ever been saved by PHP is stored with `false` where a freshly authored
        // one carries null. Leaves are opaque payloads to this model — it must carry whatever it was
        // given rather than normalise it, or opening a form would rewrite the value and mark it dirty.
        const processed = {type: LEAF, attribute: 'a', operator: '==', value: '1', is_value_processed: false};
        const stored = combine('all', [processed, leaf('b', '==', '2')]);
        const model = expressionTree.treeToModel(stored, COMBINE);

        assert.strictEqual(model.children[0].condition.is_value_processed, false);
        assert.strictEqual(JSON.stringify(expressionTree.modelToTree(model, COMBINE)), JSON.stringify(stored));
    });

    test('round-trip: A AND (B OR C) AND D survives modelToTree → treeToModel → modelToTree byte-identically', () => {
        const model = group('all',
            condition(leaf('a', '==', 'A')),
            group('any', condition(leaf('b', '==', 'B')), condition(leaf('c', '==', 'C'))),
            condition(leaf('d', '==', 'D'))
        );
        const first = expressionTree.modelToTree(model, COMBINE);
        const second = expressionTree.modelToTree(expressionTree.treeToModel(first, COMBINE), COMBINE);

        assert.strictEqual(JSON.stringify(second), JSON.stringify(first));
    });

    /* ---------------- conjunctiveScope ---------------- */

    test('conjunctiveScope: leaf in an all-root sees both leaf siblings', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            condition(leaf('b', '==', '2')),
            condition(leaf('t', '==', '3'))
        );

        assert.deepStrictEqual(
            expressionTree.conjunctiveScope(model, [2]),
            [model.children[0], model.children[1]]
        );
    });

    test('conjunctiveScope: inside an any-group only the all-ancestors contribute', () => {
        const ctx = condition(leaf('ctx', '==', '1'));
        const alt = condition(leaf('alt', '==', '2'));
        const target = condition(leaf('t', '==', '3'));
        const model = group('all', ctx, group('any', alt, target));

        assert.deepStrictEqual(expressionTree.conjunctiveScope(model, [1, 1]), [ctx]);
    });

    test('conjunctiveScope: all-in-any-in-all — both all-levels contribute, the any level none', () => {
        const c1 = condition(leaf('c1', '==', '1'));
        const alt = condition(leaf('alt', '==', '2'));
        const c2 = condition(leaf('c2', '==', '3'));
        const target = condition(leaf('t', '==', '4'));
        const model = group('all', c1, group('any', alt, group('all', c2, target)));

        assert.deepStrictEqual(expressionTree.conjunctiveScope(model, [1, 1, 1]), [c1, c2]);
    });

    test('conjunctiveScope: sibling all-group contributes its closure, sibling any-group contributes nothing', () => {
        const ctx = condition(leaf('ctx', '==', '1'));
        const target = condition(leaf('t', '==', '2'));

        assert.deepStrictEqual(expressionTree.conjunctiveScope(group('all', group('all', ctx), target), [1]), [ctx]);
        assert.deepStrictEqual(expressionTree.conjunctiveScope(group('all', group('any', ctx), target), [1]), []);
    });

    /* ---------------- conjunctiveClosure ---------------- */

    test('conjunctiveClosure: all-group gathers direct conditions and nested all-group conditions, skips any-groups', () => {
        const a = condition(leaf('a', '==', '1'));
        const b = condition(leaf('b', '==', '2'));
        const c = condition(leaf('c', '==', '3'));

        assert.deepStrictEqual(
            expressionTree.conjunctiveClosure(group('all', a, group('all', b), group('any', c))),
            [a, b]
        );
    });

    test('conjunctiveClosure: any-group guarantees nothing', () => {
        assert.deepStrictEqual(
            expressionTree.conjunctiveClosure(group('any', condition(leaf('a', '==', '1')))),
            []
        );
    });

    /* ---------------- groupsWithPaths ---------------- */

    test('groupsWithPaths: depth-first enumeration with 1-based numbers', () => {
        const inner = group('all', condition(leaf('c', '==', '3')));
        const nested = group('any', condition(leaf('b', '==', '2')), inner);
        const tail = group('all');
        const model = group('all', condition(leaf('a', '==', '1')), nested, tail);
        const result = expressionTree.groupsWithPaths(model);

        assert.deepStrictEqual(
            result.map((entry) => ({path: entry.path, number: entry.number})),
            [
                {path: [], number: 1},
                {path: [1], number: 2},
                {path: [1, 1], number: 3},
                {path: [2], number: 4}
            ]
        );
        assert.strictEqual(result[0].group, model);
        assert.strictEqual(result[2].group, inner);
    });

    /* ---------------- moveNode ---------------- */

    test('moveNode: forward move within a group adjusts for the removal shift', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            condition(leaf('b', '==', '2')),
            condition(leaf('c', '==', '3'))
        );
        const before = JSON.stringify(model);
        const moved = expressionTree.moveNode(model, [0], [3]);

        assert.deepStrictEqual(moved.children.map((child) => child.condition.attribute), ['b', 'c', 'a']);
        assert.strictEqual(JSON.stringify(model), before); // input model untouched
    });

    test('moveNode: across groups', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            group('any', condition(leaf('b', '==', '2'))),
            condition(leaf('c', '==', '3'))
        );

        assert.deepStrictEqual(expressionTree.moveNode(model, [2], [1, 1]), group('all',
            condition(leaf('a', '==', '1')),
            group('any', condition(leaf('b', '==', '2')), condition(leaf('c', '==', '3')))
        ));
    });

    test('moveNode: into a nested group whose location shifts with the removal', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            group('any', group('all', condition(leaf('b', '==', '2'))))
        );

        assert.deepStrictEqual(expressionTree.moveNode(model, [0], [1, 0, 1]), group('all',
            group('any', group('all', condition(leaf('b', '==', '2')), condition(leaf('a', '==', '1'))))
        ));
    });

    test('moveNode: a slot inside the moved subtree is rejected', () => {
        const model = group('all',
            group('any', condition(leaf('b', '==', '2'))),
            condition(leaf('c', '==', '3'))
        );

        assert.strictEqual(expressionTree.moveNode(model, [0], [0, 1]), null);
    });

    test('moveNode: out-of-range paths are rejected', () => {
        const model = group('all', condition(leaf('a', '==', '1')), condition(leaf('b', '==', '2')));

        assert.strictEqual(expressionTree.moveNode(model, [5], [0]), null);
        assert.strictEqual(expressionTree.moveNode(model, [0], [4]), null);
        assert.strictEqual(expressionTree.moveNode(model, [], [0]), null);
        assert.strictEqual(expressionTree.moveNode(model, [0, 0], [0]), null); // a leaf has no children to address
    });

    /* ---------------- slotList / excludeSubtree ---------------- */

    test('slotList: depth-first slots, one per gap in every group', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            group('any', condition(leaf('b', '==', '2')), condition(leaf('c', '==', '3'))),
            condition(leaf('d', '==', '4'))
        );

        assert.deepStrictEqual(expressionTree.slotList(model), [
            {path: [0]},
            {path: [1]},
            {path: [1, 0]},
            {path: [1, 1]},
            {path: [1, 2]},
            {path: [2]},
            {path: [3]}
        ]);
    });

    test('excludeSubtree: removes exactly the slots inside the node, keeps the two around it', () => {
        const model = group('all',
            condition(leaf('a', '==', '1')),
            group('any', condition(leaf('b', '==', '2')), condition(leaf('c', '==', '3'))),
            condition(leaf('d', '==', '4'))
        );
        const slots = expressionTree.slotList(model);

        assert.deepStrictEqual(expressionTree.excludeSubtree(slots, [1]), [
            {path: [0]},
            {path: [1]},
            {path: [2]},
            {path: [3]}
        ]);
    });

    /* ---------------- solveContradictions ---------------- */

    test('solveContradictions: two different equalities clash', () => {
        assert.strictEqual(expressionTree.solveContradictions([
            {operator: '==', value: 'A'},
            {operator: '==', value: 'B'}
        ]), true);
    });

    test('solveContradictions: equality plus inequality of the same value clash', () => {
        assert.strictEqual(expressionTree.solveContradictions([
            {operator: '==', value: 'A'},
            {operator: '!=', value: 'A'}
        ]), true);
    });

    test('solveContradictions: membership set plus equality outside it clash', () => {
        assert.strictEqual(expressionTree.solveContradictions([
            {operator: '()', value: 'A,B'},
            {operator: '==', value: 'C'}
        ]), true);
    });

    test('solveContradictions: overlapping membership sets are satisfiable', () => {
        assert.strictEqual(expressionTree.solveContradictions([
            {operator: '()', value: ['A', 'B']},
            {operator: '()', value: 'B,C'}
        ]), false);
    });

    test('solveContradictions: exclusion removing the last possible value clashes', () => {
        assert.strictEqual(expressionTree.solveContradictions([
            {operator: '()', value: 'A,B'},
            {operator: '!()', value: 'A,B'}
        ]), true);
    });

    return tests;
}
