/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Behavioural tests for the expression-listbox module — the dropdowns' keyboard pattern and the
 * dropdown-variant rule. The module under test is loaded by run.mjs and handed in.
 */
import assert from 'node:assert/strict';

/**
 * Builds the full test list against a loaded expression-listbox module.
 *
 * @param {Object} expressionListbox The module's export object.
 * @returns {Array.<{name: String, fn: Function}>}
 */
export function buildTests(expressionListbox) {
    const tests = [];
    const test = (name, fn) => tests.push({name, fn});

    /**
     * A probe over a described dropdown that records what it was asked, in order.
     *
     * @param {{open?: Boolean, visible?: Boolean, items?: Array, active?: Number, tree?: Boolean}} state
     * @returns {Object}
     */
    const probeOf = (state) => {
        const asked = [];
        const answer = (name, value) => () => {
            asked.push(name);

            return value;
        };

        return {
            asked,
            isOpen: answer('isOpen', state.open !== false),
            isListVisible: answer('isListVisible', state.visible !== false),
            items: answer('items', state.items || []),
            activeIndex: answer('activeIndex', state.active === undefined ? -1 : state.active),
            showsTree: answer('showsTree', state.tree === true)
        };
    };
    const act = (key, state) => expressionListbox.dropdownKeyAction(key, probeOf(state));
    const flat = [{value: 'a'}, {value: 'b'}, {value: 'c'}];
    const tree = [
        {value: 'p', hasChildren: true, expanded: false},
        {value: 'q', hasChildren: true, expanded: true},
        {value: 'r', hasChildren: false, expanded: false}
    ];

    test('keyName: the event\'s key, or nothing for an event without one', () => {
        assert.strictEqual(expressionListbox.keyName({key: 'Enter'}), 'Enter');
        assert.strictEqual(expressionListbox.keyName({}), '');
        assert.strictEqual(expressionListbox.keyName(null), '');
        assert.strictEqual(expressionListbox.keyName({key: 13}), '');
    });

    test('isNavigationKey: reserved keys and bare modifiers, never text keys or prototype names', () => {
        for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta']) {
            assert.strictEqual(expressionListbox.isNavigationKey(key), true, key);
        }
        for (const key of ['a', ' ', 'Backspace', '', 'constructor', 'toString']) {
            assert.strictEqual(expressionListbox.isNavigationKey(key), false, key);
        }
    });

    test('nextHighlight: down enters the list, up returns to the text and wraps from it, the end holds', () => {
        assert.strictEqual(expressionListbox.nextHighlight(-1, 3, 1), 0);
        assert.strictEqual(expressionListbox.nextHighlight(0, 3, 1), 1);
        assert.strictEqual(expressionListbox.nextHighlight(2, 3, 1), 2);
        assert.strictEqual(expressionListbox.nextHighlight(0, 3, -1), -1);
        assert.strictEqual(expressionListbox.nextHighlight(-1, 3, -1), 2);
        assert.strictEqual(expressionListbox.nextHighlight(7, 3, 1), 2, 'an index past a shrunken list lands on its end');
        assert.strictEqual(expressionListbox.nextHighlight(-1, 0, 1), -1);
        assert.strictEqual(expressionListbox.nextHighlight(2, 0, -1), -1);
    });

    test('Escape closes an open dropdown, and is left alone on a closed one', () => {
        assert.deepStrictEqual(act('Escape', {open: true}), {name: 'close', consumed: true});
        assert.deepStrictEqual(act('Escape', {open: false}), {name: 'none', consumed: false});
    });

    test('a hidden list: ArrowDown re-opens a closed dropdown, other keys only drop the highlight when they edit text', () => {
        assert.deepStrictEqual(act('ArrowDown', {open: false, visible: false}), {name: 'open', consumed: true});
        assert.deepStrictEqual(act('ArrowDown', {open: true, visible: false}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act('a', {open: true, visible: false}), {name: 'clearHighlight', consumed: false});
        assert.deepStrictEqual(act('Enter', {open: false, visible: false}), {name: 'none', consumed: false});
    });

    test('a hidden list is never asked for its entries', () => {
        const probe = probeOf({open: false, visible: false});

        expressionListbox.dropdownKeyAction('ArrowDown', probe);
        assert.deepStrictEqual(probe.asked, ['isListVisible', 'isOpen']);
    });

    test('ArrowDown and ArrowUp move the highlight over the rendered entries', () => {
        assert.deepStrictEqual(act('ArrowDown', {items: flat, active: -1}), {name: 'highlight', consumed: true, index: 0});
        assert.deepStrictEqual(act('ArrowUp', {items: flat, active: -1}), {name: 'highlight', consumed: true, index: 2});
        assert.deepStrictEqual(act('ArrowUp', {items: flat, active: 0}), {name: 'highlight', consumed: true, index: -1});
        assert.deepStrictEqual(act('ArrowDown', {items: [], active: -1}), {name: 'highlight', consumed: true, index: -1});
    });

    test('without a highlight, every other key stays with the input', () => {
        assert.deepStrictEqual(act('Enter', {items: flat, active: -1}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act('Home', {items: flat, active: -1}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act(' ', {items: tree, active: -1, tree: true}), {name: 'clearHighlight', consumed: false});
        assert.deepStrictEqual(act('x', {items: flat, active: 5}), {name: 'clearHighlight', consumed: false},
            'a highlight past the end of the list counts as none');
    });

    test('Enter commits the highlighted entry; Home and End jump to the ends', () => {
        assert.deepStrictEqual(act('Enter', {items: flat, active: 1}), {name: 'commit', consumed: true, item: flat[1]});
        assert.deepStrictEqual(act('Home', {items: flat, active: 2}), {name: 'highlight', consumed: true, index: 0});
        assert.deepStrictEqual(act('End', {items: flat, active: 0}), {name: 'highlight', consumed: true, index: 2});
    });

    test('Space toggles the highlighted node\'s selection in the tree, and is typed text anywhere else', () => {
        assert.deepStrictEqual(act(' ', {items: tree, active: 2, tree: true}), {name: 'toggleSelection', consumed: true, value: 'r'});
        assert.deepStrictEqual(act(' ', {items: flat, active: 0, tree: false}), {name: 'clearHighlight', consumed: false});
    });

    test('ArrowRight expands a collapsed parent and ArrowLeft collapses an expanded one; otherwise the caret moves', () => {
        assert.deepStrictEqual(act('ArrowRight', {items: tree, active: 0, tree: true}), {name: 'toggleExpansion', consumed: true, value: 'p'});
        assert.deepStrictEqual(act('ArrowLeft', {items: tree, active: 1, tree: true}), {name: 'toggleExpansion', consumed: true, value: 'q'});
        assert.deepStrictEqual(act('ArrowLeft', {items: tree, active: 0, tree: true}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act('ArrowRight', {items: tree, active: 1, tree: true}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act('ArrowRight', {items: tree, active: 2, tree: true}), {name: 'none', consumed: false});
        assert.deepStrictEqual(act('ArrowRight', {items: tree, active: 0, tree: false}), {name: 'none', consumed: false});
    });

    test('a text key over a highlighted entry drops the highlight and stays with the input', () => {
        assert.deepStrictEqual(act('q', {items: flat, active: 1}), {name: 'clearHighlight', consumed: false});
        assert.deepStrictEqual(act('Tab', {items: flat, active: 1}), {name: 'none', consumed: false});
    });

    test('dropdownVariant: the owner first, then the tree, then the suggestions, else a flat list — asked lazily', () => {
        const variantOf = (searchable, tree, suggest) => {
            const asked = [];
            const variant = expressionListbox.dropdownVariant({
                isSearchableSelect: () => asked.push('select') && searchable,
                showsTree: () => asked.push('tree') && tree,
                usesSuggestions: () => asked.push('suggest') && suggest
            });

            return [variant, asked];
        };

        assert.deepStrictEqual(variantOf(true, true, true), ['select', ['select']]);
        assert.deepStrictEqual(variantOf(false, true, true), ['tree', ['select', 'tree']]);
        assert.deepStrictEqual(variantOf(false, false, true), ['suggest', ['select', 'tree', 'suggest']]);
        assert.deepStrictEqual(variantOf(false, false, false), ['list', ['select', 'tree', 'suggest']]);
    });

    /**
     * A probe whose every member answers a fixed value and records, in order, that it was asked.
     *
     * @param {Object.<String, *>} answers Member name → the value it answers.
     * @returns {Object} The probe, with `asked` listing the members asked.
     */
    const lazy = (answers) => {
        const probe = {asked: []};

        for (const [name, value] of Object.entries(answers)) {
            probe[name] = (...args) => {
                probe.asked.push(name);

                return typeof value === 'function' ? value(...args) : value;
            };
        }

        return probe;
    };

    test('rowShowsTree: a hierarchy with a blank search, never under a searchable select', () => {
        const shows = (answers) => expressionListbox.rowShowsTree(lazy(answers));

        assert.strictEqual(shows({isSearchableSelect: false, hasHierarchy: true, searchText: ''}), true);
        assert.strictEqual(shows({isSearchableSelect: false, hasHierarchy: true, searchText: '   '}), true,
            'a search of spaces is still blank');
        assert.strictEqual(shows({isSearchableSelect: false, hasHierarchy: true, searchText: null}), true,
            'no search text at all is blank');
        assert.strictEqual(shows({isSearchableSelect: false, hasHierarchy: true, searchText: 'ssd'}), false,
            'typing switches to the flat breadcrumb list');
        assert.strictEqual(shows({isSearchableSelect: false, hasHierarchy: false, searchText: ''}), false);
        assert.strictEqual(shows({isSearchableSelect: true, hasHierarchy: true, searchText: ''}), false,
            'the Attribute control above a category tree is never the tree');
    });

    test('rowShowsTree: the owner is asked first, the options only for a value editor, the search last', () => {
        const owned = lazy({isSearchableSelect: true, hasHierarchy: true, searchText: ''});
        const flatList = lazy({isSearchableSelect: false, hasHierarchy: false, searchText: ''});
        const hierarchy = lazy({isSearchableSelect: false, hasHierarchy: true, searchText: ''});

        expressionListbox.rowShowsTree(owned);
        expressionListbox.rowShowsTree(flatList);
        expressionListbox.rowShowsTree(hierarchy);
        assert.deepStrictEqual(owned.asked, ['isSearchableSelect']);
        assert.deepStrictEqual(flatList.asked, ['isSearchableSelect', 'hasHierarchy']);
        assert.deepStrictEqual(hierarchy.asked, ['isSearchableSelect', 'hasHierarchy', 'searchText']);
    });

    test('rowUsesSuggestList: an attribute with suggestions and no option list; the list is asked first', () => {
        const uses = (answers) => expressionListbox.rowUsesSuggestList(lazy(answers));
        const optioned = lazy({hasOptions: true, supportsSuggest: true});

        assert.strictEqual(uses({hasOptions: false, supportsSuggest: true}), true);
        assert.strictEqual(uses({hasOptions: true, supportsSuggest: true}), false,
            'a loaded option list outranks the suggestions');
        assert.strictEqual(uses({hasOptions: false, supportsSuggest: false}), false);
        expressionListbox.rowUsesSuggestList(optioned);
        assert.deepStrictEqual(optioned.asked, ['hasOptions']);
    });

    test('dropdownReplacesValue: only the single-value type-ahead replaces; the operator is asked only for it', () => {
        const replaces = (answers) => expressionListbox.dropdownReplacesValue(lazy(answers));
        const optionList = lazy({usesSuggestList: false, usesListOperator: false});

        assert.strictEqual(replaces({usesSuggestList: true, usesListOperator: false}), true);
        assert.strictEqual(replaces({usesSuggestList: true, usesListOperator: true}), false,
            'the multi-value type-ahead appends a pill');
        assert.strictEqual(replaces({usesSuggestList: false, usesListOperator: false}), false,
            'an option-backed dropdown never replaces');
        expressionListbox.dropdownReplacesValue(optionList);
        assert.deepStrictEqual(optionList.asked, ['usesSuggestList']);
    });

    test('variantCommit: a searchable select settles the picked value', () => {
        const probe = lazy({replacesValue: true});

        assert.deepStrictEqual(expressionListbox.variantCommit('select', {value: 'sku'}, probe), {name: 'settle', value: 'sku'});
        assert.deepStrictEqual(probe.asked, []);
    });

    test('variantCommit: Enter on a collapsed parent of the tree expands it, any other node toggles its selection', () => {
        const commit = (item) => expressionListbox.variantCommit('tree', item, lazy({replacesValue: false}));

        assert.deepStrictEqual(commit({value: 'p', hasChildren: true, expanded: false}), {name: 'toggleExpansion', value: 'p'});
        assert.deepStrictEqual(commit({value: 'q', hasChildren: true, expanded: true}), {name: 'toggleSelection', value: 'q'},
            'an expanded parent is selected, not collapsed');
        assert.deepStrictEqual(commit({value: 'r', hasChildren: false, expanded: false}), {name: 'toggleSelection', value: 'r'},
            'a leaf has nothing to expand');
    });

    test('variantCommit: the type-ahead replaces the value or appends a pill, as the row says at commit time', () => {
        assert.deepStrictEqual(expressionListbox.variantCommit('suggest', {value: 'SKU-1'}, lazy({replacesValue: true})),
            {name: 'replace', value: 'SKU-1'});
        assert.deepStrictEqual(expressionListbox.variantCommit('suggest', {value: 'SKU-1'}, lazy({replacesValue: false})),
            {name: 'append', value: 'SKU-1'});
    });

    test('variantCommit: a flat option list appends the picked value', () => {
        assert.deepStrictEqual(expressionListbox.variantCommit('list', {value: '7'}, lazy({replacesValue: true})),
            {name: 'append', value: '7'});
    });

    test('variantAddsToList: the single-selects settle one value, the tree and flat lists add, the type-ahead as it commits', () => {
        assert.strictEqual(expressionListbox.variantAddsToList('select', lazy({replacesValue: false})), false);
        assert.strictEqual(expressionListbox.variantAddsToList('tree', lazy({replacesValue: true})), true);
        assert.strictEqual(expressionListbox.variantAddsToList('list', lazy({replacesValue: true})), true);
        assert.strictEqual(expressionListbox.variantAddsToList('suggest', lazy({replacesValue: true})), false);
        assert.strictEqual(expressionListbox.variantAddsToList('suggest', lazy({replacesValue: false})), true);
    });

    test('variantListVisible: an open option-backed list always shows; the type-ahead only with something to say', () => {
        for (const variant of ['select', 'tree', 'list']) {
            const probe = lazy({suggestHasContent: false});

            assert.strictEqual(expressionListbox.variantListVisible(variant, probe), true, variant);
            assert.deepStrictEqual(probe.asked, [], variant);
        }
        assert.strictEqual(expressionListbox.variantListVisible('suggest', lazy({suggestHasContent: true})), true);
        assert.strictEqual(expressionListbox.variantListVisible('suggest', lazy({suggestHasContent: false})), false);
    });

    test('variant rules: a variant the classifier never answers with fails loudly, prototype names included', () => {
        for (const variant of ['grid', '', 'constructor', 'toString']) {
            assert.throws(() => expressionListbox.variantCommit(variant, {value: 'x'}, lazy({replacesValue: false})), /variant/, variant);
            assert.throws(() => expressionListbox.variantAddsToList(variant, lazy({replacesValue: false})), /variant/, variant);
            assert.throws(() => expressionListbox.variantListVisible(variant, lazy({suggestHasContent: true})), /variant/, variant);
        }
    });

    test('dropdownOwnedBy: an unnamed asker owns whatever is open; a named one only its own list', () => {
        const openControl = lazy({control: 'attribute'});

        assert.strictEqual(expressionListbox.dropdownOwnedBy(undefined, openControl.control), true);
        assert.deepStrictEqual(openControl.asked, [], 'an unnamed asker never reads which list is open');
        assert.strictEqual(expressionListbox.dropdownOwnedBy('attribute', openControl.control), true);
        assert.strictEqual(expressionListbox.dropdownOwnedBy('value-select', openControl.control), false);
        assert.strictEqual(expressionListbox.dropdownOwnedBy('', lazy({control: ''}).control), true);
    });

    test('highlightedItem: the entry at the highlight, null for none or a highlight past the list', () => {
        assert.strictEqual(expressionListbox.highlightedItem(flat, 1), flat[1]);
        assert.strictEqual(expressionListbox.highlightedItem(flat, -1), null);
        assert.strictEqual(expressionListbox.highlightedItem(flat, 3), null);
        assert.strictEqual(expressionListbox.highlightedItem([], 0), null);
    });

    test('editorKeyFallthrough: a list-only value editor swallows a stray Enter, a free-text one commits its text', () => {
        assert.deepStrictEqual(expressionListbox.editorKeyFallthrough('value', 'Enter'), {name: 'none', consumed: true},
            'an Enter with nothing highlighted would submit the admin form');
        assert.deepStrictEqual(expressionListbox.editorKeyFallthrough('value', 'a'), {name: 'none', consumed: false});
        assert.deepStrictEqual(expressionListbox.editorKeyFallthrough('free-text', 'Enter'), {name: 'commitText', consumed: true});
        assert.deepStrictEqual(expressionListbox.editorKeyFallthrough('free-text', 'Tab'), {name: 'none', consumed: false});
        assert.throws(() => expressionListbox.editorKeyFallthrough('constructor', 'Enter'), /editor/);
    });

    test('closedComboText: the query while open, the option label once closed, a stale value as itself', () => {
        const text = (answers) => expressionListbox.closedComboText(lazy(answers));

        assert.strictEqual(text({isOpenHere: true, query: 'col', option: null, selected: 'x'}), 'col');
        assert.strictEqual(text({isOpenHere: true, query: null, option: null, selected: 'x'}), '');
        assert.strictEqual(text({isOpenHere: false, query: 'col', option: {value: 'color', label: '—— Colour'}, selected: 'color'}),
            'Colour', 'the label is shown without its depth prefix');
        assert.strictEqual(text({isOpenHere: false, query: '', option: null, selected: 'gone_attribute'}), 'gone_attribute');
        assert.strictEqual(text({isOpenHere: false, query: '', option: null, selected: 12}), '12');
        assert.strictEqual(text({isOpenHere: false, query: '', option: null, selected: null}), '');
        assert.strictEqual(text({isOpenHere: false, query: '', option: null, selected: undefined}), '');
    });

    test('closedComboText: an open control never builds its option, a closed one never reads the query', () => {
        const open = lazy({isOpenHere: true, query: 'a', option: null, selected: ''});
        const closed = lazy({isOpenHere: false, query: 'a', option: {value: 'a', label: 'A'}, selected: 'a'});

        expressionListbox.closedComboText(open);
        expressionListbox.closedComboText(closed);
        assert.deepStrictEqual(open.asked, ['isOpenHere', 'query']);
        assert.deepStrictEqual(closed.asked, ['isOpenHere', 'option']);
    });

    test('closedComboCode: the chosen option\'s code while closed, nothing while open or without an option', () => {
        const code = (answers) => expressionListbox.closedComboCode(lazy(answers));

        assert.strictEqual(code({isOpenHere: false, option: {value: 'color_x', label: 'Colour'}}), 'color_x');
        assert.strictEqual(code({isOpenHere: false, option: {value: 'Colour', label: 'Colour'}}), '',
            'a code equal to its label is not printed twice');
        assert.strictEqual(code({isOpenHere: false, option: null}), '');
        assert.strictEqual(code({isOpenHere: true, option: {value: 'color_x', label: 'Colour'}}), '');
    });

    return tests;
}
