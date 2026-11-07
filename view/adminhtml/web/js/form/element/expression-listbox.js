/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Pure rules of the builder's dropdowns: the keyboard pattern every dropdown variant shares — flat
 * option lists, the option tree, the type-ahead lists and the searchable single-selects — and the
 * rules saying which of those variants a row's open dropdown is and how each one behaves.
 *
 * A key on a dropdown's input is resolved into one ACTION — close, open, move the highlight,
 * commit the highlighted entry, toggle its selection or its expansion, drop the highlight, or
 * nothing — and whether the key was consumed. The component applies the action; how each one
 * writes the row is its business. The pattern:
 *
 * - ArrowDown and ArrowUp move the highlight over the entries the dropdown renders (ArrowDown
 *   from nothing lands on the first, ArrowUp on the last; ArrowUp off the top clears the
 *   highlight, which is how an admin gets back to the text they typed). Enter commits the
 *   highlighted entry. Escape closes an open dropdown. A dropdown closed by Escape re-opens on
 *   ArrowDown without needing a re-focus.
 * - In the option tree, ArrowRight expands the highlighted parent and ArrowLeft collapses it, and
 *   Space toggles the highlighted node's selection — the tree's only way to deselect from the
 *   keyboard, since Enter on a collapsed parent is spoken for by expansion. Home and End jump to
 *   the ends of the list.
 * - Keys a text input needs are taken over only once a highlight exists: ArrowLeft, ArrowRight,
 *   Home and End move the caret while the admin types, and act on the list only after ArrowDown
 *   has entered it. Space is taken over on the same terms and only in the tree, which has no
 *   search text — so a space typed into a breadcrumb query is never swallowed. Every other key,
 *   every character and every deletion, drops the highlight: it is about to change the query the
 *   list was built from.
 *
 * What the dropdown currently looks like arrives through a probe the component implements, asked
 * only for what the key needs and in the order it needs it — a key on a closed dropdown never
 * makes the component build the list it is not showing.
 *
 * Around that pattern sit the other rules every dropdown answers by: which variant the open one is
 * (a searchable single-select, the option tree, the type-ahead suggestions or a flat option list),
 * whether its list is on screen, what committing an entry writes and whether picking adds to a
 * list, which of a row's comboboxes owns the open list, which entry is highlighted, what a value
 * editor does with a key the pattern left alone, and what a searchable single-select's input shows
 * while its list is closed. Every answer is a value — a boolean, an entry, a text, or an action the
 * component applies — and the facts behind it arrive through probes asked lazily, in the order the
 * rule needs them.
 *
 * Side-effect free, so the same file runs in the admin bundle and under plain Node
 * (Test/Js/run.mjs).
 */
