/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-value model — the leaf-value counterpart of the
 * expression-tree suite: value shapes, pasted-list parsing, the value-type and validator
 * registries, and the scalar type resolution. The module under test is loaded by run.mjs and
 * handed in, so this file stays
 * a plain catalogue of named assertions. Registry-mutating tests run against private names or
 * restore what they overwrite: the module instance is shared across the whole list.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-value module.
 *
 * @param {Object} expressionValue The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionValue) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    /* ---------------- value-shape helpers ---------------- */

    test('normaliseValueIn / serialiseValueOut: CSV and array shapes round-trip', () => {
        const text = {valueType: 'text'};
        const multi = {valueType: 'multiselect'};

        assert.deepStrictEqual(expressionValue.normaliseValueIn(text, '()', 'a,b,c'), ['a', 'b', 'c']);
        assert.strictEqual(expressionValue.serialiseValueOut(text, '()', ['a', 'b', 'c']), 'a,b,c');

        assert.deepStrictEqual(expressionValue.normaliseValueIn(multi, '==', 'x,y'), ['x', 'y']);
        assert.strictEqual(expressionValue.serialiseValueOut(multi, '==', ['x', 'y']), 'x,y');

        assert.strictEqual(expressionValue.normaliseValueIn(text, '==', ['a', 'b']), 'a');
        assert.strictEqual(expressionValue.serialiseValueOut(text, '==', 'a'), 'a');

        assert.deepStrictEqual(expressionValue.normaliseValueIn(text, '!()', ''), []);
        assert.strictEqual(expressionValue.serialiseValueOut(text, '!()', []), '');
        assert.strictEqual(expressionValue.normaliseValueIn(null, '==', 'v'), 'v');
    });

    test('asArray: CSV strings split, arrays copy, empties collapse', () => {
        assert.deepStrictEqual(expressionValue.asArray('a,b'), ['a', 'b']);
        assert.deepStrictEqual(expressionValue.asArray(''), []);
        assert.deepStrictEqual(expressionValue.asArray(null), []);
        assert.deepStrictEqual(expressionValue.asArray(undefined), []);

        const source = ['x'];
        const copy = expressionValue.asArray(source);
        assert.deepStrictEqual(copy, ['x']);
        assert.notStrictEqual(copy, source); // a defensive copy, never the caller's array
    });

    test('isListOperator: the membership operators, and nothing else', () => {
        assert.strictEqual(expressionValue.isListOperator('()'), true);
        assert.strictEqual(expressionValue.isListOperator('!()'), true);

        for (const scalar of ['==', '!=', '>=', '>', '<=', '<', '{}', '!{}', 'like', '']) {
            assert.strictEqual(expressionValue.isListOperator(scalar), false, `operator ${scalar}`);
        }

        // Nothing coerces: a missing or non-string operator is not a list operator.
        assert.strictEqual(expressionValue.isListOperator(null), false);
        assert.strictEqual(expressionValue.isListOperator(undefined), false);
        assert.strictEqual(expressionValue.isListOperator(0), false);
        assert.strictEqual(expressionValue.isListOperator(['()']), false);

        // The predicate and the shaping helpers answer off the same operator set.
        const field = {valueType: 'text'};

        for (const operator of ['()', '!()', '==', 'like']) {
            assert.strictEqual(
                Array.isArray(expressionValue.normaliseValueIn(field, operator, 'a,b')),
                expressionValue.isListOperator(operator),
                `shaping agrees with the predicate for ${operator}`
            );
        }
    });

    /* ---------------- pasted lists ---------------- */

    test('hasListSeparators: only text carrying a comma, semicolon, tab or newline reads as a list', () => {
        for (const text of ['a,b', 'a;b', 'a\tb', 'a\nb', 'a\r\nb', 'trailing,', ',leading', ',,,', 'SKU-1\nSKU-2']) {
            assert.strictEqual(expressionValue.hasListSeparators(text), true, `list: ${JSON.stringify(text)}`);
        }

        // A single value — including one with spaces, dots or dashes — is not a list: the browser
        // must paste it into the input untouched.
        for (const text of ['SKU-1', 'Internal Hard Drives', 'a.b', 'a b', '', '   ', null, undefined]) {
            assert.strictEqual(expressionValue.hasListSeparators(text), false, `single: ${JSON.stringify(text)}`);
        }

        // The predicate is stateless: the same input must answer the same way every time (a global
        // regex would carry lastIndex between calls and start answering false).
        assert.strictEqual(expressionValue.hasListSeparators('a,b'), true);
        assert.strictEqual(expressionValue.hasListSeparators('a,b'), true);
    });

    test('splitPasteText: separator runs break the text, entries trim, empties drop out', () => {
        assert.deepStrictEqual(expressionValue.splitPasteText('a,b,c'), ['a', 'b', 'c']);
        assert.deepStrictEqual(expressionValue.splitPasteText('a; b ;c'), ['a', 'b', 'c']);
        assert.deepStrictEqual(expressionValue.splitPasteText('a\tb\tc'), ['a', 'b', 'c']);

        // A spreadsheet column: CRLF pairs, a blank row and an indented cell all yield clean entries.
        assert.deepStrictEqual(
            expressionValue.splitPasteText('SKU-1\r\nSKU-2\r\n\r\n  SKU-3  \r\n'),
            ['SKU-1', 'SKU-2', 'SKU-3']
        );

        // Mixed separators and stray runs collapse; nothing phantom survives.
        assert.deepStrictEqual(expressionValue.splitPasteText(',,a;;\t\nb,,'), ['a', 'b']);
        assert.deepStrictEqual(expressionValue.splitPasteText(',,,'), []);
        assert.deepStrictEqual(expressionValue.splitPasteText('   '), []);
        assert.deepStrictEqual(expressionValue.splitPasteText(''), []);
        assert.deepStrictEqual(expressionValue.splitPasteText(null), []);
        assert.deepStrictEqual(expressionValue.splitPasteText(undefined), []);

        // Text with no separator is one entry — callers decide whether that case is theirs to take.
        assert.deepStrictEqual(expressionValue.splitPasteText(' SKU-1 '), ['SKU-1']);

        // Entries stay verbatim otherwise: case survives, inner spaces survive, repeats survive
        // (de-duplication is the editor's job, not the parser's).
        assert.deepStrictEqual(
            expressionValue.splitPasteText('Internal Hard Drives,SSDs,internal hard drives,SSDs'),
            ['Internal Hard Drives', 'SSDs', 'internal hard drives', 'SSDs']
        );
    });

    /* ---------------- value-type registry ---------------- */

    test('valueTypes built-ins: attrs and default validators pair as documented', () => {
        const expected = {
            'text': {attrs: {type: 'text'}, validator: null},
            'integer': {attrs: {type: 'number', step: '1', inputmode: 'numeric'}, validator: 'integer'},
            'float': {attrs: {type: 'number', step: 'any', inputmode: 'decimal'}, validator: 'float'},
            'date': {attrs: {type: 'date'}, validator: null},
            'time': {attrs: {type: 'time'}, validator: null},
            'email': {attrs: {type: 'email', inputmode: 'email'}, validator: 'email'}
        };

        for (const [name, pairing] of Object.entries(expected)) {
            const def = expressionValue.valueTypeDef(name);

            assert.deepStrictEqual(def.attrs, pairing.attrs, `${name}: attrs`);
            assert.strictEqual(def.validator, pairing.validator, `${name}: default validator`);

            if (pairing.validator !== null) {
                // A named default must actually be registered, or it would silently validate nothing.
                assert.strictEqual(typeof expressionValue.validators[pairing.validator], 'function');
            }
        }

        // The date type carries the stored-timestamp display transform; no built-in commits one.
        assert.strictEqual(typeof expressionValue.valueTypeDef('date').editValue, 'function');
    });

    test('scalarTypeFor: explicit key beats the input-type map beats the operator heuristic beats text', () => {
        const ge = [{value: '>=', label: 'equals or greater than'}];
        const selectSet = [
            {value: '==', label: 'is'}, {value: '!=', label: 'is not'},
            {value: '()', label: 'is one of'}, {value: '!()', label: 'is not one of'}
        ];

        // 1. An explicit scalarType wins outright — unknown names pass through untouched.
        assert.strictEqual(expressionValue.scalarTypeFor({scalarType: 'time', inputType: 'price', operators: ge}), 'time');
        assert.strictEqual(expressionValue.scalarTypeFor({scalarType: 'made-up-type'}), 'made-up-type');
        assert.strictEqual(expressionValue.scalarTypeFor({scalarType: '', inputType: 'int'}), 'integer'); // blank ≠ explicit

        // 2. The raw input type maps directly.
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'date'}), 'date');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'datetime'}), 'date');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'int'}), 'integer');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'price'}), 'float');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'weight'}), 'float');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'decimal'}), 'float');

        // Date descriptors carry the comparison operators too — the map claims them before the
        // heuristic can call them floats.
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'date', operators: ge}), 'date');

        // 3. A `>=` in the operator set reads as float: numeric-backend attributes keep
        //    reporting a text input.
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'text', operators: ge}), 'float');

        // 4. Everything else is text.
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'text', operators: null}), 'text');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'select', operators: selectSet}), 'text');
        assert.strictEqual(expressionValue.scalarTypeFor({inputType: 'constructor'}), 'text'); // map is own-keys only
        assert.strictEqual(expressionValue.scalarTypeFor(null), 'text');
        assert.strictEqual(expressionValue.scalarTypeFor(undefined), 'text');
    });

    test('valueTypeDef: unknown or absent names fall back to the text definition', () => {
        const textDef = expressionValue.valueTypeDef('text');

        assert.strictEqual(expressionValue.valueTypeDef('no-such-type'), textDef);
        assert.strictEqual(expressionValue.valueTypeDef(null), textDef);
        assert.strictEqual(expressionValue.valueTypeDef(undefined), textDef);
        assert.strictEqual(expressionValue.valueTypeDef(''), textDef);
        // Object internals never leak as definitions.
        assert.strictEqual(expressionValue.valueTypeDef('constructor'), textDef);
        assert.strictEqual(expressionValue.valueTypeDef('hasOwnProperty'), textDef);
    });

    /* ---------------- typed validator predicates ---------------- */

    test('validators.regex: compilable patterns pass, broken ones fail', () => {
        const regex = expressionValue.validators['regex'];

        assert.strictEqual(regex('^/category/.+$'), true);
        assert.strictEqual(regex('foo.*bar'), true);
        assert.strictEqual(regex(''), true); // an empty pattern compiles (matches everything)
        assert.strictEqual(regex(null), true);
        assert.strictEqual(regex('[a-'), false);
        assert.strictEqual(regex('('), false);
        assert.strictEqual(regex('a{2,1}'), false);
    });

    test('validators.number: finite numbers and numeric strings pass, text/lists fail, blank input passes', () => {
        const number = expressionValue.validators['number'];

        assert.strictEqual(number('12'), true);
        assert.strictEqual(number('1.5'), true);
        assert.strictEqual(number('-3e2'), true);
        assert.strictEqual(number(' 42 '), true);
        assert.strictEqual(number(0), true);
        assert.strictEqual(number('abc'), false);
        assert.strictEqual(number('Infinity'), false);
        assert.strictEqual(number(['1']), false);

        // Format validators judge present input only — presence is not-empty's concern.
        assert.strictEqual(number(''), true);
        assert.strictEqual(number('   '), true);
        assert.strictEqual(number(null), true);
        assert.strictEqual(number(undefined), true);
    });

    test('validators.integer: signed whole numbers pass — decimals, exponents and lists fail, blank input passes', () => {
        const integer = expressionValue.validators['integer'];

        assert.strictEqual(integer('12'), true);
        assert.strictEqual(integer('+7'), true);
        assert.strictEqual(integer('-3'), true);
        assert.strictEqual(integer('007'), true);
        assert.strictEqual(integer(' 42 '), true);
        assert.strictEqual(integer(0), true); // zero is a value
        assert.strictEqual(integer(5), true);
        assert.strictEqual(integer(-5), true);
        assert.strictEqual(integer('1.5'), false);
        assert.strictEqual(integer(1.5), false);
        assert.strictEqual(integer('1e3'), false); // digits only in string form
        assert.strictEqual(integer('abc'), false);
        assert.strictEqual(integer(['1']), false);

        // Format validators judge present input only — presence is not-empty's concern.
        assert.strictEqual(integer(''), true);
        assert.strictEqual(integer('   '), true);
        assert.strictEqual(integer(null), true);
        assert.strictEqual(integer(undefined), true);
    });

    test('validators.float: the finite-number predicate under the type-default name — blank input passes', () => {
        const float = expressionValue.validators['float'];

        assert.strictEqual(float('1.5'), true);
        assert.strictEqual(float('12'), true);
        assert.strictEqual(float('-3e2'), true);
        assert.strictEqual(float(0), true); // zero is a value
        assert.strictEqual(float('abc'), false);
        assert.strictEqual(float('Infinity'), false);
        assert.strictEqual(float(['1']), false);

        // Format validators judge present input only — presence is not-empty's concern.
        assert.strictEqual(float(''), true);
        assert.strictEqual(float('   '), true);
        assert.strictEqual(float(null), true);
        assert.strictEqual(float(undefined), true);
    });

    test('validators.email: pragmatic single-address shape — strings only, untrimmed, blank input passes', () => {
        const email = expressionValue.validators['email'];

        assert.strictEqual(email('user@example.com'), true);
        assert.strictEqual(email('first.last+tag@sub.domain.co.uk'), true);
        assert.strictEqual(email('user@example'), false); // domain needs a dot
        assert.strictEqual(email('not-an-email'), false);
        assert.strictEqual(email('@example.com'), false);
        assert.strictEqual(email('user@.com'), false);
        assert.strictEqual(email('a b@c.d'), false);
        assert.strictEqual(email('user@example.com '), false); // stray whitespace on PRESENT input is flagged
        assert.strictEqual(email(123), false);

        // Format validators judge present input only — presence is not-empty's concern
        // (the blank check trims; the format check above deliberately does not).
        assert.strictEqual(email(''), true);
        assert.strictEqual(email('   '), true);
        assert.strictEqual(email(null), true);
        assert.strictEqual(email(undefined), true);
    });

    test('validators.not-empty: lists by length, scalars by trimmed string — zero counts', () => {
        const notEmpty = expressionValue.validators['not-empty'];

        assert.strictEqual(notEmpty(['1']), true);
        assert.strictEqual(notEmpty([]), false);
        assert.strictEqual(notEmpty('x'), true);
        assert.strictEqual(notEmpty(0), true);
        assert.strictEqual(notEmpty(''), false);
        assert.strictEqual(notEmpty('   '), false);
        assert.strictEqual(notEmpty(null), false);
        assert.strictEqual(notEmpty(undefined), false);
    });

    /* ---------------- value-type transforms ---------------- */

    test('date editValue: stored timestamps truncate to the date part, everything else passes through', () => {
        const editValue = expressionValue.valueTypeDef('date').editValue;

        assert.strictEqual(editValue('2026-07-27 00:00:00'), '2026-07-27');
        assert.strictEqual(editValue('2026-07-27'), '2026-07-27');
        assert.strictEqual(editValue(''), '');
        assert.strictEqual(editValue(null), '');
        assert.strictEqual(editValue(undefined), '');
        assert.strictEqual(editValue('not a date'), 'not a date');
    });

    /* ---------------- registration seams ---------------- */

    test('registerValueType: valid definitions register and overwrite; invalid input is ignored', () => {
        const textDef = expressionValue.valueTypeDef('text');

        // A valid registration resolves by name.
        expressionValue.registerValueType('percent', {attrs: {type: 'number', step: '0.01'}, validator: 'float'});
        assert.deepStrictEqual(expressionValue.valueTypeDef('percent').attrs, {type: 'number', step: '0.01'});
        assert.strictEqual(expressionValue.valueTypeDef('percent').validator, 'float');

        // Overwriting is allowed — a consumer may deliberately re-skin a type.
        expressionValue.registerValueType('percent', {attrs: {type: 'text'}});
        assert.deepStrictEqual(expressionValue.valueTypeDef('percent').attrs, {type: 'text'});

        // Built-ins re-skin the same way — restore the original afterwards.
        const originalTime = expressionValue.valueTypeDef('time');
        expressionValue.registerValueType('time', {attrs: {type: 'text', 'data-re-skinned': '1'}});
        assert.deepStrictEqual(expressionValue.valueTypeDef('time').attrs, {type: 'text', 'data-re-skinned': '1'});
        expressionValue.registerValueType('time', originalTime);
        assert.strictEqual(expressionValue.valueTypeDef('time'), originalTime);

        // Invalid input is silently ignored: bad names, bad definitions, bad attrs.
        expressionValue.registerValueType('', {attrs: {type: 'text'}});
        assert.strictEqual(expressionValue.valueTypeDef(''), textDef);
        expressionValue.registerValueType('   ', {attrs: {type: 'text'}});
        assert.strictEqual(expressionValue.valueTypeDef('   '), textDef);
        expressionValue.registerValueType(42, {attrs: {type: 'text'}});
        assert.strictEqual(expressionValue.valueTypeDef('42'), textDef);
        expressionValue.registerValueType('broken', null);
        expressionValue.registerValueType('broken', 'nope');
        expressionValue.registerValueType('broken', {});
        expressionValue.registerValueType('broken', {attrs: 'nope'});
        expressionValue.registerValueType('broken', {attrs: ['nope']});
        assert.strictEqual(expressionValue.valueTypeDef('broken'), textDef);
    });

    test('registerValidator: functions register and overwrite; invalid input never clobbers', () => {
        const alwaysTrue = () => true;
        const alwaysFalse = () => false;

        // A valid registration resolves by name; a later function overwrites.
        expressionValue.registerValidator('custom-check', alwaysTrue);
        assert.strictEqual(expressionValue.validators['custom-check'], alwaysTrue);
        expressionValue.registerValidator('custom-check', alwaysFalse);
        assert.strictEqual(expressionValue.validators['custom-check'], alwaysFalse);

        // Non-functions are ignored — a built-in survives every clobber attempt.
        const builtinNumber = expressionValue.validators['number'];
        expressionValue.registerValidator('number', 'nope');
        expressionValue.registerValidator('number', null);
        expressionValue.registerValidator('number', 42);
        expressionValue.registerValidator('number', {call: () => true});
        assert.strictEqual(expressionValue.validators['number'], builtinNumber);

        // Blank or non-string names are ignored.
        expressionValue.registerValidator('', alwaysTrue);
        assert.strictEqual(expressionValue.validators[''], undefined);
        expressionValue.registerValidator('   ', alwaysTrue);
        assert.strictEqual(expressionValue.validators['   '], undefined);
        expressionValue.registerValidator(null, alwaysTrue);
        assert.strictEqual(expressionValue.validators['null'], undefined);
    });

    return tests;
}
