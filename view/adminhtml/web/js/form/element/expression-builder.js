/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The expression builder's Knockout component — the presentation layer over the pure modules
 * beside it.
 *
 * It owns what only a browser component can: the observable view-model tree the templates render,
 * the bindings' accessors, every user-facing phrase, focus, timers, sending the requests to the
 * consumer's endpoints, the pointer drag's state, and the field value it keeps in step with the
 * authored tree. Every rule it applies lives in a pure module and is tested under plain Node
 * (Test/Js/run.mjs); the component asks the question, hands the module the row's facts through a
 * probe, and applies the answer:
 *
 * - expression-tree.js — the condition tree's structure, the field value it loads from and saves
 *   as, what a group holds, the rule's summary
 * - expression-value.js — leaf-value shapes, the value-type and validator registries, the scalar
 *   editor's rules
 * - expression-options.js — option-list indexing, search and offers
 * - expression-config.js — reading the consumer's config and the tunables
 * - expression-fields.js — what a field descriptor says about a row, what a row carries over when
 *   its field or attribute changes, the plain or searchable single-select
 * - expression-condition.js — one stored leaf ⇄ the state of its row
 * - expression-coherence.js — which fields a row may pick, and the rule's warnings
 * - expression-reorder.js — where a node may move, by pointer or by keyboard, where each gap is
 *   measured and where the drop indicator sits, the depth cap
 * - expression-listbox.js — the dropdowns' keyboard pattern, their variants and what each one does
 *   on a commit, who owns the open list, what a closed searchable select shows
 * - expression-option-tree.js — the hierarchical picker's view state, its expand-all limit, toggling
 * - expression-list-value.js — editing a list value: append, remove, pills, clear-all, paste
 * - expression-preview.js — the structured preview's shape and its tokens
 * - expression-count.js — the match-count badge's rules
 * - expression-remote-options.js — the attribute-option and value-suggest endpoints' contract
 * - expression-requests.js — which request supersedes which, the deadline, the teardown
 *
 * One more module beside it is an adapter rather than a rule: expression-drag.js does a pointer
 * drag's DOM work (the pointer capture, the Escape listener, measuring the rendered nodes) for
 * this component, which keeps the drag's state.
 *
 * The public surface is unchanged by that split: the templates call the same members, and a
 * consumer's ui_component config passes the same options.
 */