define([
    'Hryvinskyi_UiFormElements/js/form/element/expression-options'
], function (expressionOptions) {
    'use strict';

    /**
     * Keys the pattern reserves, plus the bare modifiers. Everything outside this set edits the
     * input's text and so drops the highlight; the modifiers are listed because pressing one alone
     * changes no text. Membership is tested with `=== true`, so a key name that spells an
     * Object.prototype member cannot read as reserved.
     */
    var NAVIGATION_KEYS = {
        'ArrowDown': true,
        'ArrowUp': true,
        'ArrowLeft': true,
        'ArrowRight': true,
        'Home': true,
        'End': true,
        'Enter': true,
        'Escape': true,
        'Tab': true,
        'Shift': true,
        'Control': true,
        'Alt': true,
        'Meta': true
    };

    /**
     * The name of a key event, from its `key`. An event without one reads as no key at all, which
     * every rule treats as a key that edits the text.
     *
     * @param {*} event Key event.
     * @returns {String}
     */
    function keyName(event) {
        return event && typeof event.key === 'string' ? event.key : '';
    }

    /**
     * True when the key leaves the input's text as it is.
     *
     * @param {String} key Normalised key name.
     * @returns {Boolean}
     */
    function isNavigationKey(key) {
        return Object.prototype.hasOwnProperty.call(NAVIGATION_KEYS, key) && NAVIGATION_KEYS[key] === true;
    }

    /**
     * The highlight after one step.
     *
     * -1 is the position of the typed text, above the first entry: moving down from it enters the
     * list, moving up off the first entry returns to it, and moving up from it wraps to the last
     * entry, so a short list is reachable from either direction. Moving down off the last entry
     * stays there — running past the end must not silently drop the entry Enter is about to
     * commit. An empty list has nothing to highlight.
     *
     * @param {Number} current The highlighted position, -1 for none.
     * @param {Number} count How many entries the list holds.
     * @param {Number} step +1 down, -1 up.
     * @returns {Number}
     */
    function nextHighlight(current, count, step) {
        var next = current + step;

        if (count === 0) {
            return -1;
        }

        if (next < -1 || next >= count) {
            return count - 1;
        }

        return next;
    }

    /**
     * An action that leaves the key to the browser, dropping the highlight unless the key leaves
     * the text alone.
     *
     * @param {String} key
     * @returns {{name: String, consumed: Boolean}}
     */
    function release(key) {
        return {name: isNavigationKey(key) ? 'none' : 'clearHighlight', consumed: false};
    }

    /**
     * What a key does to a dropdown with a highlighted entry.
     *
     * @param {String} key
     * @param {Object} item The highlighted entry.
     * @param {Number} count How many entries the list holds.
     * @param {Object} probe The dropdown's probe.
     * @returns {Object} The action.
     */
    function activeEntryAction(key, item, count, probe) {
        if (key === 'Enter') {
            return {name: 'commit', consumed: true, item: item};
        }

        if (key === ' ' && probe.showsTree()) {
            return {name: 'toggleSelection', consumed: true, value: item.value};
        }

        if (key === 'Home' || key === 'End') {
            return {name: 'highlight', consumed: true, index: key === 'Home' ? 0 : count - 1};
        }

        // Only a parent in the state the key would change reacts; anything else leaves the key to
        // the caret, so arrowing through the search text never toggles a node.
        if ((key === 'ArrowRight' || key === 'ArrowLeft') && probe.showsTree()
            && item.hasChildren && item.expanded === (key === 'ArrowLeft')) {
            return {name: 'toggleExpansion', consumed: true, value: item.value};
        }

        return release(key);
    }

    /**
     * The action a key takes on a dropdown.
     *
     * The probe answers, when asked: `isOpen()` — the dropdown is open; `isListVisible()` — its
     * list is on screen; `items()` — the entries it renders, in order; `activeIndex()` — the
     * highlighted position, -1 for none; `showsTree()` — it renders the option tree.
     *
     * Actions: `none` and `clearHighlight` leave the key to the browser; `close`, `open`,
     * `highlight` (with `index`), `commit` (with `item`), `toggleSelection` and `toggleExpansion`
     * (with `value`) consume it.
     *
     * @param {String} key Normalised key name.
     * @param {{
     *     isOpen: Function,
     *     isListVisible: Function,
     *     items: Function,
     *     activeIndex: Function,
     *     showsTree: Function
     * }} probe
     * @returns {{name: String, consumed: Boolean, index: (Number|undefined), item: *, value: *}}
     */
    function dropdownKeyAction(key, probe) {
        var items;
        var active;

        if (key === 'Escape') {
            return probe.isOpen() ? {name: 'close', consumed: true} : {name: 'none', consumed: false};
        }

        if (!probe.isListVisible()) {
            if (key === 'ArrowDown' && !probe.isOpen()) {
                return {name: 'open', consumed: true};
            }

            return release(key);
        }
        items = probe.items();

        if (key === 'ArrowDown' || key === 'ArrowUp') {
            return {
                name: 'highlight',
                consumed: true,
                index: nextHighlight(probe.activeIndex(), items.length, key === 'ArrowDown' ? 1 : -1)
            };
        }
        active = probe.activeIndex();

        if (active < 0 || active >= items.length) {
            return release(key);
        }

        return activeEntryAction(key, items[active], items.length, probe);
    }

    /**
     * Which variant a row's open dropdown is: a searchable single-select (`select`), the option
     * tree (`tree`), the type-ahead suggestions (`suggest`) or a flat option list (`list`).
     *
     * Asked in that order and only as far as needed: the dropdown's owner decides first — a
     * searchable single-select's list has nothing to do with the row's value editor — then the
     * value editor's shape. The probe answers `isSearchableSelect()`, `showsTree()` and
     * `usesSuggestions()`.
     *
     * @param {{isSearchableSelect: Function, showsTree: Function, usesSuggestions: Function}} probe
     * @returns {String}
     */
    function dropdownVariant(probe) {
        if (probe.isSearchableSelect()) {
            return 'select';
        }

        if (probe.showsTree()) {
            return 'tree';
        }

        return probe.usesSuggestions() ? 'suggest' : 'list';
    }

    /**
     * True when a row's dropdown renders the collapsible option tree: the open list belongs to the
     * row's value editor, its options are a hierarchy, and nothing is typed into its search. Typing
     * switches the dropdown to the flat breadcrumb list; clearing the search brings the tree back.
     *
     * A list owned by a searchable single-select is never the tree, whatever the row's value
     * options look like: both controls share the row's dropdown state, and the Attribute control
     * above a category tree would otherwise inherit the tree's keys — Space would toggle a category
     * instead of the highlighted attribute.
     *
     * @param {{isSearchableSelect: Function, hasHierarchy: Function, searchText: Function}} probe
     * @returns {Boolean}
     */
    function rowShowsTree(probe) {
        return !probe.isSearchableSelect()
            && probe.hasHierarchy()
            && String(probe.searchText() || '').trim() === '';
    }

    /**
     * True when a row's dropdown is fed by the type-ahead rather than by an option list: its
     * attribute has no loaded option list, and its backend suggests values. A loaded list
     * outranks the suggestions.
     *
     * @param {{hasOptions: Function, supportsSuggest: Function}} probe
     * @returns {Boolean}
     */
    function rowUsesSuggestList(probe) {
        return !probe.hasOptions() && probe.supportsSuggest();
    }

    /**
     * True for the one dropdown that replaces the row's value instead of adding to a list: the
     * single-value type-ahead. The flat option lists, the option tree and the multi-value
     * type-ahead all append a value.
     *
     * @param {{usesSuggestList: Function, usesListOperator: Function}} probe
     * @returns {Boolean}
     */
    function dropdownReplacesValue(probe) {
        return probe.usesSuggestList() && !probe.usesListOperator();
    }

    /**
     * What each dropdown variant does when an entry is committed — the keyboard's Enter, or a
     * click on the entry — whether picking adds to a list rather than settling one value, and
     * whether its open list is on screen without further question. A closed set: one entry per
     * variant dropdownVariant() answers with.
     *
     * A commit answers an action the component applies: `settle` (a single-select takes the value
     * and closes), `toggleExpansion` and `toggleSelection` (a tree node), `replace` (the value is
     * replaced and the list closes) and `append` (the value joins the row's list as a pill).
     */
    var VARIANTS = {
        /**
         * A searchable single-select settles one value and closes, and always has matches or the
         * "no matches" verdict over its own option list to show.
         */
        'select': {
            listedWhileOpen: true,
            commit: function (item) {
                return {name: 'settle', value: item.value};
            },
            addsToList: function () {
                return false;
            }
        },

        /**
         * The option tree: a commit on a collapsed parent expands it, any other commit toggles the
         * node's selection — so Enter reaches a branch, and Space (the keyboard pattern's) selects.
         */
        'tree': {
            listedWhileOpen: true,
            commit: function (item) {
                return {
                    name: item.hasChildren && !item.expanded ? 'toggleExpansion' : 'toggleSelection',
                    value: item.value
                };
            },
            addsToList: function () {
                return true;
            }
        },

        /**
         * The type-ahead: the single-value one replaces the value and closes, the multi-value one
         * appends a pill, as the row says at the moment of the commit. Its list is on screen only
         * while there is something to say, which is the suggestions' own rule.
         */
        'suggest': {
            listedWhileOpen: false,
            commit: function (item, probe) {
                return {name: probe.replacesValue() ? 'replace' : 'append', value: item.value};
            },
            addsToList: function (probe) {
                return !probe.replacesValue();
            }
        },

        /**
         * A flat option list appends the picked value, and always has matches or the "no matches"
         * verdict to show while open.
         */
        'list': {
            listedWhileOpen: true,
            commit: function (item) {
                return {name: 'append', value: item.value};
            },
            addsToList: function () {
                return true;
            }
        }
    };

    /**
     * The rules of one dropdown variant. A name the classifier never answers with — a prototype
     * member's name included — fails loudly instead of degrading to some variant's behaviour.
     *
     * @param {String} variant
     * @returns {Object}
     * @throws {Error} For an unknown variant.
     */
    function variantRules(variant) {
        if (typeof variant !== 'string' || !Object.prototype.hasOwnProperty.call(VARIANTS, variant)) {
            throw new Error('Unknown dropdown variant "' + String(variant) + '".');
        }

        return VARIANTS[variant];
    }

    /**
     * The action committing one entry of a dropdown of this variant takes.
     *
     * @param {String} variant From dropdownVariant().
     * @param {{value: *, hasChildren: (Boolean|undefined), expanded: (Boolean|undefined)}} item
     * @param {{replacesValue: Function}} probe Asked only by the type-ahead.
     * @returns {{name: String, value: *}}
     */
    function variantCommit(variant, item, probe) {
        return variantRules(variant).commit(item, probe);
    }

    /**
     * True when picking from a dropdown of this variant adds to a list of values rather than
     * settling one — the claim `aria-multiselectable` makes.
     *
     * @param {String} variant From dropdownVariant().
     * @param {{replacesValue: Function}} probe Asked only by the type-ahead.
     * @returns {Boolean}
     */
    function variantAddsToList(variant, probe) {
        return variantRules(variant).addsToList(probe);
    }

    /**
     * True when the open list of a dropdown of this variant is on screen: always for the
     * option-backed variants, and for the type-ahead only while it has something to say.
     *
     * @param {String} variant From dropdownVariant().
     * @param {{suggestHasContent: Function}} probe Asked only by the type-ahead.
     * @returns {Boolean}
     */
    function variantListVisible(variant, probe) {
        return variantRules(variant).listedWhileOpen || probe.suggestHasContent();
    }

    /**
     * True when the row's open dropdown belongs to the asking combobox. A row hosts more than one
     * combobox and they share one dropdown state, so a named asker owns only its own list; an
     * asker that names no control — a key handler on the input that owns the list — owns
     * whatever is open, and never reads which that is.
     *
     * @param {String|undefined} askingControl Control name of the asking combobox, or undefined.
     * @param {Function} openControlOf Answers the control name the open dropdown belongs to.
     * @returns {Boolean}
     */
    function dropdownOwnedBy(askingControl, openControlOf) {
        return askingControl === undefined || openControlOf() === askingControl;
    }

    /**
     * The highlighted entry, or null when nothing is highlighted or the highlight points past the
     * list. Validated at the point of use, because the list re-filters on every keystroke, pick and
     * arriving suggestion.
     *
     * @param {Array} items The entries the dropdown renders.
     * @param {Number} index The highlighted position, -1 for none.
     * @returns {*}
     */
    function highlightedItem(items, index) {
        return index >= 0 && index < items.length ? items[index] : null;
    }

    /**
     * What a value editor does with a key the shared pattern left to the browser, by editor:
     *
     * - `value`, an editor that takes its values from the list only: an Enter with nothing
     *   highlighted has nothing to commit, and inside the admin form an unhandled Enter submits
     *   it, so the Enter is swallowed;
     * - `free-text`, a multi-value editor whose typed text is a value of its own: Enter commits
     *   the text as typed.
     *
     * Every other key stays with the browser.
     */
    var EDITOR_FALLTHROUGH = {
        'value': function (key) {
            return {name: 'none', consumed: key === 'Enter'};
        },
        'free-text': function (key) {
            return key === 'Enter' ? {name: 'commitText', consumed: true} : {name: 'none', consumed: false};
        }
    };

    /**
     * The action a value editor takes on a key the shared pattern did not consume.
     *
     * @param {String} editor `value` or `free-text`.
     * @param {String} key Normalised key name.
     * @returns {{name: String, consumed: Boolean}}
     * @throws {Error} For an editor that has no rule.
     */
    function editorKeyFallthrough(editor, key) {
        if (typeof editor !== 'string' || !Object.prototype.hasOwnProperty.call(EDITOR_FALLTHROUGH, editor)) {
            throw new Error('Unknown value editor "' + String(editor) + '".');
        }

        return EDITOR_FALLTHROUGH[editor](key);
    }

    /**
     * What a searchable single-select's input shows: the query while its own list is open, the
     * chosen option's label without its depth prefix once it is closed, and a value matching no
     * option — a stored code whose attribute has since gone — as itself, so a stale choice is
     * visible rather than an empty control.
     *
     * @param {{isOpenHere: Function, query: Function, option: Function, selected: Function}} probe
     *     `option()` answers the chosen option or null, `selected()` the raw chosen value.
     * @returns {String}
     */
    function closedComboText(probe) {
        var option;
        var selected;

        if (probe.isOpenHere()) {
            return String(probe.query() || '');
        }
        option = probe.option();

        if (option !== null) {
            return expressionOptions.displayLabel(option.label);
        }
        selected = probe.selected();

        return selected === null || selected === undefined ? '' : String(selected);
    }

    /**
     * The chosen option's code, as a closed searchable single-select's secondary text — on a list
     * whose labels repeat, the code is what tells the choices apart. Nothing while the list is
     * open, where the query owns the input and every entry carries its own code, and nothing when
     * the code is the label.
     *
     * @param {{isOpenHere: Function, option: Function}} probe
     * @returns {String}
     */
    function closedComboCode(probe) {
        var option;

        if (probe.isOpenHere()) {
            return '';
        }
        option = probe.option();

        return option === null ? '' : expressionOptions.optionCode(option);
    }

    return {
        dropdownVariant: dropdownVariant,
        rowShowsTree: rowShowsTree,
        rowUsesSuggestList: rowUsesSuggestList,
        dropdownReplacesValue: dropdownReplacesValue,
        variantCommit: variantCommit,
        variantAddsToList: variantAddsToList,
        variantListVisible: variantListVisible,
        dropdownOwnedBy: dropdownOwnedBy,
        highlightedItem: highlightedItem,
        editorKeyFallthrough: editorKeyFallthrough,
        closedComboText: closedComboText,
        closedComboCode: closedComboCode,
        keyName: keyName,
        isNavigationKey: isNavigationKey,
        nextHighlight: nextHighlight,
        dropdownKeyAction: dropdownKeyAction
    };
});
