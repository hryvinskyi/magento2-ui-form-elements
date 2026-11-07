/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural test runner for the expression modules. Plain Node, no dependencies, no build
 * step: node app/code/Hryvinskyi/UiFormElements/Test/Js/run.mjs
 *
 * Evaluates every module but the component, each from its real path, in dependency order: a module
 * that depends on a sibling receives the sibling as loaded here, never a stand-in, and
 * expression-tree.js gets the underscore stub. The two modules that drive the platform —
 * expression-requests.js (abort controllers and timers) and expression-drag.js (the document and
 * a drag handle) — receive it as an argument, so their suites hand them Node's AbortController, a
 * hand-cranked timer and a recording document. The component (expression-builder.js) depends on
 * browser-only Magento AMD modules and cannot run here.
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {loadAmdModule, underscoreStub} from './amd-shim.mjs';
import {buildTests as buildTreeTests} from './expression-tree.test.mjs';
import {buildTests as buildValueTests} from './expression-value.test.mjs';
import {buildTests as buildOptionsTests} from './expression-options.test.mjs';
import {buildTests as buildConfigTests} from './expression-config.test.mjs';
import {buildTests as buildFieldsTests} from './expression-fields.test.mjs';
import {buildTests as buildConditionTests} from './expression-condition.test.mjs';
import {buildTests as buildCoherenceTests} from './expression-coherence.test.mjs';
import {buildTests as buildReorderTests} from './expression-reorder.test.mjs';
import {buildTests as buildListboxTests} from './expression-listbox.test.mjs';
import {buildTests as buildOptionTreeTests} from './expression-option-tree.test.mjs';
import {buildTests as buildListValueTests} from './expression-list-value.test.mjs';
import {buildTests as buildPreviewTests} from './expression-preview.test.mjs';
import {buildTests as buildCountTests} from './expression-count.test.mjs';
import {buildTests as buildRemoteOptionsTests} from './expression-remote-options.test.mjs';
import {buildTests as buildRequestsTests} from './expression-requests.test.mjs';
import {buildTests as buildDragTests} from './expression-drag.test.mjs';

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * AMD id prefix of this module's form-element scripts.
 */
const ID_PREFIX = 'Hryvinskyi_UiFormElements/js/form/element/';

/**
 * Dependencies the loaded modules may ask for: the underscore stub, then every module loaded so
 * far under its AMD id.
 */
const registry = {underscore: underscoreStub};

/**
 * Reads and evaluates one AMD source below view/adminhtml/web/js/form/element and registers it
 * under its AMD id for the modules loaded after it.
 *
 * @param {String} name Module name, without the .js extension.
 * @returns {*} The module's export object.
 */
function loadElementModule(name) {
    const sourcePath = resolve(moduleDir, 'view/adminhtml/web/js/form/element', name + '.js');
    const exported = loadAmdModule(readFileSync(sourcePath, 'utf8'), registry);

    registry[ID_PREFIX + name] = exported;

    return exported;
}

const tree = loadElementModule('expression-tree');
const value = loadElementModule('expression-value');
const options = loadElementModule('expression-options');
const config = loadElementModule('expression-config');
const fields = loadElementModule('expression-fields');
const condition = loadElementModule('expression-condition');
const coherence = loadElementModule('expression-coherence');
const reorder = loadElementModule('expression-reorder');
const listbox = loadElementModule('expression-listbox');
const optionTree = loadElementModule('expression-option-tree');
const listValue = loadElementModule('expression-list-value');
const preview = loadElementModule('expression-preview');
const count = loadElementModule('expression-count');
const remoteOptions = loadElementModule('expression-remote-options');
const requests = loadElementModule('expression-requests');
const drag = loadElementModule('expression-drag');

const suites = [
    {name: 'expression-tree', tests: buildTreeTests(tree)},
    {name: 'expression-value', tests: buildValueTests(value)},
    {name: 'expression-options', tests: buildOptionsTests(options)},
    {name: 'expression-config', tests: buildConfigTests(config)},
    {name: 'expression-fields', tests: buildFieldsTests(fields)},
    {name: 'expression-condition', tests: buildConditionTests(condition, config)},
    {name: 'expression-coherence', tests: buildCoherenceTests(coherence, config, tree)},
    {name: 'expression-reorder', tests: buildReorderTests(reorder, tree)},
    {name: 'expression-listbox', tests: buildListboxTests(listbox)},
    {name: 'expression-option-tree', tests: buildOptionTreeTests(optionTree, options)},
    {name: 'expression-list-value', tests: buildListValueTests(listValue)},
    {name: 'expression-preview', tests: buildPreviewTests(preview)},
    {name: 'expression-count', tests: buildCountTests(count)},
    {name: 'expression-remote-options', tests: buildRemoteOptionsTests(remoteOptions)},
    {name: 'expression-requests', tests: buildRequestsTests(requests)},
    {name: 'expression-drag', tests: buildDragTests(drag)}
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
