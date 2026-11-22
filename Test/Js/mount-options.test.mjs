/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the mount-options module — what the public mount passes to the component
 * and the registry name it creates the builder under. The module under test is loaded by run.mjs
 * and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded mount-options module.
 *
 * @param {Object} mountOptions The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(mountOptions) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});
    const nothingTaken = () => false;
    const builderConfig = {fields: [], combineType: 'Rule\\Combine'};

    test('componentConfig: the value, the builder config and the tunables pass; the name does not', () => {
        assert.deepStrictEqual(mountOptions.componentConfig({
            name: 'pages_rule',
            value: '{"a":1}',
            builderConfig,
            label: 'Only when',
            maxGroupDepth: 3,
            joinerStyle: 'chip',
            showPreview: false
        }), {
            value: '{"a":1}',
            builderConfig,
            label: 'Only when',
            maxGroupDepth: 3,
            joinerStyle: 'chip',
            showPreview: false
        });
    });

    test('componentConfig: every documented tunable is accepted', () => {
        const options = {value: '', builderConfig};

        for (const key of mountOptions.TUNABLES) {
            options[key] = 1;
        }

        assert.deepStrictEqual(Object.keys(mountOptions.componentConfig(options)).sort(),
            ['builderConfig', 'value', ...mountOptions.TUNABLES].sort());
    });

    test('componentConfig: a fresh object, so a later change to the options cannot reach the builder', () => {
        const options = {value: '', builderConfig, countDebounce: 100};
        const config = mountOptions.componentConfig(options);

        options.countDebounce = 5;
        options.value = 'changed';

        assert.notStrictEqual(config, options);
        assert.strictEqual(config.countDebounce, 100);
        assert.strictEqual(config.value, '');
    });

    test('componentConfig: a framework key or a misspelt tunable is refused by name', () => {
        for (const key of ['template', 'provider', 'links', 'dataScope', 'maxGroupDepht']) {
            assert.throws(
                () => mountOptions.componentConfig({value: '', builderConfig, [key]: 'x'}),
                (error) => error instanceof TypeError && error.message.includes('"' + key + '"'),
                key
            );
        }
    });

    test('componentConfig: options that are not an object are refused', () => {
        for (const options of [null, undefined, 'x', 3, [{value: '', builderConfig}]]) {
            assert.throws(() => mountOptions.componentConfig(options), TypeError, String(options));
        }
    });

    test('componentConfig: a value that is not a string is refused, the empty string is no rule', () => {
        for (const value of [undefined, null, 0, {}, ['a']]) {
            assert.throws(
                () => mountOptions.componentConfig({value, builderConfig}),
                (error) => error instanceof TypeError && error.message.includes('"value"'),
                JSON.stringify(value)
            );
        }

        assert.strictEqual(mountOptions.componentConfig({value: '', builderConfig}).value, '');
    });

    test('componentConfig: a builder config that is not an object is refused', () => {
        for (const config of [undefined, null, '{}', [], 1]) {
            assert.throws(
                () => mountOptions.componentConfig({value: '', builderConfig: config}),
                (error) => error instanceof TypeError && error.message.includes('"builderConfig"'),
                JSON.stringify(config)
            );
        }
    });

    test('componentName: a requested name of the allowed shape is used as it is', () => {
        for (const name of ['pages', 'Pages_rule-2', 'a']) {
            assert.strictEqual(mountOptions.componentName(name, nothingTaken), name);
        }
    });

    test('componentName: a name the registry would read as a path or a query is refused', () => {
        for (const name of ['', 'form.rule', 'index = rule', '1rule', '_rule', "a'b", 'a b', 3, null]) {
            assert.throws(() => mountOptions.componentName(name, nothingTaken), TypeError, JSON.stringify(name));
        }
    });

    test('componentName: a requested name already in use is refused, never shared', () => {
        assert.throws(
            () => mountOptions.componentName('pages', (name) => name === 'pages'),
            (error) => !(error instanceof TypeError) && error.message.includes('"pages"')
        );
    });

    test('componentName: without a request, the first free generated name', () => {
        const taken = new Set(['ufe_expression_builder_1', 'ufe_expression_builder_2']);

        assert.strictEqual(mountOptions.componentName(undefined, nothingTaken), 'ufe_expression_builder_1');
        assert.strictEqual(mountOptions.componentName(undefined, (name) => taken.has(name)), 'ufe_expression_builder_3');
    });

    test('componentName: a generated name has the shape a requested one must have', () => {
        const generated = mountOptions.componentName(undefined, nothingTaken);

        assert.strictEqual(mountOptions.componentName(generated, nothingTaken), generated);
    });

    return tests;
}