define([
    'Magento_Ui/js/form/element/abstract',
    'ko',
    'underscore',
    'mage/translate',
    'Hryvinskyi_UiFormElements/js/form/element/expression-tree',
    'Hryvinskyi_UiFormElements/js/form/element/expression-value',
    'Hryvinskyi_UiFormElements/js/form/element/expression-options',
    'Hryvinskyi_UiFormElements/js/form/element/expression-config',
    'Hryvinskyi_UiFormElements/js/form/element/expression-fields',
    'Hryvinskyi_UiFormElements/js/form/element/expression-condition',
    'Hryvinskyi_UiFormElements/js/form/element/expression-coherence',
    'Hryvinskyi_UiFormElements/js/form/element/expression-reorder',
    'Hryvinskyi_UiFormElements/js/form/element/expression-listbox',
    'Hryvinskyi_UiFormElements/js/form/element/expression-option-tree',
    'Hryvinskyi_UiFormElements/js/form/element/expression-list-value',
    'Hryvinskyi_UiFormElements/js/form/element/expression-preview',
    'Hryvinskyi_UiFormElements/js/form/element/expression-count',
    'Hryvinskyi_UiFormElements/js/form/element/expression-remote-options',
    'Hryvinskyi_UiFormElements/js/form/element/expression-requests',
    'Hryvinskyi_UiFormElements/js/form/element/expression-drag'
], function (
    Abstract,
    ko,
    _,
    $t,
    expressionTree,
    expressionValue,
    expressionOptions,
    expressionConfig,
    expressionFields,
    expressionCondition,
    expressionCoherence,
    expressionReorder,
    expressionListbox,
    expressionOptionTree,
    expressionListValue,
    expressionPreview,
    expressionCount,
    expressionRemoteOptions,
    expressionRequests,
    expressionDrag
) {
    'use strict';

    /**
     * The structured preview's template, by the name the builder template renders it under.
     *
     * Named here because the preview is the one template this element renders CONDITIONALLY — it
     * exists only once the authored rule has something to show — and that has to be compensated for
     * at load time (see _preloadPreviewTemplate).
     */
    var PREVIEW_TEMPLATE = 'Hryvinskyi_UiFormElements/form/element/expression-preview';

    /*
     * Wording rules for this file, both mechanical:
     *
     *  1. Every user-visible phrase the COMPONENT owns goes through $t, including the ones handed to
     *     the template through accessors (placeholders, titles, accessible names, state rows).
     *     Phrases the CONSUMER owns — emptyStateMessage, the coherence warnings, countLabel, a
     *     field's placeholder and every option/operator label — arrive already translated from PHP
     *     `__()` and must never be wrapped again: doing so would look up an already-translated
     *     phrase and, in any non-English locale, silently fall back to it.
     *  2. Every $t call takes exactly ONE single-line quoted literal: no concatenation, no variable,
     *     no multi-line argument. The translation dictionary is extracted from these call sites by
     *     pattern, so a call built at runtime is a phrase that ships untranslatable. Parameterised
     *     phrases therefore keep their `%1` inside the literal and substitute afterwards, which is
     *     also what lets a translator move the placeholder within the sentence. Substituting text
     *     that is not a number goes through split/join, so a value containing a `$` sequence cannot
     *     be read as a replacement pattern.
     *
     * Note that the extraction is textual and reads this file whole: a $t call written into a
     * comment as an example would be extracted like any other, so examples here name the phrases
     * without spelling out the call.
     *
     * No test enforces either rule, nor keeps i18n/en_US.csv equal to the phrases this module
     * renders: both are kept in review. The pure modules carry no wording at all.
     */

    /**
     * Presentation map for the advisory value validators: validator name → message rendered under
     * the value editor on failure. The predicates themselves are the value module's named-strategy
     * registry (expressionValue.validators); this map is deliberately messages-only, so the pure
     * module carries no user-facing text. The names are the component's own vocabulary — consumer
     * configs pick one through an operator's `validate` key, or inherit the row's value-type
     * default. An operator entry's own `validateMessage` outranks this map, and a validator with
     * no entry here falls back to the generic invalid-value message, so consumer-registered
     * validators are never silently messageless.
     *
     * Translated at definition time, which is safe: `mage/translate` lists the dictionary among its
     * own dependencies, so it is loaded before this factory runs.
     */
    var VALIDATOR_MESSAGES = {
        'regex': $t('Invalid regular expression'),
        'number': $t('Enter a number'),
        'integer': $t('Enter a whole number'),
        'float': $t('Enter a number'),
        'email': $t('Enter a valid email address'),
        'not-empty': $t('Value required')
    };

    /**
     * The nudge under a value editor, by what the editor still needs (expression-value
     * emptyValueNeeds()): nothing once it holds a value, and a phrase shaped by the editor while it
     * is empty — list-valued editors take several values, every other editor one.
     */
    var EMPTY_VALUE_HINTS = {
        'none': '',
        'several': $t('Pick at least one value to complete this condition.'),
        'one': $t('Enter a value to complete this condition.')
    };

    /**
     * The searchable single-selects a row can host, keyed by the control name its markup passes
     * around, each one saying where its options come from, what is currently chosen and what
     * choosing means.
     *
     * A registry rather than a branch per control, for the same reason the value-type editors are
     * one: the two controls differ ONLY in those three answers — the markup, the ARIA contract, the
     * roving highlight, the search and the closed-state display are shared, and a second branch
     * would be the place where one of them silently stops applying to one of the controls. Adding a
     * third searchable select is an entry here plus its markup, never a change to the machinery.
     *
     * `commit` is deliberately a call INTO the component rather than a write of its own where one
     * exists: switching the attribute has to reset the operator and clear the value, and that
     * behaviour belongs to the method the plain `<select>` already called.
     *
     * The control names are the component's own vocabulary. They are written as literals in the
     * markup — a template cannot read a module-private constant — so they are listed here once and
     * every use site spells the same string.
     */
    var SEARCHABLE_SELECTS = {
        /**
         * The product-attribute picker's Attribute control. Always searchable: this list is the
         * catalogue's whole attribute set, and it is the one list whose labels are known to repeat.
         */
        'attribute': {
            options: function (component, row) {
                return component.attributesFor(row);
            },
            selected: function (component, row) {
                return row.productAttribute();
            },
            commit: function (component, row, value) {
                component.setProductAttribute(row, value);
            }
        },

        /**
         * A `select`-valueType field's value control, once its option list outgrows the configured
         * threshold. The commit writes the option's value VERBATIM — the same thing the plain
         * `<select>` this replaces wrote, which is what keeps an untouched rule serialising
         * byte-identically after a switch through the new control.
         */
        'value-select': {
            options: function (component, row) {
                return component.valueOptionsFor(row);
            },
            selected: function (component, row) {
                return row.value();
            },
            commit: function (component, row, value) {
                row.value(value);
            }
        },

        /**
         * An optioned attribute's single value on a Product Attribute row, once THAT attribute's
         * option list outgrows the same threshold — a brand list runs as long as any select
         * field's, and its option ids are what tell two same-named brands apart. The commit is
         * the same verbatim value write the plain `<select>` performs, so escalating changes
         * nothing about what is serialised.
         */
        'attribute-value': {
            options: function (component, row) {
                return expressionFields.valueOptions(component.productAttributeInfo(row));
            },
            selected: function (component, row) {
                return row.value();
            },
            commit: function (component, row, value) {
                row.value(value);
            }
        }
    };

    /**
     * How the component applies each action the dropdown keyboard pattern resolves a key into
     * (expression-listbox.js). A closed set: one entry per action the pattern can answer with.
     */
    var DROPDOWN_KEY_ACTIONS = {
        'none': function () {},
        'clearHighlight': function (component, row) {
            row.activeOptionIndex(-1);
        },
        'close': function (component, row) {
            component.closeDropdown(row);
        },
        'open': function (component, row) {
            component.openDropdown(row);
        },
        'highlight': function (component, row, action) {
            row.activeOptionIndex(action.index);
            component._scrollHighlightIntoView(row);
        },
        'commit': function (component, row, action) {
            component.commitDropdownItem(row, action.item);
        },
        'toggleSelection': function (component, row, action) {
            component.toggleTreeNode(row, action.value);
        },
        'toggleExpansion': function (component, row, action) {
            component.toggleNode(row, action.value);
        }
    };

    /**
     * How the component applies what a value editor does with a key the dropdown pattern left alone
     * (expression-listbox editorKeyFallthrough()).
     */
    var EDITOR_KEY_ACTIONS = {
        'none': function () {},
        'commitText': function (component, row) {
            component.commitFreeTextValue(row);
        }
    };

    /**
     * The entries each dropdown variant (expression-listbox dropdownVariant()) offers, by the same
     * component accessor the variant's template renders from — so a list the keyboard walks is the
     * list on screen. A closed set: one entry per variant the classifier can answer with. What a
     * variant does with a commit, whether it adds to a list and whether its open list is on screen
     * are expression-listbox's rules.
     */
    var DROPDOWN_ITEMS = {
        'select': function (component, row) {
            return component.filteredSearchableOptions(row, row.dropdownControl()).items;
        },
        'tree': function (component, row) {
            return component.visibleTreeNodes(row);
        },
        'suggest': function (component, row) {
            return row.suggestedOptions();
        },
        'list': function (component, row) {
            return component.filteredDropdownOptions(row).items;
        }
    };

    /**
     * How the component applies each action a dropdown commit resolves into
     * (expression-listbox variantCommit()), each through the method the entry's click binding
     * calls, so Enter does what a click on the entry does. A closed set: one entry per action the
     * variants can answer with.
     */
    var DROPDOWN_COMMIT_ACTIONS = {
        'settle': function (component, row, value) {
            component.commitSearchableSelect(row, row.dropdownControl(), value);
        },
        'toggleExpansion': function (component, row, value) {
            component.toggleNode(row, value);
        },
        'toggleSelection': function (component, row, value) {
            component.toggleTreeNode(row, value);
        },
        'replace': function (component, row, value) {
            row.value(value);
            component.closeDropdown(row);
        },
        'append': function (component, row, value) {
            component.addOption(row, value);
        }
    };

    /**
     * How the component applies what a tree node's toggle resolves into
     * (expression-option-tree selectionToggle()), through the same writes a pill's remove button
     * and an option click perform.
     */
    var TREE_SELECTION_ACTIONS = {
        'deselect': function (component, row, value) {
            component.removeOption(row, value);
        },
        'select': function (component, row, value) {
            component.addOption(row, value);
        }
    };

    /**
     * The element whose box anchors an insertion slot's gap (expression-reorder slotAnchor()), by
     * its DOM id.
     */
    var SLOT_ANCHOR_IDS = {
        'child': function (component, group, anchor) {
            return component.nodeDomId(group.children()[anchor.child]);
        },
        'add': function (component, group) {
            return component.groupAddDomId(group);
        }
    };

    /**
     * The searchable-select definition one control name stands for, or null when the name is not a
     * searchable select — which includes the empty name a row carries before any dropdown has been
     * opened, and every other dropdown variant.
     *
     * Own-property tested rather than read straight off the object, so a control name that happens
     * to spell an Object.prototype member cannot resolve to one.
     *
     * @param {*} control Control name from a row's dropdown marker.
     * @returns {Object|null}
     */
    function searchableSelect(control) {
        return typeof control === 'string' && Object.prototype.hasOwnProperty.call(SEARCHABLE_SELECTS, control)
            ? SEARCHABLE_SELECTS[control]
            : null;
    }

    var rowSeq = 0;

    return Abstract.extend({
        defaults: {
            template: 'Hryvinskyi_UiFormElements/form/element/expression-builder',
            elementTmpl: 'Hryvinskyi_UiFormElements/form/element/expression-builder',
            builderConfig: {fields: [], combineType: '', emptyStateMessage: '', coherence: {}},
            // The framework's own label surface, deliberately empty: this element replaces the
            // standard field template, so the label/control wrap that would render this string
            // never exists here — a non-empty value would only reappear as a stray heading and an
            // input wrap around a widget that is not an input, in any form that does route this
            // element through the standard field template. A label a consumer sets in its form XML
            // is therefore taken over by the builder itself in initialize() and rendered as the
            // authoring area's own heading, instead of being dropped.
            label: '',

            // The numeric tunables below live here because `defaults` is the framework's override
            // surface: a form's ui_component XML can retune any of them per field without
            // touching this file, and _super() merges the override in. Every one is sanitised in
            // initialize() (see _tunable) — a nonsense value must degrade to the shipped one, not
            // blank a dropdown or stall the type-ahead.

            // How deeply groups may nest, counting the outermost group as level 1. THE cap: the
            // authoring button, the pointer drag and the keyboard move all read this one value, so
            // no path can nest past what another path allows. It stays well below the maximum
            // nesting the server accepts on save (which counts leaves one level below their group)
            // — that limit exists to bound the work of hydrating a posted tree, not to describe a
            // usable rule, and a rule that authors cleanly but fails to save would be the worst of
            // both.
            maxGroupDepth: 5,

            // Maximum number of matches an options-based dropdown lists. Category lists run into
            // the thousands, so both the flat filter and the breadcrumb search stop here; the
            // dropdown then appends the cap hint, whose wording interpolates this very number —
            // cap and hint can never drift apart.
            optionMatchCap: 100,

            // Largest hierarchical option list the "Expand all" action is offered for. Expanding
            // everything renders every node at once, and on a multi-thousand-entry catalog that is
            // thousands of rows in one synchronous render — the form stops responding. Above this
            // many options the action is therefore withdrawn and its sibling explains why, while
            // the per-node carets and the arrow keys still reach any branch. "Collapse all" has no
            // guard: it only ever removes rows.
            treeExpandAllLimit: 200,

            // Longest option list a single-value `select` field still renders as a plain
            // `<select>`. Above it the field gets the searchable combobox instead: a native select
            // has no search of its own, so a list an admin cannot scan is a list they cannot use —
            // and one whose labels repeat cannot even be read, since a native option shows nothing
            // but its label. Below it the plain control wins on every count (one keystroke to open,
            // native keyboard behaviour, no dropdown to manage), so the threshold is where scanning
            // stops being realistic rather than a number with a meaning of its own. The picker's
            // Attribute control does not consult it: that list is the whole attribute set and is
            // never short.
            searchableSelectThreshold: 15,

            // Pills rendered before a multi-value editor collapses the rest behind a toggle. A
            // pasted SKU list can hold hundreds of values; without a limit the row grows taller
            // than the screen.
            pillCollapseLimit: 15,

            // How long a paste hint stays under the pills, in milliseconds. Long enough to read a
            // skipped count, short enough that it never reads as a permanent error.
            pasteNoticeTimeout: 4000,

            // Shortest query the suggest endpoint is asked about, and the threshold below which a
            // fruitless search must stay silent: nothing was ever requested for a shorter query,
            // so an empty result means "still waiting for input", not "nothing exists". The
            // backing PHP suggester carries its own minimum, which is authoritative when the
            // config publishes it — see initialize().
            suggestMinQuery: 2,

            // Idle time before a keystroke turns into a suggest request, in milliseconds.
            suggestDebounce: 250,

            // Idle time before an edit turns into a match-count request, in milliseconds. Each
            // count is a catalog query, so this is deliberately the longest wait in the file:
            // typing a value must cost one count, not one per keystroke, while the number still
            // has to land while the admin is looking at the row they just edited.
            countDebounce: 600,

            // How the joining of a group's children is drawn: 'rail' runs a tinted line down
            // the group's left edge carrying the aggregator word, 'chip' spells the word
            // between every two children, 'none' keeps only the separator lines. One treatment
            // for the whole builder — mixed per group, one rule would read as three widgets.
            joinerStyle: 'rail',

            // Vertical rhythm of the condition rows: 'comfortable' is the shipped padding,
            // 'compact' tightens it for forms that embed the builder among a lot of chrome.
            density: 'comfortable',

            // Whether the preview block — structured preview, match-count badge, warnings —
            // renders at all. On by default: it is the only place the authored rule is stated
            // in words.
            showPreview: true
        },

        initialize: function () {
            var config;

            this._super();

            // Every computed this element creates, kept for destroy(): a computed outlives the
            // element unless it is disposed, and one that keeps walking a tree of observables the
            // form has already discarded is both a leak and a source of writes into a dead scope.
            this._disposables = [];

            // A consumer's form-XML label is the builder's own heading. `label` itself is cleared
            // (see `defaults`) so the framework's field wrap stays suppressed either way; without
            // this the configured wording would simply never be rendered anywhere.
            this.builderLabel = expressionConfig.textOrEmpty(this.label);
            this.label = '';

            // Wording and semantic rules are consumer-supplied, already translated by PHP; absent
            // keys mean no endpoint, no gating and no warnings (expression-config.js).
            config = expressionConfig.readBuilderConfig(this.builderConfig);
            this.fields = config.fields;
            this.combineType = config.combineType;
            this.suggestUrl = config.suggestUrl;
            this.emptyStateMessage = config.emptyStateMessage;
            this.coherence = config.coherence;
            this.countUrl = config.countUrl;
            this.countLabel = config.countLabel;
            this.countStoreId = config.countStoreId;
            this.optionsUrl = config.optionsUrl;
            this.operatorSets = config.operatorSets;

            // Sanitise the numeric tunables once, back onto the instance, so every use site can
            // read this.<name> verbatim instead of re-checking a value that may have come from XML.
            this.optionMatchCap = this._tunable('optionMatchCap');
            this.treeExpandAllLimit = this._tunable('treeExpandAllLimit');
            this.searchableSelectThreshold = this._tunable('searchableSelectThreshold');
            this.pillCollapseLimit = this._tunable('pillCollapseLimit');
            this.pasteNoticeTimeout = this._tunable('pasteNoticeTimeout');
            this.suggestDebounce = this._tunable('suggestDebounce');
            this.countDebounce = this._tunable('countDebounce');
            this.maxGroupDepth = this._tunable('maxGroupDepth');
            // The suggest threshold is server-authoritative: the backing suggester answers nothing
            // below its own minimum, so a component querying under it would render "no matches" for
            // input the backend never even looked at. A config that publishes the minimum therefore
            // outranks both the defaults value and any XML override of it.
            this.suggestMinQuery = expressionConfig.positiveNumber(
                config.suggestMinQuery,
                this._tunable('suggestMinQuery')
            );
            // The visual tunables follow the same contract as the numbers above: junk from the
            // XML degrades to the shipped value, never to a modifier class nothing styles.
            this.joinerStyle = this._tunableChoice('joinerStyle', expressionConfig.JOINER_STYLES);
            this.density = this._tunableChoice('density', expressionConfig.DENSITIES);
            this.showPreview = expressionConfig.enabledUnlessFalse(this.showPreview);

            this.fieldsByType = expressionConfig.indexFieldsByType(this.fields);

            // The authored expression is one recursive group tree: every group carries an all/any
            // aggregator and nests to arbitrary depth, leaves are condition rows. This mirrors the
            // stored Combine tree 1:1, so any stored shape loads and round-trips losslessly.
            this.rootGroup = ko.observable(this._buildGroup('all'));

            // Lazily-loaded attribute option lists. A landed list is written INTO the attribute
            // descriptor — the same object every option accessor and the tree-index cache already
            // read — and this observable is the reactivity beside that mutation: bumped once per
            // landed fetch, read by the accessors that decide which value editor renders. The two
            // plain maps carry what nothing renders from: in-flight de-duplication, and the codes
            // whose fetch failed (those rows degrade to the option-less editors, once).
            this.attributeOptionsVersion = ko.observable(0);
            this._optionRequests = {};
            this._optionErrors = {};

            this.previewTree = this._disposable(ko.computed(this._buildPreviewTree, this));
            this.ruleWarnings = this._disposable(ko.computed(this._validateRule, this));

            // Match-count state. The three observables are written together, always through
            // _setCount, so the badge can never pair one request's number with another's state.
            // 'idle' is the state of a rule there is nothing to count for — no endpoint, or an
            // empty tree — and it is the one state that renders no badge.
            this.matchCount = ko.observable(null);
            this.countCapped = ko.observable(false);
            this.countState = ko.observable('idle');
            this._countTimer = null;
            // Serialised tree the current count state belongs to, so a re-evaluation that produces
            // the same tree changes nothing. A plain field, deliberately not an observable: the
            // watching computed writes it, and reading an observable there would make the computed
            // depend on its own output.
            this._countedTree = null;

            // Reorder state. One drag can be in flight at a time, so it lives on the component
            // rather than per node: dragNode is the node the pointer picked up (null when no drag
            // is running) and dropTarget is the {group, index} insertion slot the indicator marks —
            // null whenever there is nowhere to drop, which is also what makes releasing the
            // pointer outside the builder a cancel. Both are observables because the template's
            // dragging modifier and drop indicator read them.
            this.dragNode = ko.observable(null);
            this.dropTarget = ko.observable(null);
            // Where the last completed move landed, for the reorder live region. Written for
            // keyboard moves and pointer drops alike — a move is invisible to a screen reader
            // otherwise, since the rendered order is all that changed.
            this.moveAnnouncement = ko.observable('');
            // The drag's DOM work — the pointer capture, the Escape listener, measuring the
            // rendered nodes — on the document this element is rendered in.
            this._drag = expressionDrag.createPointerDrag(document);

            // Every request this element sends, by what it answers for: a newer one aborts the one
            // it supersedes, each has a deadline, and destroy() aborts them all — so no answer is
            // ever written into a view-model that has moved on or been discarded.
            this._requests = expressionRequests.createRequestTracker({
                abortController: function () {
                    return new window.AbortController();
                },
                setTimer: function (callback, delay) {
                    return window.setTimeout(callback, delay);
                },
                clearTimer: function (timer) {
                    window.clearTimeout(timer);
                }
            });

            // The pending focus deferral, if any — see _focusLater.
            this._focusTimer = null;

            this._loadFromValue();
            this._bindAutoSave();
            this._bindMatchCount();
            this._preloadPreviewTemplate();

            return this;
        },

        /**
         * Asks for the structured preview's template before anything renders it.
         *
         * The preview is rendered behind a condition: the template binding that names it exists only
         * while the authored rule has something to show. So on a form that opens with no rule, that
         * binding — and therefore the REQUEST for the template — is created at the instant the admin
         * adds their first condition. Until the request lands the binding has nothing to render, so
         * the preview area sits blank at exactly the moment it is first looked at; and a request that
         * fails is memoised as a failure by the template renderer, which leaves the area blank for
         * the rest of the page's life with no error anywhere near it. A blank preview is the worst
         * shape this can fail in, because an authored rule then looks like an empty one.
         *
         * Asking up front moves both cases off the interaction path: the template is fetched
         * alongside everything else the element needs, and a failure shows up in the console while
         * the form loads instead of as a silently empty preview later.
         *
         * Deliberately guarded rather than declared as a module dependency. This is a warm-up of
         * Magento's template pipeline, not something the component's behaviour rests on — the preview
         * renders identically without it, just later — so outside the admin bundle it must simply not
         * happen. The guard tests the global itself and not merely the property on it, because this
         * runs from initialize(), which is also where a headless test harness enters: there `window`
         * is frequently not declared at all, and reading a property off an undeclared identifier is a
         * ReferenceError rather than undefined. The errback is what keeps an unavailable renderer
         * from becoming an unhandled loader failure.
         *
         * @returns {void}
         */
        _preloadPreviewTemplate: function () {
            if (typeof window === 'undefined' || typeof window.require !== 'function') {
                return;
            }
            window.require(
                ['Magento_Ui/js/lib/knockout/template/renderer'],
                function (renderer) {
                    renderer.render(PREVIEW_TEMPLATE);
                },
                function () {}
            );
        },

        /* ---------------- teardown ---------------- */

        /**
         * Registers a computed for disposal and hands it straight back, so a computed can be
         * created, tracked and assigned in one expression — the only shape that makes forgetting
         * one visible at the creation site.
         *
         * @param {Object} computed A ko.computed.
         * @returns {Object} The same computed.
         */
        _disposable: function (computed) {
            this._disposables.push(computed);

            return computed;
        },

        /**
         * Releases everything this element holds outside its own object graph.
         *
         * A form can destroy and rebuild a field — a modal closing, a dynamic-rows entry being
         * removed — and everything below survives that on its own otherwise: a live computed keeps
         * re-walking the authored tree and writing into a data scope nobody reads, a pending timer
         * fires into a discarded view-model, a request in flight answers into it, and a drag that
         * was in flight leaves a document-level key listener and a pointer capture behind, both of
         * which outlive every element they were created for.
         *
         * Order matters. The computeds go first, so tearing the rest down cannot make one
         * re-evaluate; the requests are aborted before anything else can start one, and an answer
         * already on its way is dropped rather than written; the drag release is last because it
         * writes observables the disposed computeds no longer watch. Every step is idempotent,
         * which is what makes a destroy with nothing in flight — the normal case — cost nothing.
         *
         * @param {Boolean} [skipUpdate] Framework flag, passed through untouched.
         * @returns {void}
         */
        destroy: function (skipUpdate) {
            _.each(this._disposables, function (computed) {
                if (computed && typeof computed.dispose === 'function') {
                    computed.dispose();
                }
            });
            this._disposables = [];
            this._requests.dispose();

            if (this._countTimer) {
                clearTimeout(this._countTimer);
                this._countTimer = null;
            }

            if (this._focusTimer) {
                clearTimeout(this._focusTimer);
                this._focusTimer = null;
            }
            this._clearRowTimers(this.rootGroup());
            this._releaseDrag();
            this._super(skipUpdate);
        },

        /**
         * Clears the per-row timers of a group's whole subtree.
         *
         * Recursive, because rows sit at any depth: a flat sweep over the root group's children
         * would leave every nested group's rows holding their timers, and a suggest debounce that
         * fires after the element is gone writes suggestions into a view-model nothing renders.
         *
         * @param {Object} group Group view-model to sweep.
         * @returns {void}
         */
        _clearRowTimers: function (group) {
            _.each(group.children(), function (child) {
                if (child.kind === 'group') {
                    this._clearRowTimers(child);

                    return;
                }

                if (child._suggestTimer) {
                    clearTimeout(child._suggestTimer);
                    child._suggestTimer = null;
                }

                if (child._pasteTimer) {
                    clearTimeout(child._pasteTimer);
                    child._pasteTimer = null;
                }
            }, this);
        },

        /* ---------------- tunables ---------------- */

        /**
         * Reads one of the numeric tunables off the instance as a positive finite number.
         *
         * The value arrives from `defaults` merged with whatever a form's ui_component XML set for
         * this field. Anything unusable degrades to the class-level default — the shipped value in
         * `defaults`, which instance config cannot reach; the final floor of 1 only triggers if this
         * file's own `defaults` entry is broken.
         *
         * @param {String} name Tunable's key in `defaults`.
         * @returns {Number} A positive finite number.
         */
        _tunable: function (name) {
            var shipped = (this.constructor && this.constructor.defaults) || {};

            return expressionConfig.positiveNumber(this[name], expressionConfig.positiveNumber(shipped[name], 1));
        },

        /**
         * Reads one of the string tunables off the instance, constrained to its known values;
         * anything else degrades to the class-level default.
         *
         * @param {String} name Tunable's key in `defaults`.
         * @param {Array.<String>} allowed Values the tunable may take.
         * @returns {String} One of the allowed values.
         */
        _tunableChoice: function (name, allowed) {
            var shipped = (this.constructor && this.constructor.defaults) || {};

            return expressionConfig.oneOf(this[name], allowed, shipped[name]);
        },

        /* ---------------- nesting depth ---------------- */

        /**
         * True when a group at this nesting level may still take a child group — the template's
         * guard on the "add group" action.
         *
         * Depth counts the outermost group as 1, so a group at depth d puts its children at d + 1
         * and the answer is whether that still fits under the cap (expression-reorder
         * canNestGroupAt()). The cap arrives through
         * the sanitised tunable rather than as a literal here, so the authoring button and the
         * reorder paths cannot end up disagreeing about how deep a rule may go.
         *
         * @param {Number} depth Nesting level of the group asking (1 for the outermost).
         * @returns {Boolean}
         */
        canAddGroupAt: function (depth) {
            return expressionReorder.canNestGroupAt(depth, this.maxGroupDepth);
        },

        /**
         * How many group levels a node occupies: 0 for a condition row, 1 for a group whose
         * children are all rows, one more per further level (expression-tree height()).
         *
         * @param {Object} node Row or group view-model.
         * @returns {Number}
         */
        _heightOf: function (node) {
            return expressionTree.height(this._shapeOf(node));
        },

        /**
         * True when moving a node into one insertion slot keeps the whole tree inside the depth cap.
         *
         * @param {Array.<Number>} slotPath Receiving group path plus insertion index.
         * @param {Object} node Row or group view-model being moved.
         * @returns {Boolean}
         */
        _slotFits: function (slotPath, node) {
            return expressionReorder.slotFits(slotPath, this._heightOf(node), this.maxGroupDepth);
        },

        /* ---------------- public Knockout-bound methods ---------------- */

        /**
         * Adds a condition row to the root group. Kept as the generic entry point for bindings
         * that do not address a specific group.
         */
        addRow: function () {
            this.addRowToGroup(this.rootGroup());
        },

        /**
         * Appends a fresh condition row (first configured field, its defaults) to a group and
         * lands the keyboard on it, so building a rule needs no reach for the mouse between rows.
         *
         * @param {Object} group Group view-model receiving the row.
         */
        addRowToGroup: function (group) {
            var row = this._buildRow(expressionFields.defaultField(this.fields));

            group.children.push(row);
            this._focusLater(this.rowFieldDomId(row));
        },

        /**
         * Appends a fresh empty child group. The child starts on the opposite aggregator of its
         * parent's current one — nesting a group almost always means switching between AND and OR.
         * Focus lands on the new group's add-condition button: an empty group has nothing else to
         * edit, and that is the action every fresh group needs next.
         *
         * @param {Object} group Parent group view-model.
         */
        addGroupToGroup: function (group) {
            var child = this._buildGroup(expressionTree.oppositeAggregator(group.aggregator()));

            group.children.push(child);
            this._focusLater(this.groupAddDomId(child));
        },

        /**
         * Removes a condition row wherever it sits in the tree.
         *
         * @param {Object} row Row view-model.
         */
        removeRow: function (row) {
            this._removeNode(row);
        },

        /**
         * Removes a group together with its whole subtree. The root group is not removable — it
         * has no parent to remove it from.
         *
         * @param {Object} group Group view-model.
         */
        removeGroup: function (group) {
            this._removeNode(group);
        },

        /**
         * Removes one node from its parent group and moves focus onto a control that still exists.
         *
         * Deleting the element that holds focus drops focus to the document body, which strands a
         * keyboard admin at the top of the page after every removal. The landing spot is the
         * preceding sibling's own remove button — so repeated removals walk up the group — and the
         * parent's add-condition button once the group is empty. A node with no parent (the root
         * group) is not removable and nothing moves.
         *
         * @param {Object} node Row or group view-model.
         * @returns {void}
         */
        _removeNode: function (node) {
            var parent = this.findParentOf(node);
            var index;
            var previous;

            if (!parent) {
                return;
            }
            index = parent.children().indexOf(node);
            previous = index > 0 ? parent.children()[index - 1] : null;
            parent.children.remove(node);
            this._focusLater(previous ? this._removeDomIdOf(previous) : this.groupAddDomId(parent));
        },

        /**
         * Inserts a duplicate of a condition row directly after the source row in its parent
         * group. The clone carries the condition's substance — field, operator, attribute and a
         * deep copy of the value — while every transient (search text, dropdown, tree expansion,
         * suggest state, pill collapse, paste hint, dropdown highlight) starts fresh, exactly as
         * on a hand-added row. Focus follows the clone, like it follows a newly added row.
         *
         * @param {Object} row Row view-model to duplicate.
         */
        duplicateRow: function (row) {
            var parent = this.findParentOf(row);
            var clone;

            if (parent) {
                clone = this._cloneRowVm(row);
                this._insertAfter(parent, row, clone);
                this._focusLater(this.rowFieldDomId(clone));
            }
        },

        /**
         * Inserts a deep clone of a group — nested groups and rows cloned recursively, every
         * node with a fresh id — directly after the source group in its parent's children.
         * The root group has no parent and is not duplicable.
         *
         * @param {Object} group Group view-model to duplicate.
         */
        duplicateGroup: function (group) {
            var parent = this.findParentOf(group);
            var clone;

            if (parent) {
                clone = this._cloneGroupVm(group);
                this._insertAfter(parent, group, clone);
                this._focusLater(this.groupAddDomId(clone));
            }
        },

        /**
         * Splices a clone into a group's children directly after the source node.
         *
         * @param {Object} parent Group view-model whose children contain `node`.
         * @param {Object} node Source child of `parent`.
         * @param {Object} clone Node to insert after the source.
         */
        _insertAfter: function (parent, node, clone) {
            parent.children.splice(parent.children().indexOf(node) + 1, 0, clone);
        },

        /* ---------------- element ids & focus management ---------------- */

        /**
         * Id of a row's Field select — the row's first control, and where focus lands when the row
         * appears.
         *
         * Every id below is built from the node's sequence number, which is unique across the
         * whole page (one counter for all builders and all nodes), so several builders on one form
         * cannot collide. Ids exist for exactly two reasons: ARIA relationships, which can only be
         * expressed by id, and moving focus onto an element Knockout has just rendered — for which
         * the template holds no reference. They are never selectors for styling.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        rowFieldDomId: function (row) {
            return 'ufe-field-' + row.id;
        },

        /**
         * Id of a row's remove button — the landing spot after the following row is removed.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        rowRemoveDomId: function (row) {
            return 'ufe-remove-' + row.id;
        },

        /**
         * Id of a group's remove button. Rendered only for non-root groups, which is exactly the
         * set that can be a removal's preceding sibling.
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupRemoveDomId: function (group) {
            return 'ufe-group-remove-' + group.id;
        },

        /**
         * Id of a group's add-condition button — present in every group, root included, which is
         * what makes it the safe fallback when a group runs out of children.
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupAddDomId: function (group) {
            return 'ufe-add-' + group.id;
        },

        /**
         * Id of a row's dropdown list — the `aria-controls` target of its combobox input.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        listDomId: function (row) {
            return 'ufe-list-' + row.id;
        },

        /**
         * Id of one dropdown entry, addressed by its position in the list the row currently
         * renders — the `aria-activedescendant` target while that entry is highlighted.
         *
         * @param {Object} row Row view-model.
         * @param {Number} index Position in the row's rendered entry list.
         * @returns {String}
         */
        optionDomId: function (row, index) {
            return 'ufe-opt-' + row.id + '-' + index;
        },

        /**
         * Id of a node's outer element — the row box, or the group box of a group.
         *
         * The one id that addresses a node's GEOMETRY rather than a control inside it. A pointer
         * drag has to turn a pointer position into an insertion slot, and where each rendered
         * child begins and ends is the only thing that answers that; no control inside a node
         * describes the node's own extent.
         *
         * @param {Object} node Row or group view-model.
         * @returns {String}
         */
        nodeDomId: function (node) {
            return 'ufe-node-' + node.id;
        },

        /**
         * Id of a node's drag handle — the focus target after the node moves, since a move
         * re-renders (and so destroys) the very element the keystroke arrived on.
         *
         * @param {Object} node Row or group view-model.
         * @returns {String}
         */
        dragHandleDomId: function (node) {
            return 'ufe-drag-' + node.id;
        },

        /**
         * Remove button id of a row or a group, whichever the node is.
         *
         * @param {Object} node Row or group view-model.
         * @returns {String}
         */
        _removeDomIdOf: function (node) {
            return node.kind === 'group' ? this.groupRemoveDomId(node) : this.rowRemoveDomId(node);
        },

        /**
         * Focuses an element by id once Knockout has rendered it.
         *
         * The deferral is the whole point: the caller has just written an observable, and the
         * element it will produce does not exist yet. A missing element is not an error — the
         * template may not render that control in the row's current state — so nothing throws and
         * focus simply stays where it is.
         *
         * One deferral at a time: a pending one is replaced rather than queued, since two focus
         * moves resolved in the same tick would only ever leave the later one's target focused
         * anyway. That also gives destroy() a single handle to cancel.
         *
         * @param {String} domId Id of the element to focus.
         * @returns {void}
         */
        _focusLater: function (domId) {
            var self = this;

            if (this._focusTimer) {
                clearTimeout(this._focusTimer);
            }
            this._focusTimer = setTimeout(function () {
                var element = document.getElementById(domId);

                self._focusTimer = null;

                if (element && typeof element.focus === 'function') {
                    element.focus();
                }
            }, 0);
        },

        /**
         * Builds a fresh row view-model carrying the same condition as the source row.
         *
         * Re-running _buildRow is what guarantees freshness: the id and every transient observable
         * are newly created, never shared, and the clone starts with no pending paste-hint timer.
         * The value is copied (expression-condition cloneOverrides()) so pill edits on either row
         * never leak into the other, and the clone serialises identically to the source.
         *
         * @param {Object} row Row view-model to clone.
         * @returns {Object} Fresh row view-model.
         */
        _cloneRowVm: function (row) {
            return this._buildRow(this.fieldsByType[row.fieldType()], expressionCondition.cloneOverrides({
                operator: row.operator(),
                value: row.value(),
                productAttribute: row.productAttribute(),
                isValueProcessed: row.isValueProcessed,
                storedNumber: row.storedNumber
            }));
        },

        /**
         * Recursively clones a group view-model: same aggregator, children cloned in order,
         * every node — group and row alike — rebuilt fresh with its own id and transient state.
         *
         * @param {Object} groupVm Group view-model to clone.
         * @returns {Object} Fresh group view-model.
         */
        _cloneGroupVm: function (groupVm) {
            var clone = this._buildGroup(groupVm.aggregator());
            var children = [];

            _.each(groupVm.children(), function (child) {
                children.push(child.kind === 'group' ? this._cloneGroupVm(child) : this._cloneRowVm(child));
            }, this);

            clone.children(children);

            return clone;
        },

        /**
         * Finds the group whose children contain the given node.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Object|null} Parent group view-model; null for the root group and unknown nodes.
         */
        findParentOf: function (node) {
            return this._findParentIn(this.rootGroup(), node);
        },

        /**
         * Depth-first parent search below one group.
         *
         * @param {Object} group Group view-model to search below.
         * @param {Object} node Row or group view-model to find.
         * @returns {Object|null}
         */
        _findParentIn: function (group, node) {
            var children = group.children();
            var found = null;
            var i;

            for (i = 0; i < children.length; i++) {
                if (children[i] === node) {
                    return group;
                }

                if (children[i].kind === 'group') {
                    found = this._findParentIn(children[i], node);

                    if (found) {
                        return found;
                    }
                }
            }

            return null;
        },

        /**
         * Computes the child-index path of a node from the root group — the address the tree
         * module's structural queries take.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Array.<Number>|null} Path of child indexes, or null when the node is not in the tree.
         */
        findPath: function (node) {
            return this._findPathIn(this.rootGroup(), node, []);
        },

        /**
         * Depth-first path search below one group.
         *
         * @param {Object} group Group view-model to search below.
         * @param {Object} node Node to address.
         * @param {Array.<Number>} basePath Path of `group` itself.
         * @returns {Array.<Number>|null}
         */
        _findPathIn: function (group, node, basePath) {
            var children = group.children();
            var found = null;
            var i;

            for (i = 0; i < children.length; i++) {
                if (children[i] === node) {
                    return basePath.concat([i]);
                }

                if (children[i].kind === 'group') {
                    found = this._findPathIn(children[i], node, basePath.concat([i]));

                    if (found) {
                        return found;
                    }
                }
            }

            return null;
        },

        /**
         * Switches a row to another field: operator, value and sub-picker reset to the new
         * field's defaults, and the multi-value transients (collapsed pill list, paste hint,
         * dropdown highlight) reset with them — they described the value that just went away
         * (expression-fields fieldSwitchState()).
         *
         * @param {Object} row Row view-model.
         * @param {String} fieldType Type of the newly selected field.
         */
        setField: function (row, fieldType) {
            var state;

            row.fieldType(fieldType);
            state = expressionFields.fieldSwitchState(this.fieldsByType[fieldType]);

            if (state === null) {
                return;
            }
            row.operator(state.operator);
            row.value(state.value);
            row.productAttribute(state.productAttribute);
            row.pillsExpanded(false);
            row.activeOptionIndex(-1);
            this._clearPasteNotice(row);
        },

        /**
         * Called when the Product Attribute sub-picker changes — different attributes can have
         * different operator subsets (e.g. category_ids vs SKU), so reset the operator to a value
         * that's valid for the new attribute, and clear the value/searchText to avoid carrying
         * incompatible state across (expression-fields attributeSwitchState()). The collapsed pill
         * list, any paste hint and the dropdown highlight reset too: all three described the
         * previous attribute's values.
         *
         * @param {Object} row Row view-model.
         * @param {String} attributeCode The newly picked attribute.
         */
        setProductAttribute: function (row, attributeCode) {
            var state;

            row.productAttribute(attributeCode);
            state = expressionFields.attributeSwitchState(
                this.operatorsFor(row),
                row.operator(),
                this.productAttributeHasOptions(row)
            );
            row.operator(state.operator);
            row.value(state.value);
            row.searchText('');
            this._setSuggestions(row, []);
            row.pillsExpanded(false);
            this._clearPasteNotice(row);
        },

        /**
         * The operators the row offers: its field's, or the ones its picked attribute narrows them
         * to (expression-fields operatorsFor()).
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        operatorsFor: function (row) {
            return expressionFields.operatorsFor(
                this.fieldsByType[row.fieldType()] || null,
                this.productAttributeInfo(row),
                this.operatorSets
            );
        },

        /**
         * Returns the list of selectable Field types for a given row's dropdown.
         *
         * Restriction is evaluated against the row's conjunctive scope — the conditions guaranteed
         * to hold whenever the row is relevant — so OR-joined branches never borrow each other's
         * context rows (expression-coherence availableFields()). Which fields depend on which
         * context values is consumer config. The currently-selected field is always kept visible so
         * existing rows stay editable.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        availableFieldsFor: function (row) {
            var path = this.findPath(row);
            var scope = path
                ? expressionTree.conjunctiveScope(this._coherenceModelFromVm(this.rootGroup()), path)
                : null;

            return expressionCoherence.availableFields(this.fields, this.coherence, scope, row.fieldType());
        },

        /**
         * True when the row's operator takes a list of alternatives instead of a single scalar.
         *
         * The membership operator set has exactly ONE definition, in the value module, and it is the
         * value module that shapes a stored value by it. Everything that has to make the same
         * distinction — the component's editor predicates and every template branch that chooses a
         * multi-value editor over a single-value one — asks through here rather than re-spelling the
         * operators. Re-spelling them is how a consumer registering a third membership operator would
         * end up with list-shaped serialisation behind a single-value editor, which silently replaces
         * a stored list with one entry on the next save.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesListOperator: function (row) {
            return expressionValue.isListOperator(row.operator(), this.operatorsFor(row));
        },

        /**
         * The row's field value type, `text` without a configured field.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        valueTypeFor: function (row) {
            return expressionFields.valueType(this.fieldsByType[row.fieldType()] || null);
        },

        /**
         * The row's field option list.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        valueOptionsFor: function (row) {
            return expressionFields.valueOptions(this.fieldsByType[row.fieldType()] || null);
        },

        /**
         * The row's field attribute descriptors (the picker's attribute list).
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        attributesFor: function (row) {
            return expressionFields.attributes(this.fieldsByType[row.fieldType()] || null);
        },

        /**
         * The descriptor of the attribute a Product Attribute row has picked, or null on any other row
         * (expression-fields pickedAttribute()). It carries the EAV input type and, for an optioned attribute,
         * the option list that drives the value editor.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null}
         */
        productAttributeInfo: function (row) {
            return expressionFields.pickedAttribute(this.fieldsByType[row.fieldType()], function () {
                return row.productAttribute();
            });
        },

        /**
         * True when the currently-selected product attribute has a LOADED, non-empty option list —
         * the value editor should render an option picker instead of a free-text input.
         *
         * This accessor is one half of the lazy-option contract: descriptors ship saying only that
         * a list EXISTS (`hasOptions`), so evaluating a row whose list has not arrived yet kicks
         * off the one fetch for that attribute code and answers false meanwhile. The version
         * observable is read so every binding that consulted this re-evaluates when a fetch lands;
         * the loading state itself is attributeOptionsPending's to render.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        productAttributeHasOptions: function (row) {
            var info = this.productAttributeInfo(row);

            this.attributeOptionsVersion();
            this._ensureAttributeOptions(info);

            return expressionFields.hasLoadedOptions(info);
        },

        /**
         * True while the row's attribute is optioned but its list has not arrived yet — the render
         * condition of the loading placeholder, and the guard that keeps the option-less fallback
         * editors from flashing for the length of one round-trip (expression-remote-options
         * awaitsOptions()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        attributeOptionsPending: function (row) {
            var info = this.productAttributeInfo(row);

            this.attributeOptionsVersion();
            this._ensureAttributeOptions(info);

            return expressionRemoteOptions.awaitsOptions(info, this.optionsUrl, this._optionErrors);
        },

        /**
         * Starts the one fetch for an attribute descriptor whose option list is declared but not
         * yet loaded. A code already in flight is not asked twice, and a code that already failed
         * is not retried — a broken endpoint must cost one request, not one per render. A request
         * that outlives its deadline is such a failure: the row degrades to the option-less
         * editors instead of showing its loading placeholder for good.
         *
         * The landed list is written INTO the descriptor — the same object the option accessors
         * and the tree-index cache read — and the version observable is bumped so those accessors
         * re-evaluate. Nothing observable is touched synchronously, so calling this from inside a
         * binding evaluation stays a pure read.
         *
         * @param {Object|null} info Attribute descriptor from productAttributeInfo().
         * @returns {void}
         */
        _ensureAttributeOptions: function (info) {
            var self = this;
            var code = expressionRemoteOptions.optionCodeToFetch(info, this.optionsUrl);

            if (!expressionRemoteOptions.needsOptionsRequest(code, this._optionRequests, this._optionErrors)) {
                return;
            }
            this._optionRequests[code] = true;

            this._requestJson(
                'options:' + code,
                expressionRemoteOptions.optionsRequestUrl(this.optionsUrl, code),
                {},
                function (data) {
                    var options = expressionRemoteOptions.readOptions(data);

                    if (options !== null) {
                        info.options = options;
                    } else {
                        self._optionErrors[code] = true;
                    }
                    delete self._optionRequests[code];
                    self.attributeOptionsVersion(self.attributeOptionsVersion() + 1);
                }
            );
        },

        /**
         * Returns the option list for the row's product attribute, filtered by row.searchText —
         * the same {items, capped} contract and cap as filteredOptionsFor(), over the picked
         * attribute's own options. Only a list-valued row leaves out what it already holds.
         *
         * @param {Object} row Row view-model.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredProductAttributeOptions: function (row) {
            var self = this;
            var info = this.productAttributeInfo(row);

            if (!info || !info.options) {
                return {items: [], capped: false};
            }

            return expressionOptions.offerOptions(
                info.options,
                expressionListValue.offerExclusions(
                    function () {
                        return self.rowUsesListOperator(row);
                    },
                    function () {
                        return expressionValue.asArray(row.value());
                    }
                ),
                row.searchText(),
                this.optionMatchCap,
                function () {
                    return self._searchIndexFor(row);
                }
            );
        },

        /**
         * Selected option objects for a Product Attribute row using the `()` / `!()` operator.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        selectedProductAttributeOptions: function (row) {
            var info = this.productAttributeInfo(row);

            if (!info || !info.options) {
                return [];
            }

            return expressionOptions.selectedOptions(info.options, expressionValue.asArray(row.value()));
        },

        /**
         * True for Product Attribute rows whose attribute (e.g. `sku`, `name`) is in the AJAX-suggest
         * whitelist on the backend — drives the type-ahead suggestion dropdown.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        productAttributeSupportsSuggest: function (row) {
            return expressionFields.supportsSuggest(this.productAttributeInfo(row));
        },

        /**
         * Name of the row's scalar value type, or null when the row is not in a scalar context
         * (expression-value scalarTypeName()). Product Attribute rows resolve their selected attribute's
         * descriptor, every other row its field descriptor (expression-fields scalarDescriptor()).
         *
         * @param {Object} row Row view-model.
         * @returns {String|null} Value-type name, or null outside scalar contexts.
         */
        scalarTypeNameFor: function (row) {
            var self = this;

            return expressionValue.scalarTypeName({
                hasOptions: function () {
                    return self.productAttributeHasOptions(row);
                },
                usesListOperator: function () {
                    return self.rowUsesListOperator(row);
                },
                descriptor: function () {
                    return expressionFields.scalarDescriptor(self.fieldsByType[row.fieldType()] || null, function () {
                        return self.productAttributeInfo(row);
                    });
                }
            });
        },

        /**
         * True when the row's value area renders the generic scalar editor — one branch for every scalar
         * type, native input attributes supplied by the type's registry entry (expression-value
         * usesScalarEditor()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesScalarEditor: function (row) {
            var self = this;

            return expressionValue.usesScalarEditor({
                typeName: function () {
                    return self.scalarTypeNameFor(row);
                },
                optionsPending: function () {
                    return self.attributeOptionsPending(row);
                },
                supportsSuggest: function () {
                    return self.productAttributeSupportsSuggest(row);
                }
            });
        },

        /**
         * Attribute map for the scalar editor's attr binding: the resolved type definition's
         * native input attributes merged over the component's presentation defaults — a fresh
         * object every call, never a mutation of the registry entry. The definition's attrs win
         * on collision, so a registered type can deliberately override anything, including the
         * css class. Non-text types carry the width-capping modifier; the text type keeps the
         * full-width base class and the free-text placeholder. The accessible name is here rather
         * than in the template because this editor's markup is one branch shared by every scalar
         * type, and the column's visible heading is a plain label element bound to no control.
         *
         * @param {Object} row Row view-model.
         * @returns {Object} Attribute name → value map.
         */
        scalarInputAttrs: function (row) {
            var shape = expressionValue.scalarEditorShape(this.scalarTypeNameFor(row));
            var attrs = {
                'class': shape.freeText ? 'ufe-expr__input' : 'ufe-expr__input ufe-expr__input--typed',
                'aria-label': this.valueEditorLabel()
            };

            if (shape.freeText) {
                attrs.placeholder = this.valuePlaceholder();
            }

            return _.extend(attrs, expressionValue.valueTypeDef(shape.type).attrs);
        },

        /**
         * Display value for the scalar editor: the resolved type's editValue transform over the
         * stored value, null-safe identity otherwise. Display-only — the stored value is
         * rewritten exclusively by commitScalarValue() on an actual change event, so an untouched
         * stored rule round-trips byte-identical (the date type's timestamp truncation, for one,
         * never writes itself back).
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        scalarEditValue: function (row) {
            return expressionValue.editValueOf(this.scalarTypeNameFor(row), row.value());
        },

        /**
         * Writes an edited scalar back into the row: the resolved type's commitValue transform
         * over the input's current value, identity otherwise. Bound to the editor's change event —
         * the KO value binding on a method-call expression cannot write back (a deliberate silent
         * no-op), so this handler is the single write path for scalar edits.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event Change event whose target is the scalar input.
         * @returns {void}
         */
        commitScalarValue: function (row, event) {
            var name = this.scalarTypeNameFor(row);

            row.value(expressionValue.commitValueOf(name, event && event.target ? event.target.value : ''));
        },

        /**
         * Advisory validation message for the row's current value, or the empty-value nudge, or ''.
         *
         * Which validator applies is the value module's resolution (expression-value
         * failingValidator()). On failure the operator entry's own pre-translated
         * `validateMessage` wins, else the component's message for that validator, else the
         * generic one. Format validators pass blank input by design, so a row no validator faults
         * but whose value is still EMPTY answers with the completion nudge — a consumer wiring
         * `not-empty` still outranks it.
         *
         * Advisory is the load-bearing word: the autosave computed still serialises invalid
         * values — the admin may be mid-typing — so this only renders a hint under the value
         * editor and never gates the save.
         *
         * @param {Object} row Row view-model.
         * @returns {String} Error text, or ''.
         */
        rowValueError: function (row) {
            var self = this;
            var failure = expressionValue.failingValidator(
                expressionFields.operatorEntry(this.operatorsFor(row), row.operator()),
                function () {
                    return self.scalarTypeNameFor(row);
                },
                row.value()
            );

            if (failure === null) {
                return this._emptyValueHint(row);
            }

            return failure.message || VALIDATOR_MESSAGES[failure.name] || $t('Invalid value');
        },

        /**
         * The built-in nudge under a value editor with nothing in it, or '' once a value exists — shaped by
         * what the editor still needs (expression-value emptyValueNeeds()). Not a validator and not a gate: an
         * empty row still serialises like any other.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        _emptyValueHint: function (row) {
            var self = this;

            return EMPTY_VALUE_HINTS[expressionValue.emptyValueNeeds({
                value: function () {
                    return row.value();
                },
                usesListOperator: function () {
                    return self.rowUsesListOperator(row);
                },
                valueType: function () {
                    return self.valueTypeFor(row);
                }
            })];
        },

        /**
         * The row's value read as a list, so templates can render the multi-value pill list.
         *
         * @param {Object} row Row view-model.
         * @returns {Array}
         */
        valueAsArray: function (row) {
            return expressionValue.asArray(row.value());
        },

        /**
         * Debounced AJAX request to the suggest endpoint. The `query` arg is what the user typed; for
         * single-value rows that's row.value(), for multi-value rows it's row.searchText(). The idle
         * time is the configured suggest debounce.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The typed text.
         * @returns {void}
         */
        fetchSuggestionsDebounced: function (row, query) {
            var self = this;

            if (row._suggestTimer) {
                clearTimeout(row._suggestTimer);
            }
            row._suggestTimer = setTimeout(function () {
                self._fetchSuggestions(row, query);
            }, this.suggestDebounce);
        },

        /**
         * Asks the suggest endpoint about one query, or empties the suggestions when there is
         * nothing to ask (expression-remote-options suggestRequestUrl()).
         *
         * A row has one suggest request at a time: a newer query aborts the one in flight, and so
         * does a query that asks nothing, so a slow answer to what the admin typed before can never
         * replace the list for what they typed since. Every failure — a refused or unreadable
         * answer, the deadline — empties the list, as no suggestions at all.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The typed text.
         * @returns {void}
         */
        _fetchSuggestions: function (row, query) {
            var self = this;
            var url = expressionRemoteOptions.suggestRequestUrl(
                this.productAttributeInfo(row),
                row.productAttribute(),
                query,
                this.suggestMinQuery,
                this.suggestUrl
            );

            if (url === null) {
                this._requests.cancel('suggest:' + row.id);
                this._setSuggestions(row, []);
                row.suggestLoading(false);

                return;
            }
            row.suggestLoading(true);
            this._requestJson('suggest:' + row.id, url, {}, function (data) {
                self._setSuggestions(row, expressionRemoteOptions.readSuggestions(data));
                row.suggestLoading(false);
            });
        },

        /**
         * Replaces a row's suggestion list and drops the dropdown highlight with it.
         *
         * The highlight is a position in the list that just went away, so a stale one would point
         * Enter at a different value than the one the admin saw highlighted — the one keyboard bug
         * an asynchronous list can cause. Every write to the suggestion list goes through here for
         * that reason.
         *
         * @param {Object} row Row view-model.
         * @param {Array.<Object>} items Suggested `{value, label}` entries.
         * @returns {void}
         */
        _setSuggestions: function (row, items) {
            row.suggestedOptions(items);
            row.activeOptionIndex(-1);
        },

        /**
         * True when the type-ahead dropdown has something to say: results, the loading row, or the
         * "no matches" verdict (expression-remote-options suggestListHasContent()).
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for — the row's value on a
         *     single-value editor, its search text on a multi-value one.
         * @returns {Boolean}
         */
        suggestDropdownVisible: function (row, query) {
            var self = this;

            return expressionRemoteOptions.suggestListHasContent({
                isOpen: function () {
                    return row.dropdownOpen();
                },
                loading: function () {
                    return row.suggestLoading();
                },
                count: function () {
                    return row.suggestedOptions().length;
                },
                answeredEmpty: function () {
                    return self.suggestNoMatches(row, query);
                }
            });
        },

        /**
         * True when the suggest endpoint has answered a real query with nothing
         * (expression-remote-options answeredEmpty()).
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for.
         * @returns {Boolean}
         */
        suggestNoMatches: function (row, query) {
            return expressionRemoteOptions.answeredEmpty(
                row.suggestLoading(),
                row.suggestedOptions().length,
                query,
                this.suggestMinQuery
            );
        },

        /**
         * Commits the current free-text input as a multi-value pill (Enter key or blur fallback), trimmed,
         * and nothing for blank input (expression-list-value freeTextEntry()).
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        commitFreeTextValue: function (row) {
            var entry = expressionListValue.freeTextEntry(row.searchText());

            if (entry !== null) {
                this.addOption(row, entry);
            }
        },

        /**
         * The row's field placeholder — consumer wording — or ''.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        placeholderFor: function (row) {
            return expressionFields.placeholder(this.fieldsByType[row.fieldType()] || null);
        },

        /**
         * The unit the row's value is entered in — rendered beside the editor so a bare number
         * says what it counts — or '', which is also the render condition (expression-fields
         * unit()). The text is a code from the consumer and is bound as it came.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        rowUnit: function (row) {
            var self = this;

            return expressionFields.unit(this.fieldsByType[row.fieldType()] || null, function () {
                return self.productAttributeInfo(row);
            });
        },

        /**
         * The options a list-valued select row holds, as option objects, in option-list order.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        selectedOptionsFor: function (row) {
            return expressionOptions.selectedOptions(this.valueOptionsFor(row), expressionValue.asArray(row.value()));
        },

        /**
         * The row's selectable options, filtered by row.searchText and capped, plus whether the
         * cap truncated the result — the dropdown appends its "keep typing" hint off that flag
         * (expression-options offerOptions()). Values already selected are never offered, and a
         * hierarchy searches by breadcrumb path.
         *
         * @param {Object} row Row view-model.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredOptionsFor: function (row) {
            var self = this;

            return expressionOptions.offerOptions(
                this.valueOptionsFor(row),
                expressionValue.asArray(row.value()),
                row.searchText(),
                this.optionMatchCap,
                function () {
                    return self._searchIndexFor(row);
                }
            );
        },

        /**
         * Hint appended to an options-based dropdown whose match list was truncated.
         *
         * Worded around the SEARCH, not around the list: the cap stops the scan, so the exact
         * number of further matches is unknown, and in the breadcrumb-search branch some of the
         * collected matches are dropped again as already-selected. "Stopped at the first N" is
         * the one claim that holds in every branch. The count is read from the same configured cap
         * the helpers slice at, so a retuned cap cannot leave the hint claiming the old number.
         *
         * @returns {String}
         */
        optionCapHint: function () {
            return $t('Search stopped at the first %1 matches — keep typing').replace('%1', this.optionMatchCap);
        },

        /* ---------------- searchable single-select (large flat option lists) ---------------- */

        /**
         * True when an option list is long enough that a native `<select>` stops being usable and the
         * searchable combobox takes over (expression-fields isLargeOptionList()). Read through the
         * sanitised tunable, so a form's XML can retune the threshold without touching this file.
         *
         * @param {Array} options Option list.
         * @returns {Boolean}
         */
        optionListIsLarge: function (options) {
            return expressionFields.isLargeOptionList(options, this.searchableSelectThreshold);
        },

        /**
         * Which single-select a `select` field's value editor is: the plain `<select>` for a list
         * short enough to scan, the searchable combobox above the threshold, or none when the row
         * does not pick one option out of the field's list (expression-fields singleSelectEditor()).
         *
         * @param {Object} row Row view-model.
         * @returns {('plain'|'searchable'|null)}
         */
        _valueSelectEditor: function (row) {
            var self = this;

            return expressionFields.singleSelectEditor({
                picksOne: function () {
                    return expressionFields.picksOneFieldOption({
                        valueType: function () {
                            return self.valueTypeFor(row);
                        },
                        usesListOperator: function () {
                            return self.rowUsesListOperator(row);
                        }
                    });
                },
                options: function () {
                    return self.valueOptionsFor(row);
                }
            }, this.searchableSelectThreshold);
        },

        /**
         * The same question for an optioned attribute's single value on a picker row, judged per
         * selected attribute — a three-option colour keeps the native control while a brand list
         * escalates.
         *
         * @param {Object} row Row view-model.
         * @returns {('plain'|'searchable'|null)}
         */
        _attributeValueSelectEditor: function (row) {
            var self = this;

            return expressionFields.singleSelectEditor({
                picksOne: function () {
                    return expressionFields.picksOneAttributeOption({
                        valueType: function () {
                            return self.valueTypeFor(row);
                        },
                        hasOptions: function () {
                            return self.productAttributeHasOptions(row);
                        },
                        usesListOperator: function () {
                            return self.rowUsesListOperator(row);
                        }
                    });
                },
                options: function () {
                    return self.productAttributeInfo(row).options;
                }
            }, this.searchableSelectThreshold);
        },

        /**
         * True when the row's value editor is the plain `<select>`.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesPlainValueSelect: function (row) {
            return this._valueSelectEditor(row) === 'plain';
        },

        /**
         * True when the row's value editor is the searchable combobox.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSearchableValueSelect: function (row) {
            return this._valueSelectEditor(row) === 'searchable';
        },

        /**
         * True when an optioned attribute's single-value editor is the plain `<select>`.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesPlainAttributeValueSelect: function (row) {
            return this._attributeValueSelectEditor(row) === 'plain';
        },

        /**
         * True when an optioned attribute's single-value editor is the searchable combobox.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSearchableAttributeValueSelect: function (row) {
            return this._attributeValueSelectEditor(row) === 'searchable';
        },

        /**
         * The option list one of the row's searchable selects offers, straight from the registry.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {Array.<Object>} Option list; empty for an unknown control.
         */
        searchableSelectOptions: function (row, control) {
            var definition = searchableSelect(control);

            return definition === null ? [] : definition.options(this, row) || [];
        },

        /**
         * The entries one of the row's searchable selects currently offers, ranked and capped —
         * the same `{items, capped}` contract the other option helpers answer with, so the dropdown
         * renders and hints identically.
         *
         * Nothing is filtered OUT of the offer, unlike the list-valued editors, which drop what is
         * already selected: a single-select's chosen entry has to stay visible, both because it is
         * how the admin sees what is set and because re-picking it is the only way back after a
         * mis-typed search.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredSearchableOptions: function (row, control) {
            return expressionOptions.optionSearch(
                this.searchableSelectOptions(row, control),
                row.comboQuery(),
                this.optionMatchCap
            );
        },

        /**
         * The option one of the row's searchable selects currently holds, or null when its value
         * matches none — a stored code whose attribute has since been deleted, say.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {Object|null}
         */
        searchableSelectedOption: function (row, control) {
            var definition = searchableSelect(control);
            var selected;

            if (definition === null) {
                return null;
            }
            selected = definition.selected(this, row);

            return expressionOptions.findOption(this.searchableSelectOptions(row, control), selected);
        },

        /**
         * What the control's input SHOWS: the chosen option's label while the list is closed, the
         * query while it is open (expression-listbox closedComboText()).
         *
         * The label rather than the code, because the label is what the admin reads — and it is the
         * input's value, not a decoration beside it, so a screen reader announces the choice like a
         * `<select>` would. A value matching no option shows as itself, so a stale code is visible
         * instead of reading as an empty control.
         *
         * Display only: the input's value binding is one-way (a Knockout value binding over a method
         * call cannot write back) and the query is written by the input handler, so nothing here can
         * touch the stored value.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {String}
         */
        searchableSelectDisplay: function (row, control) {
            var self = this;
            var definition = searchableSelect(control);

            if (definition === null) {
                return '';
            }

            return expressionListbox.closedComboText({
                isOpenHere: function () {
                    return self._comboOpenOn(row, control);
                },
                query: function () {
                    return row.comboQuery();
                },
                option: function () {
                    return self.searchableSelectedOption(row, control);
                },
                selected: function () {
                    return definition.selected(self, row);
                }
            });
        },

        /**
         * The chosen option's CODE, as the closed control's secondary text — and '' while the list is
         * open, where the query owns the input and every entry carries its own code
         * (expression-listbox closedComboCode()).
         *
         * This is the whole point of the control on a list whose labels repeat: four attributes
         * labelled the same are told apart by their code and by nothing else, so the code is part of
         * what the closed control has to say rather than something the admin opens the list to check.
         *
         * The element holding it is rendered even when this is '' (see the markup), so the input's
         * description reference never points at nothing.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {String}
         */
        searchableSelectCode: function (row, control) {
            var self = this;

            return expressionListbox.closedComboCode({
                isOpenHere: function () {
                    return self._comboOpenOn(row, control);
                },
                option: function () {
                    return self.searchableSelectedOption(row, control);
                }
            });
        },

        /**
         * True while the row's dropdown is open on this combobox.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {Boolean}
         */
        _comboOpenOn: function (row, control) {
            return row.dropdownOpen() && row.dropdownControl() === control;
        },

        /**
         * One dropdown entry's code, as its muted second line — '' when the code is the label, which
         * would print the same words twice.
         *
         * @param {Object} option Option object from a searchable select's list.
         * @returns {String}
         */
        optionCode: function (option) {
            return expressionOptions.optionCode(option);
        },

        /**
         * Id of the element carrying a searchable select's chosen code — the `aria-describedby`
         * target of its input.
         *
         * One per row rather than one per control, on the same grounds as the list id: a row's two
         * searchable selects are mutually exclusive by field type, so only one of them is ever
         * rendered.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        comboCodeDomId: function (row) {
            return 'ufe-code-' + row.id;
        },

        /**
         * Opens one of the row's searchable selects on focus, showing its whole list.
         *
         * The query is cleared first, so focusing the control offers everything rather than whatever
         * a previous visit — or the row's other combobox, which shares this observable — left in it.
         * Clearing also empties the input, which is what makes the control invite typing: the chosen
         * label would otherwise sit there as text the admin has to delete before searching.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {void}
         */
        openSearchableSelect: function (row, control) {
            row.comboQuery('');
            this.openDropdown(row, control);
        },

        /**
         * Copies an edited combobox input into the row's query.
         *
         * The input's value binding is one-way (it renders the closed label as well as the query), so
         * this event handler is the single write path for typing — the counterpart of
         * commitScalarValue() on the generic scalar editor.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event Input event whose target is the combobox input.
         * @returns {Boolean} Always true: the keystroke has already reached the input and nothing here
         *     is a reason to suppress it.
         */
        updateSearchableQuery: function (row, event) {
            row.comboQuery(event && event.target ? event.target.value : '');

            return true;
        },

        /**
         * Settles one of the row's searchable selects on an option and closes it.
         *
         * The write itself belongs to the registry entry: choosing an attribute has to reset the
         * operator and clear the value — behaviour the plain `<select>`'s change handler already
         * owned — while choosing a field's option is a plain value write. Both then close, because a
         * single-select has nothing further to pick.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @param {*} value The chosen option's value.
         * @returns {void}
         */
        commitSearchableSelect: function (row, control, value) {
            var definition = searchableSelect(control);

            if (definition === null) {
                return;
            }
            definition.commit(this, row, value);
            this.closeDropdown(row);
        },

        /**
         * Focuses a searchable select's input when the click landed anywhere else on the
         * control — the code span, the chevron, the box's padding.
         *
         * The control replaces a `<select>`, whose whole face is one click target; here the
         * input is only the left half of the line, and the right half is the chosen code —
         * which for a long attribute code is MOST of the control, so a control that only
         * answers on its input half reads as broken. Focusing is the entire job: opening the
         * list belongs to the input's own focus handler, so the click cannot drift into a
         * second open path. A click already on the input is handed back to the browser
         * untouched — suppressing it would suppress the caret placement it carries.
         *
         * Bound as a click, not a mousedown: the mousedown contract belongs to the dropdown
         * focus guard alone, one guard per list.
         *
         * @param {Event} event Click event on the combo container.
         * @returns {Boolean} True to let the browser handle a click on the input itself.
         */
        focusComboInput: function (event) {
            var container = event && event.currentTarget;
            var input = container && container.querySelector
                ? container.querySelector('.ufe-expr__combo-input')
                : null;

            if (!input || event.target === input) {
                return true;
            }
            input.focus();

            return false;
        },

        /* ---------------- hierarchical option picker (tree mode) ---------------- */

        /**
         * True when the row's active option list is hierarchy-annotated — its entries carry a
         * `level` key (expression-fields hasHierarchy()). Flat lists keep the plain filtered-list
         * behaviour everywhere. The active list is the one the row's value editor renders: the
         * field's own options, or the selected product attribute's options on a Product Attribute
         * row.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        treeModeFor: function (row) {
            return expressionFields.hasHierarchy(this._activeOptionsHostFor(row));
        },

        /**
         * True when the row's dropdown renders the collapsible tree (expression-listbox rowShowsTree()):
         * hierarchy-annotated options, no search text, and a list that belongs to the value editor rather
         * than to a searchable single-select.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowShowsTree: function (row) {
            var self = this;

            return expressionListbox.rowShowsTree({
                isSearchableSelect: function () {
                    return searchableSelect(row.dropdownControl()) !== null;
                },
                hasHierarchy: function () {
                    return self.treeModeFor(row);
                },
                searchText: function () {
                    return row.searchText();
                }
            });
        },

        /**
         * The row's option tree flattened into the currently-visible nodes, each carrying the
         * presentation state the template renders (expression-option-tree visibleNodes()). Reads
         * the row's expandedNodes and value observables, so any binding evaluating this re-renders
         * on expansion and on selection.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        visibleTreeNodes: function (row) {
            var index = this._searchIndexFor(row);

            return index === null
                ? []
                : expressionOptionTree.visibleNodes(index, row.expandedNodes(), expressionValue.asArray(row.value()));
        },

        /**
         * Expands or collapses one tree node's direct children. Writes a fresh map so every
         * binding reading expandedNodes re-evaluates.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value of the node to toggle.
         */
        toggleNode: function (row, value) {
            row.expandedNodes(expressionOptionTree.toggleExpansion(row.expandedNodes(), value));
        },

        /**
         * True when the row's tree is small enough to be expanded in one action — the template's guard on
         * the expand-all control (expression-option-tree canExpandAll()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        canExpandAllTreeNodes: function (row) {
            var self = this;

            return expressionOptionTree.canExpandAll({
                showsTree: function () {
                    return self.rowShowsTree(row);
                },
                optionCount: function () {
                    return expressionFields.optionCount(self._activeOptionsHostFor(row));
                }
            }, this.treeExpandAllLimit);
        },

        /**
         * Expands every branch of the row's tree in ONE write.
         *
         * Re-checks the size guard rather than trusting the caller: the control that offers this is
         * conditional, and a path that ever calls it anyway must not be the one that hangs the form.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        expandAllTreeNodes: function (row) {
            if (!this.canExpandAllTreeNodes(row)) {
                return;
            }
            row.expandedNodes(expressionOptionTree.expandAll(this._treeIndexFor(row)));
        },

        /**
         * Collapses the row's whole tree back to its top-level nodes. Always available: collapsing
         * only ever removes rendered rows, however large the list is.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        collapseAllTreeNodes: function (row) {
            row.expandedNodes({});
        },

        /**
         * Breadcrumb path label for one option value (expression-option-tree pathLabel()) — the
         * pill tooltip and the option text of the searched dropdown.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value.
         * @returns {String}
         */
        pathLabelFor: function (row, value) {
            return expressionOptionTree.pathLabel(this._treeIndexFor(row), value);
        },

        /**
         * The object owning the row's active option list — the field descriptor, or the selected
         * product attribute's descriptor on a Product Attribute row. The option index is cached
         * on this object, so all rows of the same field (or attribute) share one index.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null} Descriptor with an `options` array, or null.
         */
        _activeOptionsHostFor: function (row) {
            var self = this;

            return expressionFields.optionsHost(this.fieldsByType[row.fieldType()] || null, function () {
                return self.productAttributeInfo(row);
            });
        },

        /**
         * The breadcrumb index of the row's active option list when that list is a hierarchy, null
         * for a flat one (expression-fields hierarchyIndex()) — what a search over the list and the
         * option tree run on.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null}
         */
        _searchIndexFor: function (row) {
            var self = this;

            return expressionFields.hierarchyIndex(this._activeOptionsHostFor(row), function () {
                return self._treeIndexFor(row);
            });
        },

        /**
         * The option index for the row's active option list, built lazily on first use and cached
         * on the owning descriptor — a multi-thousand-entry category list must not be re-scanned
         * per keystroke or per row. Descriptors are static per page load, so the cache never
         * invalidates.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null} Index from the options module, or null when the row has no options.
         */
        _treeIndexFor: function (row) {
            var host = this._activeOptionsHostFor(row);

            if (!host || !host.options) {
                return null;
            }

            if (!host._ufeTreeIndex) {
                host._ufeTreeIndex = expressionOptions.buildTreeIndex(host.options);
            }

            return host._ufeTreeIndex;
        },

        /* ---------------- list values: pills and paste ---------------- */

        /**
         * Adds one value to a row's list value, ignoring it when already present.
         *
         * @param {Object} row Row view-model.
         * @param {*} optionValue Value to add; stored as a string.
         */
        addOption: function (row, optionValue) {
            this._appendValues(row, [optionValue]);
        },

        /**
         * Appends values to a row's list value in ONE observable write, de-duplicated
         * (expression-list-value appendValues()), and clears the search text.
         *
         * The single write is what makes a several-hundred-entry paste usable: writing per entry
         * would re-render the growing pill list once per value and re-run the autosave walk with it.
         *
         * @param {Object} row Row view-model.
         * @param {Array} values Values to append, in order.
         * @returns {Number} How many were actually added.
         */
        _appendValues: function (row, values) {
            var result = expressionListValue.appendValues(expressionValue.asArray(row.value()), values);

            if (result.added > 0) {
                row.value(result.values);
            }
            row.searchText('');

            return result.added;
        },

        /**
         * Removes one value from a row's list value. A list that shrinks back to the collapse
         * limit un-collapses, so the toggle never lingers over a list short enough to show whole.
         *
         * @param {Object} row Row view-model.
         * @param {*} optionValue Value to remove.
         */
        removeOption: function (row, optionValue) {
            row.value(expressionListValue.removeValue(expressionValue.asArray(row.value()), optionValue));
            this._syncPillCollapse(row);
        },

        /**
         * Empties a multi-value editor in one action: value, search text, collapse state and any
         * paste hint. Offered once a row holds enough pills that removing them one by one is
         * tedious — see canClearAll().
         *
         * @param {Object} row Row view-model.
         */
        clearAllValues: function (row) {
            row.value([]);
            row.searchText('');
            row.pillsExpanded(false);
            row.activeOptionIndex(-1);
            this._clearPasteNotice(row);
        },

        /**
         * True when a row's clear-all control is worth offering, counted on the stored value
         * (expression-list-value canClearAll()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        canClearAll: function (row) {
            return expressionListValue.canClearAll(expressionValue.asArray(row.value()));
        },

        /**
         * The pills a multi-value editor actually renders: all of them while expanded or while the
         * list is short enough to show whole, the first `pillCollapseLimit` otherwise.
         *
         * @param {Object} row Row view-model.
         * @param {Array} allPills Every pill the editor would render, in order.
         * @returns {Array} The subset to render.
         */
        visiblePills: function (row, allPills) {
            return expressionListValue.visiblePills(allPills, row.pillsExpanded(), this.pillCollapseLimit);
        },

        /**
         * Label of the pill-list toggle, or '' when the list needs no toggle. Collapsed, it counts
         * what is hidden; expanded, it offers the way back — a list expanded once must stay
         * collapsible, or a several-hundred-pill row can never be made compact again.
         *
         * @param {Object} row Row view-model.
         * @param {Array} allPills Every pill the editor would render.
         * @returns {String}
         */
        pillToggleLabel: function (row, allPills) {
            var hidden = expressionListValue.hiddenPillCount(allPills, this.pillCollapseLimit);

            if (hidden === 0) {
                return '';
            }

            return row.pillsExpanded()
                ? $t('Show fewer')
                : $t('+%1 more').replace('%1', hidden);
        },

        /**
         * Expands or re-collapses a row's pill list.
         *
         * @param {Object} row Row view-model.
         */
        togglePills: function (row) {
            row.pillsExpanded(!row.pillsExpanded());
        },

        /**
         * Drops the expanded flag once a row's value fits the collapse limit again
         * (expression-list-value collapsesBack()).
         *
         * @param {Object} row Row view-model.
         */
        _syncPillCollapse: function (row) {
            if (expressionListValue.collapsesBack(row.pillsExpanded(), function () {
                return expressionValue.asArray(row.value()).length;
            }, this.pillCollapseLimit)) {
                row.pillsExpanded(false);
            }
        },

        /**
         * Turns a paste of separator-joined text into pills — the workflow a rule built from a spreadsheet
         * column lives on. What the paste is — not a list, a list of nothing, or entries resolved or taken as
         * typed — is expression-list-value planPaste()'s answer; the values are appended in one write and the
         * hint under the pills reports what happened.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The paste event carrying the clipboard payload.
         * @param {String} mode 'options' to resolve entries against the row's options, anything
         *     else to take them verbatim.
         * @returns {Boolean} false when the paste was consumed as a list, true to let the browser
         *     paste the text normally — Knockout's event binding suppresses the default action for
         *     every return value but literal true.
         */
        handlePaste: function (row, event, mode) {
            var self = this;
            var plan = expressionListValue.planPaste(this._clipboardText(event), mode, function () {
                return self._pasteLookupFor(row);
            });

            if (plan === null) {
                return true;
            }
            // From here the paste IS a list, so any hint on screen describes a previous one and
            // goes now — including when this paste turns out to carry nothing but separators.
            this._clearPasteNotice(row);

            if (plan.parsed > 0) {
                this._showPasteNotice(row, plan.parsed, this._appendValues(row, plan.values), plan.skipped);
            }

            return false;
        },

        /**
         * Plain-text payload of a paste event, or '' when the clipboard is unreadable — an empty
         * payload carries no separator, so the handler declines and the browser does its own thing.
         *
         * Knockout binds events through jQuery on admin pages, so the browser's own event, the one
         * carrying the clipboard, is on `originalEvent`.
         *
         * @param {Event} event Paste event, or the jQuery event wrapping it.
         * @returns {String}
         */
        _clipboardText: function (event) {
            var source = event && event.originalEvent ? event.originalEvent : event;
            var clipboard = source && source.clipboardData ? source.clipboardData : null;

            if (!clipboard || typeof clipboard.getData !== 'function') {
                return '';
            }

            return clipboard.getData('text/plain') || '';
        },

        /**
         * The value/label lookup a pasted list resolves through, from the row's active option list.
         *
         * @param {Object} row Row view-model.
         * @returns {{byValue: Object, byLabel: Object}}
         */
        _pasteLookupFor: function (row) {
            var host = this._activeOptionsHostFor(row);

            return expressionListValue.pasteLookup(expressionFields.valueOptions(host));
        },

        /**
         * Reports what a paste did, under the pills, for a few seconds.
         *
         * Always states both counts, because the difference is the interesting part: entries can
         * vanish to de-duplication (already selected) as well as to failed resolution, and an admin
         * who pasted 400 SKUs and got 380 pills needs to see that without counting them.
         *
         * @param {Object} row Row view-model.
         * @param {Number} parsed Entries the clipboard text split into.
         * @param {Number} added Values actually stored.
         * @param {Number} skipped Entries that resolved to no option.
         * @returns {void}
         */
        _showPasteNotice: function (row, parsed, added, skipped) {
            // Two whole phrases rather than one plus an appended clause: a translator needs the
            // sentence as a sentence, and the skipped count only exists in one of the two.
            var text = (skipped > 0 ? $t('Added %1 of %2, %3 matched no option') : $t('Added %1 of %2'))
                .replace('%1', added)
                .replace('%2', parsed)
                .replace('%3', skipped);

            this._clearPasteNotice(row);
            row.pasteNotice(text);
            row._pasteTimer = setTimeout(function () {
                row.pasteNotice('');
                row._pasteTimer = null;
            }, this.pasteNoticeTimeout);
        },

        /**
         * Drops a row's paste hint and its pending timer — on the next paste (so two pastes never
         * race over one notice) and whenever the value it described is replaced wholesale.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        _clearPasteNotice: function (row) {
            if (row._pasteTimer) {
                clearTimeout(row._pasteTimer);
                row._pasteTimer = null;
            }
            row.pasteNotice('');
        },

        /* ---------------- dropdowns ---------------- */

        /**
         * Opens a row's dropdown with nothing highlighted, so the first ArrowDown lands on the
         * first entry rather than on wherever a previous visit left off.
         *
         * The control name records WHICH of the row's comboboxes the list belongs to, so the other
         * one renders nothing (see dropdownOwnedBy). Omitting it re-opens whatever was open last,
         * which is what the keyboard's re-open after Escape needs: the keystroke arrives on the
         * input that owns the list and has no name of its own to offer.
         *
         * @param {Object} row Row view-model.
         * @param {String} [control] Name of the combobox the list belongs to.
         * @returns {void}
         */
        openDropdown: function (row, control) {
            if (control !== undefined) {
                row.dropdownControl(control);
            }
            row.dropdownOpen(true);
            row.activeOptionIndex(-1);
        },

        /**
         * Closes a row's dropdown at once, collapsing the option tree and dropping the highlight
         * so the next open starts at the roots with nothing selected.
         *
         * There is deliberately no deferred variant. Mouse selection inside the list no longer
         * depends on one: the list container suppresses the focus shift (see keepInputFocus), so
         * the bound input keeps focus through the whole click and a blur that still arrives is
         * genuinely an interaction elsewhere on the page. A second, delayed close path would only
         * re-introduce the race it used to paper over.
         *
         * The searchable selects' query goes with it: it described a list that is going away, and the
         * control's closed state shows the chosen option rather than what was typed into it. The
         * list-valued editors keep their own searchText, where a query is part of a selection still
         * being assembled.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        closeDropdown: function (row) {
            row.comboQuery('');
            row.dropdownOpen(false);
            row.expandedNodes({});
            row.activeOptionIndex(-1);
        },

        /**
         * True when the row's open dropdown belongs to the named combobox — the gate every dropdown's
         * render condition passes through, so one focused input never opens two lists.
         *
         * A call naming no control asks about the open dropdown whatever it is, which is what the
         * keyboard handlers want: the keystroke arrived on the input that owns the list, so there is
         * nothing to disambiguate (expression-listbox dropdownOwnedBy()).
         *
         * @param {Object} row Row view-model.
         * @param {String} [control] Name of the combobox asking.
         * @returns {Boolean}
         */
        dropdownOwnedBy: function (row, control) {
            return expressionListbox.dropdownOwnedBy(control, function () {
                return row.dropdownControl();
            });
        },

        /* ---------------- keyboard navigation & ARIA ---------------- */

        /**
         * Swallows a mousedown inside an open dropdown so the bound input keeps focus.
         *
         * This one handler is what lets every entry commit on `click` instead of on `mousedown`.
         * A mousedown whose default action is suppressed moves no focus and starts no text
         * selection, yet still produces the click — so the input never blurs, the list never closes
         * underneath the pointer, and picking several values in a row keeps the list open. Bound on
         * the list CONTAINER rather than per entry: the handler runs while the event bubbles, which
         * is before the default action would have moved focus, so one binding covers every entry
         * the list renders — including the carets and anything a later change adds.
         *
         * @param {Event} event The mousedown event.
         * @returns {Boolean} Always false — Knockout's event binding suppresses the default action
         *     for every return value but literal true, so the suppression holds even if the
         *     explicit preventDefault above ever becomes unavailable.
         */
        keepInputFocus: function (event) {
            if (event && typeof event.preventDefault === 'function') {
                event.preventDefault();
            }

            return false;
        },

        /**
         * True when the row's dropdown list is actually on screen — the single truth the key
         * handlers, the ARIA state and the templates' render conditions all read.
         *
         * The option-backed dropdowns always have something to show while open (a match list, or
         * the "no matches" verdict), so being open is enough. The type-ahead dropdowns do not: a
         * query shorter than the request threshold was never sent, so an open dropdown can have
         * nothing to say at all, and that case is the suggest visibility rule's to answer.
         *
         * A searchable single-select always has something to show while open — matches, or the "no
         * matches" verdict over its own option list — and the variant is resolved owner-first, so an
         * attribute whose backend supports suggestions never has its ATTRIBUTE list gated by the
         * state of a value suggestion nobody asked for. Each variant's answer is expression-listbox
         * variantListVisible()'s.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for — the row's value on a
         *     single-value editor, its search text on a multi-value one.
         * @param {String} [control] Name of the combobox asking; omitted asks about whichever
         *     dropdown is open.
         * @returns {Boolean}
         */
        dropdownListVisible: function (row, query, control) {
            var self = this;

            if (!row.dropdownOpen() || !this.dropdownOwnedBy(row, control)) {
                return false;
            }

            return expressionListbox.variantListVisible(this._dropdownVariant(row), {
                suggestHasContent: function () {
                    return self.suggestDropdownVisible(row, query);
                }
            });
        },

        /**
         * The variant of the row's dropdown (expression-listbox dropdownVariant()).
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        _dropdownVariant: function (row) {
            var self = this;

            return expressionListbox.dropdownVariant({
                isSearchableSelect: function () {
                    return searchableSelect(row.dropdownControl()) !== null;
                },
                showsTree: function () {
                    return self.rowShowsTree(row);
                },
                usesSuggestions: function () {
                    return self.rowUsesSuggestList(row);
                }
            });
        },

        /**
         * The probe the dropdown variants ask whether the row's dropdown replaces its value.
         *
         * @param {Object} row Row view-model.
         * @returns {{replacesValue: Function}}
         */
        _replacesValueProbe: function (row) {
            var self = this;

            return {
                replacesValue: function () {
                    return self.dropdownReplacesValue(row);
                }
            };
        },

        /**
         * True when the row's dropdown is fed by the AJAX type-ahead rather than by an option list
         * (expression-listbox rowUsesSuggestList()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSuggestList: function (row) {
            var self = this;

            return expressionListbox.rowUsesSuggestList({
                hasOptions: function () {
                    return self.productAttributeHasOptions(row);
                },
                supportsSuggest: function () {
                    return self.productAttributeSupportsSuggest(row);
                }
            });
        },

        /**
         * True for the one dropdown that replaces the row's value instead of adding to a list, the
         * single-value type-ahead (expression-listbox dropdownReplacesValue()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        dropdownReplacesValue: function (row) {
            var self = this;

            return expressionListbox.dropdownReplacesValue({
                usesSuggestList: function () {
                    return self.rowUsesSuggestList(row);
                },
                usesListOperator: function () {
                    return self.rowUsesListOperator(row);
                }
            });
        },

        /**
         * The entries the row's open dropdown currently offers, in rendered order.
         *
         * ONE accessor for all four dropdown variants, and the same helpers the templates render
         * from — the roving highlight indexes into this list, so a list the keyboard walks can
         * never be a different list from the one on screen. The advisory rows (the loading state,
         * the "no matches" verdict, the truncated-search hint) are not here: they are rendered
         * from state, not from these arrays, so nothing selectable-looking is ever unselectable.
         *
         * The open dropdown's OWNER decides first (expression-listbox dropdownVariant()): a searchable
         * single-select's entries come from its own registry-declared option list, which has nothing
         * to do with the row's value editor.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>} Tree nodes in tree mode, otherwise suggestion or option
         *     entries — every entry carrying the `value` a commit writes.
         */
        navigableDropdownItems: function (row) {
            return DROPDOWN_ITEMS[this._dropdownVariant(row)](this, row);
        },

        /**
         * The row's active option helper output — the selected product attribute's own list on a
         * Product Attribute row, the field's list otherwise. Mirrors the dispatch the option index
         * itself uses, so the keyboard reads the list the row's editor renders.
         *
         * @param {Object} row Row view-model.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredDropdownOptions: function (row) {
            return expressionFields.followsAttribute(this.fieldsByType[row.fieldType()] || null)
                ? this.filteredProductAttributeOptions(row)
                : this.filteredOptionsFor(row);
        },

        /**
         * The highlighted dropdown entry, or null when nothing is highlighted.
         *
         * The stored index is validated against the current list on every read rather than being
         * corrected on every list change: lists re-filter on each keystroke, each pick and each
         * arriving suggestion, and an index checked at the point of use cannot survive any of them
         * as a pointer past the end (expression-listbox highlightedItem()).
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null}
         */
        activeDropdownItem: function (row) {
            return expressionListbox.highlightedItem(this.navigableDropdownItems(row), row.activeOptionIndex());
        },

        /**
         * True when the entry at `index` is the highlighted one — the template's `--active`
         * modifier.
         *
         * @param {Object} row Row view-model.
         * @param {Number} index Position in the row's rendered entry list.
         * @returns {Boolean}
         */
        isActiveOption: function (row, index) {
            return row.activeOptionIndex() === index;
        },

        /**
         * Id of the highlighted entry, or null when nothing is highlighted — the combobox input's
         * `aria-activedescendant`, which must be absent rather than empty when there is no active
         * entry. Knockout's attr binding drops an attribute whose value is null.
         *
         * @param {Object} row Row view-model.
         * @returns {String|null}
         */
        activeOptionDomId: function (row) {
            return this.activeDropdownItem(row) === null
                ? null
                : this.optionDomId(row, row.activeOptionIndex());
        },

        /**
         * Attribute map of a combobox input: its wording, whether its popup is on screen, which
         * element that popup is, and which entry inside it is current.
         *
         * `aria-expanded` is emitted as a string because the attribute must exist in both states —
         * a combobox with no aria-expanded reads as a plain text field — while the popup reference
         * is emitted only while the popup exists, since a dangling idref describes nothing.
         *
         * The wording travels as an argument rather than being resolved from the row, because the
         * four dropdown variants differ in what their input invites (browse a list, type a value,
         * type-and-add) while sharing this whole ARIA contract. Each variant's template passes its
         * own wording accessor; a call without one emits the ARIA state alone, so the map never
         * carries an attribute it has nothing to say about.
         *
         * A searchable single-select additionally points at the element carrying the chosen option's
         * CODE. The input's own value is the label, and on a list whose labels repeat the label is
         * exactly what does not identify the choice — so the code has to be part of what the control
         * says, not only part of what it shows. The referenced element is always rendered (empty
         * while the list is open), so the reference never dangles.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for.
         * @param {{placeholder: String, label: String}} [wording] Translated placeholder and
         *     accessible name of this variant's input.
         * @param {String} [control] Name of the combobox this input is.
         * @returns {Object} Attribute name → value map.
         */
        comboboxAttrs: function (row, query, wording, control) {
            var open = this.dropdownListVisible(row, query, control);
            var attrs = {
                'aria-expanded': this.ariaFlag(open),
                'aria-controls': open ? this.listDomId(row) : null,
                'aria-activedescendant': open ? this.activeOptionDomId(row) : null
            };

            if (searchableSelect(control) !== null) {
                attrs['aria-describedby'] = this.comboCodeDomId(row);
            }

            if (!wording) {
                return attrs;
            }

            return _.extend({placeholder: wording.placeholder, 'aria-label': wording.label}, attrs);
        },

        /**
         * ARIA attribute map of a dropdown list element: the id its input points at, and whether
         * picking an entry adds to a list or replaces the value. The multi-select flag is omitted
         * rather than set to false, which is its default.
         *
         * One list id per ROW rather than per combobox, which holds because a row never renders two
         * dropdown lists at once: only the combobox owning the open dropdown renders one, and the
         * two searchable selects are mutually exclusive by field type — the picker's Attribute
         * control exists only on a `product-attribute` field, the searchable value select only on a
         * `select` one.
         *
         * @param {Object} row Row view-model.
         * @returns {Object} Attribute name → value map.
         */
        listAttrs: function (row) {
            return {
                id: this.listDomId(row),
                'aria-multiselectable': this.dropdownAddsToList(row) ? 'true' : null
            };
        },

        /**
         * True when picking an entry from the row's OPEN dropdown adds to a list of values rather
         * than settling a single one — the claim `aria-multiselectable` makes.
         *
         * The searchable single-selects settle one value by definition, whatever the row's value
         * editor happens to be: the Attribute control picks an attribute code, not a value, so the
         * value editor's shape says nothing about it (expression-listbox variantAddsToList()).
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        dropdownAddsToList: function (row) {
            return expressionListbox.variantAddsToList(this._dropdownVariant(row), this._replacesValueProbe(row));
        },

        /**
         * ARIA attribute map of one flat dropdown entry: its stable id (the input's
         * aria-activedescendant target) and whether the row's value already holds it.
         *
         * @param {Object} row Row view-model.
         * @param {Number} index Position in the row's rendered entry list.
         * @param {*} optionValue The entry's option value.
         * @returns {Object} Attribute name → value map.
         */
        optionAttrs: function (row, index, optionValue) {
            return {
                id: this.optionDomId(row, index),
                'aria-selected': this.ariaFlag(this.optionIsSelected(row, optionValue))
            };
        },

        /**
         * ARIA attribute map of one option-tree entry: the flat entry's id and selection state
         * plus the hierarchy a flat list has no need for. `aria-expanded` is emitted only for
         * nodes that have children — on a leaf it would claim a collapsed subtree that does not
         * exist.
         *
         * A partially-selected node is `aria-selected="false"`, which is the truth: the row itself
         * is not selected, something below it is. That distinction is carried visually by the
         * checkbox's third state, so it also gets said in words — the node's `title` — rather than
         * living in a colour nobody can hear. A fully selected or empty node needs no title and
         * emits none; Knockout drops an attribute whose value is null.
         *
         * @param {Object} row Row view-model.
         * @param {Number} index Position in the row's rendered entry list.
         * @param {Object} node Visible tree node from visibleTreeNodes().
         * @returns {Object} Attribute name → value map.
         */
        treeNodeAttrs: function (row, index, node) {
            return {
                id: this.optionDomId(row, index),
                'aria-selected': this.ariaFlag(node.selected),
                'aria-level': String(Number(node.level) || 1),
                'aria-expanded': node.hasChildren ? this.ariaFlag(node.expanded) : null,
                title: node.mixed ? this.treeMixedTitle(node) : null
            };
        },

        /**
         * True when the row's current selection already holds an option value
         * (expression-list-value holds()).
         *
         * What "the selection" is depends on the open dropdown: a searchable single-select is asked
         * about ITS own subject — the Attribute control's is the chosen attribute code, not the row's
         * value — so its entries do not all announce themselves unselected while the row's value
         * happens to hold something unrelated.
         *
         * @param {Object} row Row view-model.
         * @param {*} optionValue Option value to test.
         * @returns {Boolean}
         */
        optionIsSelected: function (row, optionValue) {
            var control = searchableSelect(row.dropdownControl());

            return expressionListValue.holds(control === null ? row.value() : control.selected(this, row), optionValue);
        },

        /**
         * Renders a boolean as the string an ARIA state attribute takes. Knockout's attr binding
         * removes an attribute set to boolean false, which for a state attribute would say
         * "not applicable" instead of "false".
         *
         * @param {Boolean} flag State to render.
         * @returns {String} 'true' or 'false'.
         */
        ariaFlag: function (flag) {
            return flag ? 'true' : 'false';
        },

        /**
         * The combobox/listbox key pattern, shared by all four dropdown variants
         * (expression-listbox dropdownKeyAction() states it). The pattern resolves the key into
         * an action against what the row's dropdown shows now; DROPDOWN_KEY_ACTIONS applies it.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The keydown event.
         * @param {*} query The text the suggestions were requested for.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed —
         *     Knockout's event binding suppresses the default action for every value but literal
         *     true.
         */
        handleDropdownKeydown: function (row, event, query) {
            var self = this;
            var action = expressionListbox.dropdownKeyAction(expressionListbox.keyName(event), {
                isOpen: function () {
                    return row.dropdownOpen();
                },
                isListVisible: function () {
                    return self.dropdownListVisible(row, query);
                },
                items: function () {
                    return self.navigableDropdownItems(row);
                },
                activeIndex: function () {
                    return row.activeOptionIndex();
                },
                showsTree: function () {
                    return self.rowShowsTree(row);
                }
            });

            DROPDOWN_KEY_ACTIONS[action.name](this, row, action);

            return !action.consumed;
        },

        /**
         * Scrolls the highlighted entry just far enough to be visible inside the scrolling list.
         *
         * Runs against the element Knockout has already rendered — only its modifier class
         * changed, never its existence — so no deferral is needed. A missing element (an index
         * that outran the list, or no highlight at all) simply scrolls nothing.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        _scrollHighlightIntoView: function (row) {
            var domId = this.activeOptionDomId(row);
            var element = domId === null ? null : document.getElementById(domId);

            if (element && typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({block: 'nearest'});
            }
        },

        /**
         * Commits one dropdown entry — the keyboard's Enter doing what a click on that entry does.
         *
         * The variant is resolved owner-first (expression-listbox dropdownVariant()), its commit rule names
         * the action (expression-listbox variantCommit()), and DROPDOWN_COMMIT_ACTIONS applies it through the
         * method the entry's click binding calls, so mouse and keyboard cannot drift.
         *
         * @param {Object} row Row view-model.
         * @param {Object} item Entry from navigableDropdownItems().
         * @returns {void}
         */
        commitDropdownItem: function (row, item) {
            var action = expressionListbox.variantCommit(this._dropdownVariant(row), item, this._replacesValueProbe(row));

            DROPDOWN_COMMIT_ACTIONS[action.name](this, row, action.value);
        },

        /**
         * Toggles one option-tree node's selection (expression-option-tree selectionToggle()), through the
         * write a pill's remove button or an option click performs. Selectedness is read from the row's value
         * rather than taken from the node, so a click acts on the state the row is in now.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value of the node to toggle.
         * @returns {void}
         */
        toggleTreeNode: function (row, value) {
            TREE_SELECTION_ACTIONS[expressionOptionTree.selectionToggle(this.optionIsSelected(row, value))](this, row, value);
        },

        /**
         * Keydown on a value editor whose Enter means nothing of its own: the shared dropdown
         * pattern, with a fall-through Enter swallowed instead of handed to the browser.
         *
         * These editors take their values from the list, never from the text in the input, so
         * Enter with nothing highlighted has nothing to commit — and every one of them sits inside
         * the admin form, where an unhandled Enter submits it. Swallowing costs nothing and removes
         * a save nobody asked for (expression-listbox editorKeyFallthrough()).
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The keydown event.
         * @param {*} query The text the suggestions were requested for.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed.
         */
        handleValueKeydown: function (row, event, query) {
            if (this.handleDropdownKeydown(row, event, query) !== true) {
                return false;
            }

            return !expressionListbox.editorKeyFallthrough('value', expressionListbox.keyName(event)).consumed;
        },

        /**
         * Keydown on a free-text multi-value search input: the shared dropdown pattern first, then
         * the input's own Enter behaviour.
         *
         * Order is the point. With an entry highlighted, Enter commits that suggestion; with
         * nothing highlighted, Enter commits the text as typed — which is what a free-text list
         * editor is for, and what the admin sees in the input (expression-listbox
         * editorKeyFallthrough(); EDITOR_KEY_ACTIONS applies it).
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The keydown event.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed.
         */
        handleFreeTextKeydown: function (row, event) {
            var action;

            if (this.handleDropdownKeydown(row, event, row.searchText()) !== true) {
                return false;
            }
            action = expressionListbox.editorKeyFallthrough('free-text', expressionListbox.keyName(event));
            EDITOR_KEY_ACTIONS[action.name](this, row);

            return !action.consumed;
        },

        /**
         * Accessible name of a pill's remove button. The glyph itself is decorative, so without a
         * name every remove button in a long pill list sounds identical; naming the value makes
         * each one say what it removes.
         *
         * @param {*} text The pill's display text.
         * @returns {String}
         */
        pillRemoveLabel: function (text) {
            // split/join, not replace: a label is arbitrary catalogue text, and a `$` sequence in it
            // would otherwise be read as a replacement pattern.
            return $t('Remove %1').split('%1').join(this.displayLabel(text));
        },

        /**
         * Accessible name of the pill-list toggle. The visible label counts pills; the name says
         * what the count is about and keeps the visible words inside it, so speaking the visible
         * label still activates the control.
         *
         * @param {Object} row Row view-model.
         * @param {Array} allPills Every pill the editor would render.
         * @returns {String}
         */
        pillToggleAriaLabel: function (row, allPills) {
            return row.pillsExpanded()
                ? $t('Show fewer selected values')
                : $t('Show %1 more selected values')
                    .replace('%1', expressionListValue.hiddenPillCount(allPills, this.pillCollapseLimit));
        },

        /**
         * Accessible name of an option-tree caret, which carries a decorative glyph and would
         * otherwise be an unnamed button. States the action and the node it applies to.
         *
         * @param {Object} node Visible tree node from visibleTreeNodes().
         * @returns {String}
         */
        treeToggleLabel: function (node) {
            // split/join for the same reason as the pill remove name: the node label is catalogue text.
            return (node.expanded ? $t('Collapse %1') : $t('Expand %1'))
                .split('%1')
                .join(this.displayLabel(node.label));
        },

        /**
         * Tooltip of a partially-selected tree node: how many values below it are selected. The
         * checkbox's third state is a shape and a colour on its own, and "some of what is inside
         * this branch is chosen" is not something a shape can say.
         *
         * @param {Object} node Visible tree node from visibleTreeNodes().
         * @returns {String}
         */
        treeMixedTitle: function (node) {
            return $t('%1 selected inside').replace('%1', node.selectedInside);
        },

        /**
         * Tooltip of a tree node's count badge. A bare number beside a name is read as whatever the
         * reader came for, so the badge has to name what it counts: the entries nested under this
         * one, at any depth.
         *
         * @param {Object} node Visible tree node from visibleTreeNodes().
         * @returns {String}
         */
        treeCountTitle: function (node) {
            return $t('%1 subcategories').replace('%1', node.descendants);
        },

        /**
         * Tooltip of the collapse-all action, which doubles as the explanation for its missing
         * sibling: a control that is simply absent above a size threshold teaches nobody why, and
         * this is the only place left to say it. Names the threshold, read from the same tunable the
         * guard compares against, so the two cannot drift.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        collapseAllTreeTitle: function (row) {
            return this.canExpandAllTreeNodes(row)
                ? $t('Collapse every expanded entry')
                : $t('Expanding all is unavailable above %1 entries').replace('%1', this.treeExpandAllLimit);
        },

        /**
         * The label of the row's operator, or the operator itself when no descriptor carries it.
         *
         * @param {Object} row Row view-model.
         * @returns {*}
         */
        labelForOperator: function (row) {
            return expressionFields.operatorLabel(this.operatorsFor(row), row.operator());
        },

        /**
         * The bare label of one of the row's field options, or the value itself when no option
         * carries it.
         *
         * @param {Object} row Row view-model.
         * @param {*} optionValue
         * @returns {String}
         */
        labelForOptionValue: function (row, optionValue) {
            return this.displayLabel(expressionFields.optionLabel(this.valueOptionsFor(row), optionValue));
        },

        /**
         * A label without the leading depth prefix some option sources render into it
         * (expression-options displayLabel()): useful while browsing, redundant once chosen.
         *
         * @param {*} label
         * @returns {String}
         */
        displayLabel: function (label) {
            return expressionOptions.displayLabel(label);
        },

        /**
         * The label of the row's picked attribute, or its code when no descriptor carries it.
         *
         * @param {Object} row Row view-model.
         * @returns {*}
         */
        labelForProductAttribute: function (row) {
            return expressionFields.attributeLabel(this.attributesFor(row), row.productAttribute());
        },

        /* ---------------- component wording handed to the templates ---------------- */

        /*
         * The accessors below are the component's own phrases, reachable from a binding.
         *
         * They exist because a raw attribute in a Knockout template is untranslatable: nothing looks
         * inside `title="…"` or `aria-label="…"`, so a phrase an attribute carries has to arrive
         * through a binding — and a binding can only read a member. Text CONTENT is the exception:
         * the `i18n` binding translates a literal in place, so static visible text stays in the
         * markup where it reads best.
         *
         * One phrase per accessor, and the template keeps writing the attribute names itself. That
         * is deliberate: an accessor returning a whole attribute map would hide `aria-label` from
         * the markup, and the accessible-name sweep over the templates reads exactly that.
         */

        /**
         * Accessible name of a NESTED group's box — the landmark that tells a screen reader a
         * subtree starts here. The outermost group is the builder itself and carries none.
         *
         * @returns {String}
         */
        nestedGroupLabel: function () {
            return $t('Nested condition group');
        },

        /**
         * Tooltip of a group's drag handle: it states both ways to move the group, because the
         * keyboard half is otherwise undiscoverable.
         *
         * @returns {String}
         */
        groupDragTitle: function () {
            return $t('Drag to move this group, or use the arrow keys');
        },

        /**
         * Accessible name of a group's drag handle, which renders only a decorative glyph.
         *
         * @returns {String}
         */
        groupDragLabel: function () {
            return $t('Reorder group');
        },

        /**
         * Tooltip explaining what one aggregator means, for the group's ALL/ANY buttons and for the
         * connector word between two children — the same claim in both places, so it is one phrase.
         *
         * @param {String} aggregator 'all' or 'any'.
         * @returns {String}
         */
        aggregatorTitle: function (aggregator) {
            return aggregator === 'any'
                ? $t('Any one condition in this group may match')
                : $t('Every condition in this group must match');
        },

        /**
         * Accessible name of one aggregator button. The visible glyph is a bare ALL/ANY, which says
         * nothing on its own about what it applies to.
         *
         * @param {String} aggregator 'all' or 'any'.
         * @returns {String}
         */
        aggregatorButtonLabel: function (aggregator) {
            return aggregator === 'any'
                ? $t('Match ANY one condition in this group')
                : $t('Match ALL conditions in this group');
        },

        /**
         * The group's heading — the one place the current aggregator is stated in words, which is
         * why it is also the group's spoken summary.
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupHeading: function (group) {
            return group.aggregator() === 'any'
                ? $t('At least one condition below must match')
                : $t('Every condition below must match');
        },

        /**
         * The aggregator word the joiner rail restates beside a group's children — the same
         * ALL/ANY the segmented buttons spell, repeated where the joining actually happens so a
         * scrolled-down group still says how its rows combine.
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupAggregatorWord: function (group) {
            return group.aggregator() === 'any' ? $t('ANY') : $t('ALL');
        },

        /**
         * One-line contents summary of a group: its direct condition rows and, when any exist,
         * its direct child groups. Direct children only — what a nested group holds is that
         * group's own summary to state (expression-tree groupContents()).
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupSummary: function (group) {
            var contents = expressionTree.groupContents(group.children());
            var text = contents.conditions === 1
                ? $t('1 condition')
                : $t('%1 conditions').replace('%1', contents.conditions);

            if (contents.groups > 0) {
                text += ' · ' + (contents.groups === 1 ? $t('1 group') : $t('%1 groups').replace('%1', contents.groups));
            }

            return text;
        },

        /**
         * True when a group directly holds at least one condition row — the render condition of the
         * Field/Operator/Value column-caption line (expression-tree groupContents()).
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        groupHasConditionRows: function (group) {
            return expressionTree.groupContents(group.children()).hasConditions;
        },

        /**
         * True when a group holds nothing at all — the render condition of the inline
         * empty-group hint. The serialiser drops an empty group, so the hint says exactly that
         * instead of leaving a bare box that looks like a rendering failure (expression-tree
         * groupContents()).
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        groupIsEmpty: function (group) {
            return expressionTree.groupContents(group.children()).empty;
        },

        /**
         * Name of a group's duplicate action, read as both its tooltip and its accessible name.
         *
         * @returns {String}
         */
        duplicateGroupLabel: function () {
            return $t('Duplicate group');
        },

        /**
         * Name of a group's remove action, read as both its tooltip and its accessible name.
         *
         * @returns {String}
         */
        removeGroupLabel: function () {
            return $t('Remove group');
        },

        /**
         * Tooltip of a condition row's drag handle — the row-level counterpart of the group one.
         *
         * @returns {String}
         */
        rowDragTitle: function () {
            return $t('Drag to reorder, or use the arrow keys');
        },

        /**
         * Accessible name of a condition row's drag handle.
         *
         * @returns {String}
         */
        rowDragLabel: function () {
            return $t('Reorder condition');
        },

        /**
         * Accessible name of the Field editor. Each editor names itself even though its column
         * carries a visible heading: those headings are plain labels, bound to no control, so they
         * are read as text and never as the control's name.
         *
         * @returns {String}
         */
        fieldEditorLabel: function () {
            return $t('Field');
        },

        /**
         * Accessible name of the product-attribute editor.
         *
         * @returns {String}
         */
        attributeEditorLabel: function () {
            return $t('Attribute');
        },

        /**
         * Accessible name of the Operator editor.
         *
         * @returns {String}
         */
        operatorEditorLabel: function () {
            return $t('Operator');
        },

        /**
         * Accessible name of a value editor — every branch of the value column, from the plain
         * select to the generic scalar input.
         *
         * @returns {String}
         */
        valueEditorLabel: function () {
            return $t('Value');
        },

        /**
         * Placeholder of a value input with nothing more specific to invite: the generic scalar
         * editor in its plain-text shape, and the raw multi-value fallback. A field that configures
         * its own placeholder keeps it — that one is the consumer's wording.
         *
         * @returns {String}
         */
        valuePlaceholder: function () {
            return $t('Enter value');
        },

        /**
         * The unselected entry of an optioned-attribute select. It has to read as "nothing chosen
         * yet" rather than as a value, since choosing it writes an empty value.
         *
         * @returns {String}
         */
        selectCaption: function () {
            return $t('— select —');
        },

        /**
         * Tooltip of a pill's remove button. The button's accessible name names the value it
         * removes (see pillRemoveLabel); the tooltip is the short form a pointer user gets.
         *
         * @returns {String}
         */
        pillRemoveTitle: function () {
            return $t('Remove');
        },

        /**
         * Tooltip of a multi-value editor's clear-all button, which says what it will do rather
         * than what it is.
         *
         * @returns {String}
         */
        clearAllTitle: function () {
            return $t('Remove every selected value');
        },

        /**
         * Accessible name of the clear-all button. Longer than the visible label, which is two
         * words in a row full of values and would be ambiguous read on its own.
         *
         * @returns {String}
         */
        clearAllLabel: function () {
            return $t('Clear all selected values');
        },

        /**
         * Name of a row's duplicate action, read as both its tooltip and its accessible name.
         *
         * @returns {String}
         */
        duplicateRowLabel: function () {
            return $t('Duplicate condition');
        },

        /**
         * Name of a row's remove action, read as both its tooltip and its accessible name.
         *
         * @returns {String}
         */
        removeRowLabel: function () {
            return $t('Remove condition');
        },

        /**
         * Wording of the search input above an option list: it browses a list that already exists,
         * so it promises no adding of its own.
         *
         * @returns {{placeholder: String, label: String}}
         */
        optionSearchWording: function () {
            return {
                placeholder: $t('Search…'),
                label: $t('Search values to add')
            };
        },

        /**
         * Wording of the picker's Attribute combobox. Its accessible name is the column's own, because
         * this input IS the Attribute control — it replaces a `<select>` and settles one attribute, so
         * naming it after the search it offers would rename the control itself.
         *
         * @returns {{placeholder: String, label: String}}
         */
        attributeSearchWording: function () {
            return {
                placeholder: $t('Search…'),
                label: this.attributeEditorLabel()
            };
        },

        /**
         * Wording of a large `select` field's value combobox — the same reasoning as the Attribute
         * one: it is the value editor, not a search beside it.
         *
         * @returns {{placeholder: String, label: String}}
         */
        optionSelectWording: function () {
            return {
                placeholder: $t('Search…'),
                label: this.valueEditorLabel()
            };
        },

        /**
         * Wording of the single-value type-ahead input. It IS the value editor — picking a
         * suggestion replaces the value — so its accessible name is the value column's.
         *
         * @returns {{placeholder: String, label: String}}
         */
        valueSuggestWording: function () {
            return {
                placeholder: $t('Type to search…'),
                label: this.valueEditorLabel()
            };
        },

        /**
         * Wording of the multi-value type-ahead input, whose entries need not come from the
         * suggestions at all: whatever is typed can be committed as a value of its own.
         *
         * @returns {{placeholder: String, label: String}}
         */
        listSuggestWording: function () {
            return {
                placeholder: $t('Type to search, Enter to add…'),
                label: $t('Search or type a value to add')
            };
        },

        /* ---------------- design-system presentation ---------------- */

        /**
         * Modifier classes of the builder root, from the visual tunables: which joiner treatment
         * the group bodies draw and whether the rows sit compact. A class map for the template's
         * css binding, so everything that follows from the choice belongs to the stylesheet.
         *
         * @returns {Object.<String, Boolean>}
         */
        builderModifierClasses: function () {
            return {
                'ufe-expression-builder--joiner-rail': this.joinerStyle === 'rail',
                'ufe-expression-builder--joiner-chip': this.joinerStyle === 'chip',
                'ufe-expression-builder--joiner-none': this.joinerStyle === 'none',
                'ufe-expression-builder--compact': this.density === 'compact'
            };
        },

        /**
         * True while the preview block — structured preview, match-count badge, warnings — is
         * rendered at all, from the `showPreview` tunable.
         *
         * @returns {Boolean}
         */
        showPreviewBlock: function () {
            return this.showPreview;
        },

        /**
         * The rule-summary chip beside the builder's heading: how many conditions the whole rule
         * holds and — once any group nests — how deep (expression-tree ruleSummary()). The one line
         * that still describes the whole rule while a long one is scrolled.
         *
         * @returns {String}
         */
        ruleSummaryText: function () {
            var summary = expressionTree.ruleSummary(this._shapeOf(this.rootGroup()));
            var text;

            if (summary.conditions === 0) {
                return $t('No conditions yet');
            }

            text = summary.conditions === 1
                ? $t('1 condition')
                : $t('%1 conditions').replace('%1', summary.conditions);

            if (summary.depth !== null) {
                text += ' · ' + $t('Nesting depth %1').replace('%1', summary.depth);
            }

            return text;
        },

        /**
         * The selection count in a tree dropdown's header row: how many values the row stores.
         * Stated in the header because the pills that spell those values sit above the dropdown,
         * outside what an admin working down a long branch can still see.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        selectedCountText: function (row) {
            return $t('%1 selected').replace('%1', this.valueAsArray(row).length);
        },

        /**
         * The advisory line in an options dropdown's footer, beside its Done action: what a
         * click on an entry does in the mode the dropdown is currently in — tree rows toggle
         * both ways, the flat match list only ever adds.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        dropdownFooterHint: function (row) {
            return this.rowShowsTree(row)
                ? $t('Click a row to select it · the caret opens the branch')
                : $t('Click a value to add it');
        },

        /* ---------------- reordering: pointer drag & keyboard move ---------------- */

        /**
         * True while the node is the one being dragged — the template's dragging modifier.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Boolean}
         */
        isDragging: function (node) {
            return this.dragNode() === node;
        },

        /**
         * True when the drop indicator belongs in the gap directly ABOVE this node
         * (expression-reorder marksGapBefore()). The template renders one indicator per gap and asks per
         * node, because inside the children foreach the owning group is out of reach.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Boolean}
         */
        isDropSlotBefore: function (node) {
            return expressionReorder.marksGapBefore(this.dropTarget(), node, function (group) {
                return group.children();
            });
        },

        /**
         * True when the drop indicator belongs after a group's last child — the one gap that has no
         * following node to name it, and therefore the group's own to answer for (expression-reorder
         * marksGapAtEnd()). Together with isDropSlotBefore this covers every insertion slot exactly
         * once.
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        isDropSlotAtEnd: function (group) {
            return expressionReorder.marksGapAtEnd(this.dropTarget(), group, function () {
                return group.children().length;
            });
        },

        /**
         * Begins a pointer drag of one node.
         *
         * The handle captures the pointer and Escape cancels the drag until it ends — the DOM work
         * is expression-drag.js's. Suppressing this event's default action (which is what stops
         * the browser from starting a text selection under the pointer) deliberately leaves focus
         * where it was, which is why Escape needs a listener of its own.
         *
         * A drag can only start on a handle — the handles are the only elements carrying these
         * bindings — and only from the primary button, so a right-click on a handle opens the
         * context menu instead of picking the node up.
         *
         * Knockout registers event handlers through jQuery when it is present (it is, in
         * adminhtml), so the object handed over is jQuery's wrapper, not the native event: only the
         * properties jQuery normalises exist here, which is why the button is tested through
         * `button` rather than `isPrimary`.
         *
         * @param {Object} node Row or group view-model the handle belongs to.
         * @param {Event} event The pointerdown event.
         * @returns {Boolean} Always false — Knockout's event binding suppresses the default action
         *     for every return value but literal true, which is exactly what this handler wants.
         */
        startDrag: function (node, event) {
            var self = this;
            var handle = event && event.currentTarget ? event.currentTarget : null;

            if (this.dragNode() !== null || handle === null || event.button > 0) {
                return false;
            }
            this.dragNode(node);
            this.dropTarget(null);
            this._drag.start(handle, event.pointerId === undefined ? null : event.pointerId, function () {
                self.cancelDrag();
            });

            return false;
        },

        /**
         * Tracks the pointer during a drag: re-resolves which insertion slot it is nearest to.
         *
         * Returns true when no drag is running, and that is not a formality — the handle receives
         * pointermove whenever the pointer merely passes over it, and suppressing the default
         * action of those would break nothing visibly today but is a lie about what happened.
         *
         * @param {Event} event The pointermove event.
         * @returns {Boolean} false while dragging (the move is consumed), true otherwise.
         */
        dragMove: function (event) {
            if (this.dragNode() === null) {
                return true;
            }
            this._updateDropTarget(event.clientX, event.clientY);

            return false;
        },

        /**
         * Ends a pointer drag: the slot the indicator was marking is where the node lands.
         *
         * No slot means cancel, which covers both ways a drag can end in nothing — the pointer was
         * released outside the builder (the indicator clears as soon as it leaves), and it never
         * moved at all, so a click on a handle rearranges nothing.
         *
         * The drag state is released BEFORE the move is applied, so the dragging modifier is gone
         * from the node before the re-render moves it.
         *
         * @returns {Boolean} false when a drag ended here, true when there was none to end.
         */
        endDrag: function () {
            var node = this.dragNode();
            var target = this.dropTarget();

            if (node === null) {
                return true;
            }
            this._releaseDrag();

            if (target !== null) {
                this._moveNodeTo(node, target.group, target.index);
            }

            return false;
        },

        /**
         * Abandons a drag without moving anything — Escape, and any loss of the pointer capture.
         *
         * `lostpointercapture` fires after every drag, the successful ones included (releasing the
         * capture is what raises it), so this has to be a no-op once a drop has already been
         * applied — hence the guard rather than an unconditional cleanup. It is also the funnel for
         * every interruption that ends a drag without a release: a cancelled pointer (an
         * interrupted touch), and the capture element being taken out of the document.
         *
         * @returns {Boolean} false when a drag was cancelled here, true when there was none.
         */
        cancelDrag: function () {
            if (this.dragNode() === null) {
                return true;
            }
            this._releaseDrag();

            return false;
        },

        /**
         * Drops every trace of a running drag: the node and the indicator here, the Escape
         * listener and the pointer capture in expression-drag.js. Idempotent, so destroy() can call
         * it whether or not a drag is running.
         *
         * @returns {void}
         */
        _releaseDrag: function () {
            this.dragNode(null);
            this.dropTarget(null);
            this._drag.release();
        },

        /**
         * Resolves a pointer position to the insertion slot it is nearest to, and marks it.
         *
         * A position outside the builder's own box marks nothing: the indicator disappears, which
         * is both the feedback that releasing here does nothing and the mechanism that makes it so.
         * Inside, the nearest gap wins (expression-reorder nearestSlot()). Nested groups carry a
         * header and a footer, so the gap just inside a group and the gap just before it are a whole
         * chrome row apart and never actually tie.
         *
         * The observable is written only when the slot really changed, so dragging across one row
         * re-renders the indicator once instead of once per pointer event.
         *
         * @param {Number} clientX Pointer position in viewport coordinates.
         * @param {Number} clientY Pointer position in viewport coordinates.
         * @returns {void}
         */
        _updateDropTarget: function (clientX, clientY) {
            var current = this.dropTarget();
            var nearest = this._pointerInsideBuilder(clientX, clientY)
                ? expressionReorder.nearestSlot(this._dropCandidates(this.dragNode()), clientY)
                : null;

            if (nearest === null) {
                if (current !== null) {
                    this.dropTarget(null);
                }

                return;
            }

            if (expressionReorder.sameSlot(current, nearest)) {
                return;
            }
            this.dropTarget({group: nearest.group, index: nearest.index});
        },

        /**
         * The slots a drag may drop the node into (expression-reorder dropSlots()), each with the
         * y coordinate of its gap on screen.
         *
         * Re-measured on every pointer move rather than cached at drag start, because the layout
         * genuinely moves under a drag: the page scrolls, a row's open dropdown closes, a long pill
         * list reflows. The reads are cheap in the state that matters — nothing here writes to the
         * DOM, and the indicator is out of the flow, so the boxes the browser hands back are the
         * ones it already has.
         *
         * @param {Object} node Row or group view-model being dragged.
         * @returns {Array.<{group: Object, index: Number, y: Number}>}
         */
        _dropCandidates: function (node) {
            var self = this;
            var walk = this._slotWalk(node);

            if (walk === null) {
                return [];
            }

            return expressionReorder.dropSlots(walk, this._heightOf(node), this.maxGroupDepth)
                .map(function (slot) {
                    return self._slotAnchor(slot.path);
                })
                .filter(function (anchor) {
                    return anchor !== null;
                });
        },

        /**
         * The node's insertion slots and where the node itself sits among them
         * (expression-reorder slotWalk()), over an index-faithful projection of the view-model tree.
         *
         * @param {Object} node Row or group view-model.
         * @returns {{slots: Array.<{path: Array.<Number>}>, before: Number}|null} null when the
         *     node is not in the tree (the root group, which cannot move).
         */
        _slotWalk: function (node) {
            var path = this.findPath(node);

            return path === null
                ? null
                : expressionReorder.slotWalk(this._structureModelFromVm(this.rootGroup()), path);
        },

        /**
         * Resolves one slot path to the group it inserts into, the index inside it, and the y coordinate
         * of the gap on screen, measured where expression-reorder slotAnchor() says. A node whose element
         * cannot be found yields null and drops out of the candidate list rather than contributing a bogus
         * coordinate.
         *
         * @param {Array.<Number>} slotPath Receiving group path plus insertion index.
         * @returns {{group: Object, index: Number, y: Number}|null}
         */
        _slotAnchor: function (slotPath) {
            var group = this._groupAtPath(slotPath.slice(0, -1));
            var index = slotPath[slotPath.length - 1];
            var anchor;
            var rect;

            if (group === null) {
                return null;
            }
            anchor = expressionReorder.slotAnchor(index, group.children().length);
            rect = this._drag.measure(SLOT_ANCHOR_IDS[anchor.element](this, group, anchor));

            return rect === null ? null : {group: group, index: index, y: rect[anchor.edge]};
        },

        /**
         * True when a pointer position lies inside the authoring area.
         *
         * Measured against the ROOT GROUP's box rather than the whole element: everything below it
         * — the preview, the count badge, the warnings — is output, not a place a condition can be
         * dropped. A missing root element reads as outside, so an unmeasurable builder cancels
         * drags instead of dropping them somewhere arbitrary.
         *
         * @param {Number} clientX Pointer position in viewport coordinates.
         * @param {Number} clientY Pointer position in viewport coordinates.
         * @returns {Boolean}
         */
        _pointerInsideBuilder: function (clientX, clientY) {
            return expressionReorder.insideBox(
                this._drag.measure(this.nodeDomId(this.rootGroup())),
                clientX,
                clientY
            );
        },

        /**
         * Moves a node one insertion slot up or down from a focused drag handle — the keyboard's
         * whole share of reordering, and the only one an admin who cannot use a pointer has.
         *
         * One keystroke is always exactly one visible change (expression-reorder stepSlot()): within
         * a group the node swaps with its neighbour, and at a group's edge repeated presses walk into
         * and out of nested groups. At either end of the list nothing happens — the key is still
         * consumed, because a handle is not a place where scrolling the page is the expected answer
         * to an arrow key.
         *
         * @param {Object} node Row or group view-model the handle belongs to.
         * @param {Event} event The keydown event.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed.
         */
        handleDragKeydown: function (node, event) {
            var step = expressionReorder.stepForKey(expressionListbox.keyName(event));
            var walk;
            var slot;
            var group;

            if (step === 0) {
                return true;
            }
            walk = this._slotWalk(node);

            if (walk === null) {
                return false;
            }
            slot = expressionReorder.stepSlot(walk, step, this._heightOf(node), this.maxGroupDepth);

            if (slot === null) {
                return false;
            }
            group = this._groupAtPath(slot.path.slice(0, -1));

            if (group !== null) {
                this._moveNodeTo(node, group, slot.path[slot.path.length - 1]);
            }

            return false;
        },

        /**
         * Moves one node into a group's insertion slot — the single application path for every
         * reorder, pointer drop and keystroke alike.
         *
         * The pure model decides whether the move is legal: it is asked first, over an
         * index-faithful projection of the view-model tree, and a refusal (a slot inside the moved
         * node's own subtree, a path out of range) leaves the tree untouched. Only then are the two
         * splices applied to the observable arrays, with the same insertion index the model used.
         * The two writes are separate notifications, which nothing observes: the autosave and count
         * computeds are both deferred, so they see the finished tree once.
         *
         * Aggregators are never involved. They belong to groups, which a move only ever reorders,
         * so the logic around a moved node reads exactly as it did before.
         *
         * The depth cap is re-checked here rather than trusted from the caller, which makes "no
         * reorder may nest past the cap" a fact of this single application path rather than a
         * convention every future caller has to remember.
         *
         * @param {Object} node Row or group view-model to move.
         * @param {Object} targetGroup Group view-model receiving the node.
         * @param {Number} slotIndex Insertion index in the target's children, in the coordinates of
         *     the tree BEFORE the move.
         * @returns {Boolean} True when the tree changed.
         */
        _moveNodeTo: function (node, targetGroup, slotIndex) {
            var fromPath = this.findPath(node);
            var groupPath = this._pathOfGroup(targetGroup);
            var sourceGroup = this.findParentOf(node);
            var fromIndex;

            if (fromPath === null || groupPath === null || sourceGroup === null) {
                return false;
            }

            if (!this._slotFits(groupPath.concat([slotIndex]), node)) {
                return false;
            }

            if (expressionTree.moveNode(
                this._structureModelFromVm(this.rootGroup()),
                fromPath,
                groupPath.concat([slotIndex])
            ) === null) {
                return false;
            }
            fromIndex = fromPath[fromPath.length - 1];
            sourceGroup.children.splice(fromIndex, 1);
            targetGroup.children.splice(
                expressionReorder.insertIndex(targetGroup === sourceGroup, slotIndex, fromIndex),
                0,
                node
            );
            this._announceMove(node);
            this._focusLater(this.dragHandleDomId(node));

            return true;
        },

        /**
         * Reports where a node ended up, for the reorder live region — counted in insertion slots
         * (expression-reorder placeOf()).
         *
         * @param {Object} node Row or group view-model that has just moved.
         * @returns {void}
         */
        _announceMove: function (node) {
            var walk = this._slotWalk(node);
            var place;

            if (walk === null) {
                return;
            }
            place = expressionReorder.placeOf(walk);
            this.moveAnnouncement(
                $t('Moved to position %1 of %2')
                    .replace('%1', place.position)
                    .replace('%2', place.total)
            );
        },

        /**
         * Index-faithful projection of the view-model tree onto the pure model's group shape.
         *
         * Every node maps to exactly one model node — nothing is compacted, unlike the
         * serialisation walk, which drops rows whose field is not configured — so a child-index
         * path addresses the same node in both trees. That is the whole point: the paths handed to
         * the pure model and the indexes spliced into the observable arrays have to mean the same
         * thing.
         *
         * Deliberately structural: it reads a group's aggregator and children and a row's
         * identity, and no row observable at all. The coherence projection next to it reads the
         * editor state instead, which is exactly what a pointer-move path must not touch.
         *
         * @param {Object} groupVm Group view-model.
         * @returns {Object} Plain group node whose condition payloads are the row view-models.
         */
        _structureModelFromVm: function (groupVm) {
            var children = [];

            _.each(groupVm.children(), function (child) {
                children.push(child.kind === 'group'
                    ? this._structureModelFromVm(child)
                    : {kind: 'condition', condition: child});
            }, this);

            return {kind: 'group', aggregator: groupVm.aggregator(), children: children};
        },

        /**
         * The bare shape of a node — groups and their children, nothing else — for questions about
         * size and nesting. It reads only the children observables, so a binding asking how many
         * conditions a rule holds does not also depend on every group's aggregator.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Object} A condition node, or a group node with shaped children.
         */
        _shapeOf: function (node) {
            if (node.kind !== 'group') {
                return {kind: 'condition'};
            }

            return {kind: 'group', children: _.map(node.children(), this._shapeOf, this)};
        },

        /**
         * Child-index path of a group, including the root group's own empty path — which findPath
         * cannot answer, since it searches BELOW the root.
         *
         * @param {Object} group Group view-model.
         * @returns {Array.<Number>|null} Path from the root, or null for an unknown group.
         */
        _pathOfGroup: function (group) {
            return group === this.rootGroup() ? [] : this.findPath(group);
        },

        /**
         * Resolves a child-index path to the group view-model it addresses.
         *
         * @param {Array.<Number>} path Path from the root group ([] for the root itself).
         * @returns {Object|null} Group view-model, or null when the path leaves the tree or lands
         *     on a condition row.
         */
        _groupAtPath: function (path) {
            var current = this.rootGroup();
            var i;

            for (i = 0; i < path.length; i++) {
                current = current.children()[path[i]];

                if (!current || current.kind !== 'group') {
                    return null;
                }
            }

            return current;
        },

        /* ---------------- (de)serialisation ---------------- */

        /**
         * Hydrates the view-model tree from the field value (expression-tree modelFromStoredValue()). A
         * stored leaf whose condition type resolves to no configured field is skipped; a group left empty by
         * such skips is kept — it is authoring state, and an empty group serialises to nothing anyway.
         *
         * @returns {void}
         */
        _loadFromValue: function () {
            this.rootGroup(this._vmFromModel(expressionTree.modelFromStoredValue(this.value(), this.combineType)));
        },

        /**
         * Builds the view-model tree for a plain model group.
         *
         * @param {Object} modelGroup Group node from the tree module.
         * @returns {Object} Group view-model.
         */
        _vmFromModel: function (modelGroup) {
            var groupVm = this._buildGroup(modelGroup.aggregator);
            var children = [];

            _.each(modelGroup.children, function (child) {
                var row;

                if (child.kind === 'group') {
                    children.push(this._vmFromModel(child));
                } else {
                    row = this._rowFromCondition(child.condition);

                    if (row) {
                        children.push(row);
                    }
                }
            }, this);

            groupVm.children(children);

            return groupVm;
        },

        /**
         * Builds a condition-row view-model from a stored leaf condition, or null when the
         * condition's type matches no configured field (expression-condition rowSeed()).
         *
         * @param {Object} cond Stored leaf condition object.
         * @returns {Object|null}
         */
        _rowFromCondition: function (cond) {
            var seed = expressionCondition.rowSeed(cond, this.fields, this.fieldsByType);

            return seed === null ? null : this._buildRow(seed.field, seed.overrides);
        },

        /**
         * Creates a condition-row view-model in the state expression-condition initialState()
         * describes, its value then shaped for the operators the row offers.
         *
         * The `kind` discriminator is a plain string, not an observable — the template dispatches
         * on it once per rendered node and a node never changes kind.
         *
         * @param {Object|null} field Field descriptor the row starts on.
         * @param {Object} [overrides] Stored state: operator, value, productAttribute,
         *     isValueProcessed, storedNumber.
         * @returns {Object}
         */
        _buildRow: function (field, overrides) {
            var state = expressionCondition.initialState(field, overrides, expressionFields.defaultFieldType(this.fields));
            var row = {
                kind: 'condition',
                id: ++rowSeq,
                fieldType: ko.observable(state.fieldType),
                operator: ko.observable(state.operator),
                // Shaped below, once the row can say which operators it offers: a picker row's
                // attribute may carry its own operator set, and its `list` flags decide the shape.
                value: ko.observable(state.value),
                productAttribute: ko.observable(state.productAttribute),
                // Whatever the loaded leaf carried in `is_value_processed`, kept verbatim so the
                // serialiser can write it back unchanged; a row the admin adds carries null. A plain
                // property, not an observable: authoring never changes it, and it is meaningless to
                // this component — the flag is an artefact of how the PHP rule framework
                // (de)serialises a condition, and re-emitting the value that came in is what keeps a
                // load → save cycle byte-identical.
                isValueProcessed: state.isValueProcessed,
                // The stored value when it arrived as a JSON number rather than a string, else null.
                // A rule saved by PHP can come back that way: the rule framework pushes the value of a
                // decimal-backed attribute through a locale number parse on load, so a `100` an editor
                // typed is re-encoded unquoted. Remembering the number lets the serialiser write back
                // the shape it read instead of re-quoting it and dirtying the form on open.
                storedNumber: state.storedNumber,
                searchText: ko.observable(''),
                // Query of whichever searchable single-select the row hosts — kept apart from
                // searchText, which belongs to the value editor. They are different questions asked
                // at the same time: searchText survives a closed dropdown because it is part of a
                // multi-value selection still being assembled, while this one is thrown away the
                // moment its list closes. Sharing one observable also made the two visible in each
                // other's input, since the pill editors bind theirs two-way.
                comboQuery: ko.observable(''),
                dropdownOpen: ko.observable(false),
                // WHICH of the row's comboboxes the open dropdown belongs to, by control name; ''
                // until one has ever been opened. A row hosts more than one combobox — the
                // Attribute picker beside a value editor that may itself be a dropdown — and they
                // share searchText, dropdownOpen and the highlight, so "open" on its own would
                // render both lists from one focus and hand each other's queries around. Only
                // meaningful while dropdownOpen is true, which is why closing deliberately leaves
                // it standing: the list Escape closed is the one ArrowDown brings back.
                dropdownControl: ko.observable(''),
                // Expansion state of the hierarchical option picker: a map of option value →
                // true for every expanded node. Per-row authoring state — it resets when the
                // dropdown closes and never touches the serialised value.
                expandedNodes: ko.observable({}),
                // Position of the keyboard-highlighted dropdown entry in the list the row
                // currently renders; -1 means nothing is highlighted and Enter belongs to the
                // typed text. Authoring state like the flags around it: never serialised, and
                // validated against the live list on every read rather than tracked through
                // every list change.
                activeOptionIndex: ko.observable(-1),
                // AJAX-suggested values for free-text product attributes (sku, name, …).
                suggestedOptions: ko.observableArray([]),
                suggestLoading: ko.observable(false),
                _suggestTimer: null,
                // True while a long pill list is shown in full. Authoring state: it never touches
                // the serialised value, and it drops back to false whenever the value shrinks to
                // a length that renders whole anyway.
                pillsExpanded: ko.observable(false),
                // Transient report of what the last paste added and skipped; '' hides it. Cleared
                // by its own timer, by the next paste, and by any wholesale value replacement.
                pasteNotice: ko.observable(''),
                _pasteTimer: null
            };

            row.value(expressionValue.normaliseValueIn(field, state.operator, state.value, this.operatorsFor(row)));

            return row;
        },

        /**
         * Creates a group view-model. Anything but 'any' reads as 'all'.
         *
         * @param {String} aggregator 'all' or 'any'.
         * @returns {Object}
         */
        _buildGroup: function (aggregator) {
            return {
                kind: 'group',
                id: ++rowSeq,
                aggregator: ko.observable(expressionTree.normaliseAggregator(aggregator)),
                children: ko.observableArray([])
            };
        },

        /**
         * Serialises the authored tree into the field value (expression-tree serialiseModel()).
         *
         * The walk reads the root observable, every group's aggregator and children and every row's
         * field/operator/value/attribute observables, which is what lets the autosave computed react to edits
         * at any depth.
         *
         * @returns {String} JSON condition tree, or '' when nothing serialises.
         */
        serialise: function () {
            return expressionTree.serialiseModel(this._modelFromVm(this.rootGroup()), this.combineType);
        },

        /**
         * Converts the view-model tree into the tree module's plain group model. Rows whose field
         * is not configured produce no condition and drop out of the serialised value.
         *
         * @param {Object} groupVm Group view-model.
         * @returns {Object} Plain group node.
         */
        _modelFromVm: function (groupVm) {
            var children = [];

            _.each(groupVm.children(), function (child) {
                var condition;

                if (child.kind === 'group') {
                    children.push(this._modelFromVm(child));
                } else {
                    condition = this._conditionFromRow(child);

                    if (condition) {
                        children.push({kind: 'condition', condition: condition});
                    }
                }
            }, this);

            return {kind: 'group', aggregator: groupVm.aggregator(), children: children};
        },

        /**
         * Serialises one condition row into a stored leaf in the frozen shape, or null when its field
         * is not configured (expression-condition toLeaf()).
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null} Leaf condition in the frozen shape, or null.
         */
        _conditionFromRow: function (row) {
            var self = this;
            var fieldType = row.fieldType();

            return expressionCondition.rowLeaf(this.fieldsByType[fieldType], fieldType, {
                operator: function () {
                    return row.operator();
                },
                value: function () {
                    return row.value();
                },
                operators: function () {
                    return self.operatorsFor(row);
                },
                attribute: function () {
                    return row.productAttribute();
                },
                storedNumber: row.storedNumber,
                isValueProcessed: row.isValueProcessed
            });
        },

        /* ---------------- Live preview ---------------- */

        /**
         * Recursive display structure of the authored rule for the structured preview, or null
         * when nothing renders — the template shows the consumer's empty-state message instead
         * (expression-preview previewGroup()).
         *
         * Presentation only: nodes carry ready-to-print token strings resolved through the row
         * label helpers, the template emits every one through a text binding, and nothing here
         * feeds the serialised value.
         *
         * @returns {Object|null} Root preview group node, or null for an empty rule.
         */
        _buildPreviewTree: function () {
            var self = this;

            return expressionPreview.previewGroup(
                this._structureModelFromVm(this.rootGroup()),
                function (row) {
                    return self._previewNodeForRow(row);
                },
                {all: $t('AND'), any: $t('OR')},
                true
            );
        },

        /**
         * Builds the preview node of one condition row: field, operator and value as
         * ready-to-print token strings, through the row's label helpers
         * (expression-preview conditionNode()).
         *
         * @param {Object} row Row view-model.
         * @returns {Object} {kind: 'condition', field, operator, value} node.
         */
        _previewNodeForRow: function (row) {
            var self = this;

            return expressionPreview.conditionNode(this.fieldsByType[row.fieldType()], {
                attributeLabel: function () {
                    return self.labelForProductAttribute(row);
                },
                operatorLabel: function () {
                    return self.labelForOperator(row);
                },
                value: function () {
                    return row.value();
                },
                pathLabel: function (value) {
                    return self.pathLabelFor(row, value);
                },
                optionLabel: function (value) {
                    return self.labelForOptionValue(row, value);
                },
                hasOptions: function () {
                    return self.productAttributeHasOptions(row);
                }
            });
        },

        /* ---------------- Validation ---------------- */

        /**
         * The rule's warnings — parts that can never match, and rows missing their supporting
         * context — each prefixed with its group's number when the rule has several groups
         * (expression-coherence ruleWarnings()). The warning texts are the consumer's.
         *
         * @returns {Array.<String>} Warning strings, empty when the rule is coherent.
         */
        _validateRule: function () {
            var self = this;

            return _.map(expressionCoherence.ruleWarnings(
                function () {
                    return self._coherenceModelFromVm(self.rootGroup());
                },
                this.fields,
                this.fieldsByType,
                this.coherence
            ), function (warning) {
                return (warning.group === null ? '' : $t('Group %1: ').replace('%1', warning.group)) + warning.text;
            });
        },

        /**
         * Builds the plain group model the coherence checks run on.
         *
         * Unlike the serialisation walk this maps EVERY row — nothing is compacted — so a node's
         * child-index path in the view-model tree addresses the same node here. Conditions carry
         * the row's field type, operator and editor value: everything the scope and contradiction
         * checks compare.
         *
         * @param {Object} groupVm Group view-model.
         * @returns {Object} Plain group node with {fieldType, operator, value} condition payloads.
         */
        _coherenceModelFromVm: function (groupVm) {
            var children = [];

            _.each(groupVm.children(), function (child) {
                if (child.kind === 'group') {
                    children.push(this._coherenceModelFromVm(child));
                } else {
                    children.push({
                        kind: 'condition',
                        condition: {
                            fieldType: child.fieldType(),
                            operator: child.operator(),
                            value: child.value()
                        }
                    });
                }
            }, this);

            return {kind: 'group', aggregator: groupVm.aggregator(), children: children};
        },

        /* ---------------- Requests ---------------- */

        /**
         * Sends one request to a consumer's endpoint and hands its decoded answer to onAnswer —
         * unless the request was aborted in the meantime, in which case nothing is handed on.
         *
         * The request starts under a key naming what it answers for, so a newer request under the
         * same key aborts this one, destroy() aborts it, and its deadline aborts it when the
         * endpoint does not answer in time (expression-requests.js). Of those, only the deadline
         * still reaches onAnswer: as a failure, so the caller shows its failure state rather than
         * loading for good. Every failure arrives the same way, as null — a refused status, a body
         * that is not JSON, a network error, the deadline — and the readers in the pure modules
         * read null as "no usable answer".
         *
         * The request is sent with the admin session's cookies and marked as an AJAX request,
         * which is what the adminhtml endpoints expect.
         *
         * @param {String} key What the request answers for: 'count', 'suggest:<row id>' or
         *     'options:<attribute code>'.
         * @param {String} url Endpoint URL, query included.
         * @param {Object} init Extra fetch options: the method and body of a POST, nothing for a GET.
         * @param {function(*): void} onAnswer Receives the decoded answer, or null on any failure.
         * @returns {Promise} Settles once the answer has been handed on or dropped.
         */
        _requestJson: function (key, url, init, onAnswer) {
            var ticket = this._requests.start(key);

            return window.fetch(url, _.extend({
                credentials: 'same-origin',
                headers: {'X-Requested-With': 'XMLHttpRequest'},
                signal: ticket.signal
            }, init))
                .then(function (response) {
                    return response.ok ? response.json() : null;
                })
                .catch(function () {
                    return null;
                })
                .then(function (data) {
                    if (ticket.settle()) {
                        onAnswer(data);
                    }
                });
        },

        /* ---------------- Match count ---------------- */

        /**
         * Keeps the match-count badge in step with the authored rule.
         *
         * Nothing is bound without a configured endpoint: a consumer that cannot count its matches
         * leaves the state at 'idle' forever, which renders no badge and issues no request. With an
         * endpoint, the computed's single read of the serialised tree IS its subscription — the same
         * recursive walk the autosave computed uses, so exactly the edits that change what would be
         * SAVED trigger a recount, and pure authoring state (search text, dropdowns, pill collapse)
         * never does. Deferred like the autosave computed, so a burst of writes inside one edit
         * collapses into one evaluation before the debounce even starts.
         *
         * The string the walk produced is handed on rather than re-serialised at request time: the
         * number the badge shows must describe the tree that was posted, not whatever the tree
         * looked like when the timer happened to fire.
         *
         * Nothing here READS a count observable, which is what keeps the computed acyclic — the
         * writes all happen through _setCount, and the response handlers run outside the
         * dependency-tracking evaluation entirely.
         *
         * @returns {void}
         */
        _bindMatchCount: function () {
            var self = this;

            if (!expressionCount.countsMatches(this.countUrl)) {
                return;
            }
            this._disposable(ko.computed(function () {
                self._scheduleCount(self.serialise());
            }).extend({deferred: true}));
        },

        /**
         * Debounces one count request for a serialised tree, and invalidates everything older.
         *
         * What the new tree asks of the badge is expression-count planCount()'s answer. Any new
         * answer retires both the pending timer and the request already in flight, so a number
         * that describes a superseded tree can neither be requested nor rendered — an empty tree
         * too, which settles on idle without asking anything.
         *
         * @param {String} serialised The serialised condition tree, '' when nothing serialises.
         * @returns {void}
         */
        _scheduleCount: function (serialised) {
            var self = this;
            var plan = expressionCount.planCount(this._countedTree, serialised);

            if (plan === null) {
                return;
            }
            this._countedTree = serialised;
            this._requests.cancel('count');

            if (this._countTimer) {
                clearTimeout(this._countTimer);
                this._countTimer = null;
            }
            this._setCount(null, false, plan.state);

            if (!plan.request) {
                return;
            }
            this._countTimer = setTimeout(function () {
                self._countTimer = null;
                self._requestCount(serialised);
            }, this.countDebounce);
        },

        /**
         * POSTs one serialised tree to the counting endpoint and routes the answer back.
         *
         * The body is form-encoded because that is what an adminhtml controller reads request
         * params from, and it is handed over as URLSearchParams so the browser sets the matching
         * content type itself — a hand-written header here could only get out of step with the
         * encoding.
         *
         * Every failure mode ends in the same place. A non-OK status, a body that is not JSON (an
         * expired session answers with an HTML login page), a rejected fetch, a request past its
         * deadline and an `{error: true}` payload all mean one thing to the badge — no count is
         * available (expression-count readAnswer()).
         *
         * @param {String} serialised The serialised condition tree to count.
         * @returns {void}
         */
        _requestCount: function (serialised) {
            var self = this;
            var body = new window.URLSearchParams();

            expressionCount.requestFields(serialised, this.countStoreId, this._formKey()).forEach(function (pair) {
                body.append(pair[0], pair[1]);
            });

            this._requestJson('count', this.countUrl, {method: 'POST', body: body}, function (data) {
                var answer = expressionCount.readAnswer(data);

                self._setCount(answer.count, answer.capped, answer.state);
            });
        },

        /**
         * Writes one count outcome — the single write path for all three observables.
         *
         * Only a current outcome ever arrives here. Responses can land in any order — a broad
         * tree's count takes longer than the narrower one the admin typed next — but every new
         * tree aborts the count request in flight before it writes its own state, and an aborted
         * request's answer is never handed on (_requestJson), so a late number can neither
         * overwrite a newer one nor turn a 'loading' badge back into a number for a rule that has
         * since changed.
         *
         * @param {Number|null} count Matches, or null when there is no number to show.
         * @param {Boolean} capped Whether the endpoint stopped counting at its cap.
         * @param {String} state 'idle', 'loading', 'ready' or 'error'.
         * @returns {void}
         */
        _setCount: function (count, capped, state) {
            this.matchCount(count);
            this.countCapped(capped);
            this.countState(state);
        },

        /**
         * The admin form key, from the global adminhtml publishes on every backend page, or '' when
         * it is unavailable. An empty key is not treated as a reason to skip the request: the
         * endpoint's own refusal is the authoritative answer, and it surfaces as the unavailable
         * badge like every other refusal.
         *
         * @returns {String}
         */
        _formKey: function () {
            return typeof window.FORM_KEY === 'string' ? window.FORM_KEY : '';
        },

        /**
         * True when the match-count badge has something to say (expression-count badgeVisible()).
         *
         * @returns {Boolean}
         */
        countBadgeVisible: function () {
            return expressionCount.badgeVisible(this.countUrl, this.countState());
        },

        /**
         * The badge's text for the current state: the transient states in the component's own
         * words, the settled count in the consumer's.
         *
         * @returns {String}
         */
        countBadgeText: function () {
            var state = this.countState();

            if (state === 'loading') {
                return $t('Counting…');
            }

            if (state === 'error') {
                return $t('Count unavailable');
            }

            if (state === 'ready') {
                return expressionCount.labelWithCount(
                    this.countLabel,
                    expressionCount.formatCount(this.matchCount(), this.countCapped())
                );
            }

            return '';
        },

        /* ---------------- Auto-save into the form's data scope ---------------- */

        /**
         * Keeps the form field in sync with the authored tree.
         *
         * The computed simply serialises: the recursive walk's reads of the root observable, every
         * group's aggregator/children and every row's field/operator/value/attribute observables
         * ARE the subscriptions — at every depth, automatically covering nodes added later, because
         * each re-run re-walks the whole tree. Row state that never affects the serialised value
         * (search text, dropdown flags, tree expansion, suggestions, dropdown highlight, pill
         * collapse, paste hints) is deliberately not read here, so it never dirties the form.
         *
         * Values rowValueError() flags are serialised all the same: the admin may be mid-typing,
         * so per-operator validation is advisory UI under the editor, never a save gate.
         *
         * @returns {void}
         */
        _bindAutoSave: function () {
            var self = this;

            this._disposable(ko.computed(function () {
                var serialised = self.serialise();

                // Only write back if it actually changed — avoids marking the form dirty on initial load.
                if (serialised !== self.value()) {
                    self.value(serialised);
                }
            }).extend({deferred: true}));
        }
    });
});
