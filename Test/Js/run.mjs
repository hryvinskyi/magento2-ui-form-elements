/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural test runner for the pure expression modules. Plain Node, no dependencies, no build
 * step: node app/code/Hryvinskyi/UiFormElements/Test/Js/run.mjs
 *
 * Evaluates ONLY the pure modules — expression-tree.js (structure) against the underscore stub
 * and the dependency-free expression-value.js (leaf values) and expression-options.js
 * (option-list indexing). The component (expression-builder.js) depends on browser-only Magento
 * AMD modules and cannot run here.
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {loadAmdModule, underscoreStub} from './amd-shim.mjs';
import {buildTests as buildTreeTests} from './expression-tree.test.mjs';
import {buildTests as buildValueTests} from './expression-value.test.mjs';
import {buildTests as buildOptionsTests} from './expression-options.test.mjs';

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads and evaluates one AMD source below view/adminhtml/web/js/form/element.
 *
 * @param {String} basename Source file name.
 * @param {Object.<String, *>} registry Dependency name → stub.
 * @returns {*} The module's export object.
 */
function loadElementModule(basename, registry) {
    const sourcePath = resolve(moduleDir, 'view/adminhtml/web/js/form/element', basename);

    return loadAmdModule(readFileSync(sourcePath, 'utf8'), registry);
}

const suites = [
    {name: 'expression-tree', tests: buildTreeTests(loadElementModule('expression-tree.js', {underscore: underscoreStub}))},
    {name: 'expression-value', tests: buildValueTests(loadElementModule('expression-value.js', {}))},
    {name: 'expression-options', tests: buildOptionsTests(loadElementModule('expression-options.js', {}))}
];

let failed = 0;

for (const {name, tests} of suites) {
    const failures = [];

    for (const {name: testName, fn} of tests) {
        try {
            fn();
        } catch (error) {
            failures.push({testName, error});
        }
    }

    for (const {testName, error} of failures) {
        console.error(`FAIL ${testName}\n${error && error.stack ? error.stack : error}\n`);
    }

    console.log(
        `${name}: ${tests.length - failures.length}/${tests.length} passed`
        + (failures.length ? `, ${failures.length} FAILED` : '')
    );
    failed += failures.length;
}

process.exit(failed ? 1 : 0);
