/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-coherence module — which fields a row may pick and which
 * warnings a rule earns. The module under test is loaded by run.mjs and handed in, with the config
 * and tree modules the component uses alongside it.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-coherence module.
 *
 * @param {Object} expressionCoherence The module's export object.
 * @param {Object} expressionConfig The config module, to index fields as the component does.
 * @param {Object} expressionTree The tree module, to compute scopes as the component does.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionCoherence, expressionConfig, expressionTree) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    const contextField = {type: 'zz_ctx', attribute: 'zz_ctx_attr'};
    const byTypeField = {type: 'zz_dependent', attribute: 'zz_dep_attr'};
    const byAttributeField = {type: 'zz_other', attribute: 'zz_needs_b'};
    const silentField = {type: 'zz_silent', attribute: 'zz_silent_attr'};
    const freeField = {type: 'zz_free', attribute: 'zz_free_attr'};
    const fields = [contextField, byTypeField, byAttributeField, silentField, freeField];
    const byType = expressionConfig.indexFieldsByType(fields);
    const coherence = {
        contextAttribute: 'zz_ctx_attr',
        contradictionWarning: 'These contexts cannot all hold.',
        requirements: {
            zz_dependent: {contexts: ['a'], warning: 'Needs context a.'},
            zz_needs_b: {contexts: ['b', 'c'], warning: 'Needs context b or c.'},
            zz_silent: {contexts: ['a']}
        }
    };
    const cond = (fieldType, operator, value) => ({kind: 'condition', condition: {fieldType, operator, value}});
    const group = (aggregator, ...children) => ({kind: 'group', aggregator, children});
    const scopeAt = (model, path) => expressionTree.conjunctiveScope(model, path);

    test('contextFieldType: the field carrying the context attribute, or null', () => {
        assert.strictEqual(expressionCoherence.contextFieldType(fields, coherence), 'zz_ctx');
        assert.strictEqual(expressionCoherence.contextFieldType(fields, {}), null);
        assert.strictEqual(expressionCoherence.contextFieldType(fields, {contextAttribute: 'zz_nobody'}), null);
    });

    test('scopeSatisfies: equality and membership name values; other operators name none', () => {
        const scope = (operator, value) => [cond('zz_ctx', operator, value)];

        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('==', 'a'), ['a'], 'zz_ctx'), true);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('==', 'b'), ['a'], 'zz_ctx'), false);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('()', 'x,a'), ['a'], 'zz_ctx'), true);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('()', ['x', 'c']), ['b', 'c'], 'zz_ctx'), true);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('!=', 'a'), ['a'], 'zz_ctx'), false);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('!()', 'a'), ['a'], 'zz_ctx'), false);
        assert.strictEqual(expressionCoherence.scopeSatisfies([cond('zz_free', '==', 'a')], ['a'], 'zz_ctx'), false);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope('==', 'a'), ['a'], null), false);
    });

    test('scopeSatisfies: a context value spelling an Object.prototype member is a value like any other', () => {
        const scope = [cond('zz_ctx', '==', 'constructor')];

        assert.strictEqual(expressionCoherence.scopeSatisfies(scope, ['a'], 'zz_ctx'), false);
        assert.strictEqual(expressionCoherence.scopeSatisfies(scope, ['constructor'], 'zz_ctx'), true);
    });

    test('availableFields: a dependent field is offered only where its context holds', () => {
        const model = group('all', cond('zz_ctx', '==', 'a'), cond('zz_free', '==', '1'));
        const offered = (scope, current) => expressionCoherence.availableFields(fields, coherence, scope, current)
            .map((field) => field.type);

        assert.deepStrictEqual(offered(scopeAt(model, [1]), 'zz_free'), ['zz_ctx', 'zz_dependent', 'zz_silent', 'zz_free']);
    });

    test('availableFields: OR-joined branches never borrow each other\'s context', () => {
        const model = group('any', cond('zz_ctx', '==', 'a'), cond('zz_free', '==', '1'));
        const offered = expressionCoherence.availableFields(fields, coherence, scopeAt(model, [1]), 'zz_free')
            .map((field) => field.type);

        assert.deepStrictEqual(offered, ['zz_ctx', 'zz_free']);
    });

    test('availableFields: the row\'s current field stays offered, and a row without a scope gets no dependent field', () => {
        const offered = (scope, current) => expressionCoherence.availableFields(fields, coherence, scope, current)
            .map((field) => field.type);

        assert.deepStrictEqual(offered([], 'zz_dependent'), ['zz_ctx', 'zz_dependent', 'zz_free']);
        assert.deepStrictEqual(offered(null, 'zz_free'), ['zz_ctx', 'zz_free']);
        assert.deepStrictEqual(
            expressionCoherence.availableFields(fields, {}, null, 'zz_free').map((field) => field.type),
            ['zz_ctx', 'zz_dependent', 'zz_other', 'zz_silent', 'zz_free'],
            'no requirements, no gating'
        );
    });

    test('ruleWarnings: a contradiction is reported once, at the topmost AND-group guaranteeing it', () => {
        const model = group('all',
            cond('zz_ctx', '==', 'a'),
            group('all', cond('zz_ctx', '==', 'b'))
        );

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, fields, byType, coherence), [
            {group: 1, text: 'These contexts cannot all hold.'}
        ]);
    });

    test('ruleWarnings: an AND-group under an OR-group reports its own clash, numbered depth-first', () => {
        const model = group('any',
            cond('zz_free', '==', '1'),
            group('all', cond('zz_ctx', '==', 'a'), cond('zz_ctx', '!=', 'a'))
        );

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, fields, byType, coherence), [
            {group: 2, text: 'These contexts cannot all hold.'}
        ]);
    });

    test('ruleWarnings: a row missing its context is reported once per requirement per group', () => {
        const model = group('all',
            cond('zz_dependent', '==', '1'),
            cond('zz_dependent', '==', '2'),
            cond('zz_other', '==', '3'),
            cond('zz_silent', '==', '4'),
            cond('zz_unconfigured', '==', '5')
        );

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, fields, byType, coherence), [
            {group: null, text: 'Needs context a.'},
            {group: null, text: 'Needs context b or c.'}
        ]);
    });

    test('ruleWarnings: contradictions first, then missing context, each group named only when there are several', () => {
        const model = group('all',
            cond('zz_ctx', '==', 'b'),
            cond('zz_ctx', '==', 'c'),
            group('any', cond('zz_ctx', '==', 'a'), cond('zz_dependent', '==', '1'))
        );

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, fields, byType, coherence), [
            {group: 1, text: 'These contexts cannot all hold.'},
            {group: 2, text: 'Needs context a.'}
        ]);
    });

    test('ruleWarnings: without a context field there are no warnings and the rule is never built', () => {
        const modelOf = () => {
            throw new Error('the rule is not read when nothing can be checked');
        };

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(modelOf, fields, byType, {requirements: coherence.requirements}), []);
    });

    test('ruleWarnings: without contradiction wording only missing context is reported', () => {
        const model = group('all', cond('zz_ctx', '==', 'b'), cond('zz_ctx', '==', 'c'), cond('zz_dependent', '==', '1'));
        const quiet = Object.assign({}, coherence, {contradictionWarning: ''});

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, fields, byType, quiet), [
            {group: null, text: 'Needs context a.'}
        ]);
    });

    test('availableFields: a field typed or keyed like an Object.prototype member has no requirement it never declared', () => {
        const protoTyped = {type: 'constructor', attribute: 'zz_proto_attr'};
        const protoKeyed = {type: 'zz_proto', attribute: 'toString'};
        const offered = (config, scope) => expressionCoherence.availableFields([freeField, protoTyped, protoKeyed], config, scope, 'zz_free')
            .map((field) => field.type);

        assert.deepStrictEqual(offered({}, null), ['zz_free', 'constructor', 'zz_proto'], 'no coherence config, no gating');
        assert.deepStrictEqual(offered(coherence, null), ['zz_free', 'constructor', 'zz_proto']);
        assert.deepStrictEqual(offered({requirements: {valueOf: {contexts: ['a']}}}, null), ['zz_free', 'constructor', 'zz_proto']);
    });

    test('ruleWarnings: a row on a field typed like an Object.prototype member reports no missing context', () => {
        const protoTyped = {type: 'constructor', attribute: 'zz_proto_attr'};
        const protoFields = fields.concat([protoTyped]);
        const model = group('all', cond('constructor', '==', '1'));

        assert.deepStrictEqual(expressionCoherence.ruleWarnings(() => model, protoFields,
            expressionConfig.indexFieldsByType(protoFields), coherence), []);
    });

    return tests;
}
