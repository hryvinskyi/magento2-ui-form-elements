/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */
define([
    'Magento_Ui/js/form/element/abstract',
    'ko',
    'underscore',
    'mage/translate',
    'Hryvinskyi_UiFormElements/js/form/element/expression-tree',
    'Hryvinskyi_UiFormElements/js/form/element/expression-value',
    'Hryvinskyi_UiFormElements/js/form/element/expression-options'
], function (Abstract, ko, _, $t, expressionTree, expressionValue, expressionOptions) {
    'use strict';

    /**
     * Field type of the built-in attribute picker. This is the component's own vocabulary, unlike the
     * attribute codes and context values, which every consumer supplies through its config.
     */
    var PRODUCT_ATTRIBUTE_PICKER = 'product_attribute_picker';

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
     * Both rules are enforced by the unit suite, in the same test that keeps i18n/en_US.csv equal to
     * the set of phrases this module actually renders.
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
     * Keys the dropdown key pattern reserves, plus the bare modifiers.
     *
     * Everything outside this set edits the text in the input, which invalidates a highlight that
     * points into the list the PREVIOUS query produced — so any key not named here drops the
     * highlight. The modifiers are named because pressing one on its own changes no text and so
     * invalidates nothing. Membership is tested with `!== true`, never truthiness, so a key name
     * that happens to spell an Object.prototype member cannot read as reserved.
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
                var info = component.productAttributeInfo(row);

                return info && info.options ? info.options : [];
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
            this._super();

            // Every computed this element creates, kept for destroy(): a computed outlives the
            // element unless it is disposed, and one that keeps walking a tree of observables the
            // form has already discarded is both a leak and a source of writes into a dead scope.
            this._disposables = [];

            // A consumer's form-XML label is the builder's own heading. `label` itself is cleared
            // (see `defaults`) so the framework's field wrap stays suppressed either way; without
            // this the configured wording would simply never be rendered anywhere.
            this.builderLabel = typeof this.label === 'string' ? this.label : '';
            this.label = '';

            this.fields = (this.builderConfig && this.builderConfig.fields) || [];
            this.combineType = (this.builderConfig && this.builderConfig.combineType) || '';
            this.suggestUrl = (this.builderConfig && this.builderConfig.suggestUrl) || '';
            // Wording and semantic rules are consumer-supplied: what an empty rule means, and which
            // field types need a supporting context row, differ per domain. Absent config = no gating,
            // no warnings. Strings arrive already translated from the PHP config.
            this.emptyStateMessage = (this.builderConfig && this.builderConfig.emptyStateMessage) || '';
            this.coherence = (this.builderConfig && this.builderConfig.coherence) || {};
            // Match counting is opt-in per consumer: only a domain that can actually count what a
            // tree selects supplies an endpoint. No endpoint = no badge at all, nothing requested.
            // The wording around the number is the consumer's too, since only it knows what is
            // being counted and in which scope; the component owns the number's formatting and
            // the transient states.
            this.countUrl = (this.builderConfig && this.builderConfig.countUrl) || '';
            this.countLabel = (this.builderConfig && this.builderConfig.countLabel) || '';
            this.countStoreId = this._storeId(this.builderConfig && this.builderConfig.countStoreId);
            // Attribute option lists are on-demand: a descriptor says only that a list exists,
            // and this endpoint answers one attribute's list the moment that attribute is
            // actually selected. No endpoint = optioned attributes degrade to free text.
            this.optionsUrl = (this.builderConfig && this.builderConfig.optionsUrl) || '';
            // The shared operator sets attribute descriptors name via `operatorSet` instead of
            // each embedding the same operator objects. Absent map = named sets resolve to
            // nothing and those attributes fall back to their field's operator list.
            this.operatorSets = (this.builderConfig && this.builderConfig.operatorSets) || {};

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
            this.suggestMinQuery = this._configuredNumber(
                this.builderConfig && this.builderConfig.suggestMinQuery,
                this._tunable('suggestMinQuery')
            );
            // The visual tunables follow the same contract as the numbers above: junk from the
            // XML degrades to the shipped value, never to a modifier class nothing styles.
            this.joinerStyle = this._tunableChoice('joinerStyle', ['rail', 'chip', 'none']);
            this.density = this._tunableChoice('density', ['comfortable', 'compact']);
            this.showPreview = this.showPreview !== false;

            this.fieldsByType = {};
            _.each(this.fields, function (field) {
                this.fieldsByType[field.type] = field;
            }, this);

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
            // Monotonic id of the newest count request. Every write to the observables above
            // carries the id it belongs to and is dropped when a newer one exists, which is what
            // makes overlapping requests safe — see _setCount.
            this._countSeq = 0;
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
            // Pointer identity and the element holding its capture, kept only for the release —
            // plain fields, since nothing renders from them.
            this._dragPointerId = null;
            this._dragHandle = null;
            // The document-level Escape listener installed for the duration of a drag.
            this._dragEscapeHandler = null;

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
         * fires into a discarded view-model, and a drag that was in flight leaves a document-level
         * key listener and a pointer capture behind, both of which outlive every element they were
         * created for.
         *
         * Order matters. The computeds go first, so tearing the rest down cannot make one
         * re-evaluate; the drag release is last because it writes observables the disposed
         * computeds no longer watch. Every step is idempotent, which is what makes a destroy
         * without a running drag — the normal case — cost nothing.
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

        /* ---------------- numeric tunables & numeric config ---------------- */

        /**
         * Reads one of the numeric tunables off the instance, coerced and sanity-checked.
         *
         * The value arrives from `defaults` merged with whatever a form's ui_component XML set for
         * this field, so it can be anything a human typed into XML: a non-numeric string, zero, a
         * negative number. Anything but a positive finite number degrades to the class-level
         * default — the shipped value in `defaults`, which instance config cannot reach — because
         * the alternative is a NaN travelling into a slice() bound, a setTimeout delay or a
         * query-length threshold, which blanks a dropdown or stalls the type-ahead with no error
         * anywhere. The final floor only triggers if this file's own `defaults` entry is broken.
         *
         * @param {String} name Tunable's key in `defaults`.
         * @returns {Number} A positive finite number.
         */
        _tunable: function (name) {
            var shipped = (this.constructor && this.constructor.defaults) || {};

            return this._configuredNumber(this[name], this._configuredNumber(shipped[name], 1));
        },

        /**
         * Reads one of the string tunables off the instance, constrained to its known values.
         *
         * Same contract as the numeric guard above: the value can be anything a human typed into
         * a form's XML, and anything outside the allowed set degrades to the class-level default —
         * the alternative is a modifier class no stylesheet defines, which renders as whichever
         * treatment happens to be the CSS default with no error anywhere.
         *
         * @param {String} name Tunable's key in `defaults`.
         * @param {Array.<String>} allowed Values the tunable may take.
         * @returns {String} One of the allowed values.
         */
        _tunableChoice: function (name, allowed) {
            var shipped = (this.constructor && this.constructor.defaults) || {};

            return _.contains(allowed, this[name]) ? this[name] : shipped[name];
        },

        /**
         * One value coerced to a positive finite number, or the fallback when it is anything else.
         *
         * @param {*} value Candidate value, from config or XML.
         * @param {Number} fallback Value to use when the candidate is unusable.
         * @returns {Number}
         */
        _configuredNumber: function (value, fallback) {
            var number = Number(value);

            return isFinite(number) && number > 0 ? number : fallback;
        },

        /**
         * A configured store id as a non-negative integer.
         *
         * Deliberately NOT routed through the positive-number guard above: for a store id 0 is a
         * meaningful value ("not scoped to one store"), not a broken one, so it must survive
         * unchanged. Anything unusable — absent, non-numeric, negative — also reads as 0, which is
         * what a counting endpoint falls back to anyway, so the component and the endpoint agree on
         * the scope even when the config is junk.
         *
         * @param {*} value Candidate store id, from config.
         * @returns {Number} A non-negative integer.
         */
        _storeId: function (value) {
            var number = Number(value);

            return isFinite(number) && number > 0 ? Math.floor(number) : 0;
        },

        /* ---------------- nesting depth ---------------- */

        /**
         * True when a group at this nesting level may still take a child group — the template's
         * guard on the "add group" action.
         *
         * Depth counts the outermost group as 1, so a group at depth d puts its children at d + 1
         * and the answer is simply whether that still fits under the cap. The cap arrives through
         * the sanitised tunable rather than as a literal here, so the authoring button and the
         * reorder paths cannot end up disagreeing about how deep a rule may go.
         *
         * @param {Number} depth Nesting level of the group asking (1 for the outermost).
         * @returns {Boolean}
         */
        canAddGroupAt: function (depth) {
            return depth < this.maxGroupDepth;
        },

        /**
         * How many group levels a node occupies: 0 for a condition row, 1 for a group whose
         * children are all rows, and one more for each further level of nesting inside it.
         *
         * This is what makes the cap survive a MOVE. A slot's own depth only says where the moved
         * node's root would land; a group carries its subtree with it, so the level that actually
         * has to fit is the deepest one inside it — placing a node into a group at depth d puts its
         * deepest group at d + heightOf(node). A row occupies no group level at all, which is why a
         * row can always be dropped anywhere the tree already allows.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Number}
         */
        _heightOf: function (node) {
            var tallest = 0;

            if (node.kind !== 'group') {
                return 0;
            }
            _.each(node.children(), function (child) {
                var height = this._heightOf(child);

                if (height > tallest) {
                    tallest = height;
                }
            }, this);

            return tallest + 1;
        },

        /**
         * True when moving a node into one insertion slot keeps the whole tree inside the depth cap.
         *
         * A slot path is its receiving group's path plus the insertion index, so the path's LENGTH
         * is that group's depth (the root group's slots are one index long and the root is depth 1).
         *
         * Nothing here is asked about the pair of slots describing the node's CURRENT placement: the
         * slot walk locates that pair on the unfiltered list and both reorder paths start past it. So
         * a node stays movable even in a stored tree that already nests deeper than this cap — no
         * clamping happens on load, and the destinations still offered are exactly the ones that
         * bring it back inside the cap. Inside such an over-deep group the reverse holds too:
         * shuffling siblings there is refused, because every slot in it is one level too deep to
         * accept anything.
         *
         * @param {Array.<Number>} slotPath Receiving group path plus insertion index.
         * @param {Object} node Row or group view-model being moved.
         * @returns {Boolean}
         */
        _slotFits: function (slotPath, node) {
            return slotPath.length + this._heightOf(node) <= this.maxGroupDepth;
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
            var defaultField = this.fields.length > 0 ? this.fields[0] : null;
            var row = this._buildRow(defaultField);

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
            var child = this._buildGroup(group.aggregator() === 'all' ? 'any' : 'all');

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
         * Re-running _buildRow is what guarantees freshness: the id and every transient
         * observable (searchText, dropdownOpen, expandedNodes, suggest state, activeOptionIndex,
         * pillsExpanded, pasteNotice) are newly created, never shared — and the clone starts with no pending
         * paste-hint timer, so the source row's hint cannot expire onto the copy. The value is
         * deep-copied first (array slice) so pill edits on either row
         * never leak into the other. The clone serialises identically to the source: it carries
         * the same fieldType/operator/value/productAttribute and the same two retained storage
         * shapes (is_value_processed, storedNumber), which is everything _conditionFromRow reads.
         *
         * @param {Object} row Row view-model to clone.
         * @returns {Object} Fresh row view-model.
         */
        _cloneRowVm: function (row) {
            var value = row.value();

            return this._buildRow(this.fieldsByType[row.fieldType()], {
                operator: row.operator(),
                value: _.isArray(value) ? value.slice() : value,
                productAttribute: row.productAttribute(),
                isValueProcessed: row.isValueProcessed,
                storedNumber: row.storedNumber
            });
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
         * dropdown highlight) reset with them — they described the value that just went away.
         *
         * @param {Object} row Row view-model.
         * @param {String} fieldType Type of the newly selected field.
         */
        setField: function (row, fieldType) {
            row.fieldType(fieldType);
            var field = this.fieldsByType[fieldType];
            if (!field) {
                return;
            }
            var operators = field.operators || [];
            row.operator(operators.length ? operators[0].value : '==');
            row.value(this._defaultValueForField(field));
            row.productAttribute(field.attributes && field.attributes.length ? field.attributes[0].value : '');
            row.pillsExpanded(false);
            row.activeOptionIndex(-1);
            this._clearPasteNotice(row);
        },

        /**
         * Called when the Product Attribute sub-picker changes — different attributes can have
         * different operator subsets (e.g. category_ids vs SKU), so reset the operator to a value
         * that's valid for the new attribute, and clear the value/searchText to avoid carrying
         * incompatible state across. The collapsed pill list, any paste hint and the dropdown
         * highlight reset too: all three described the previous attribute's values.
         */
        setProductAttribute: function (row, attributeCode) {
            row.productAttribute(attributeCode);
            var operators = this.operatorsFor(row);
            var currentOp = row.operator();
            var stillValid = _.some(operators, function (op) { return op.value === currentOp; });
            if (!stillValid) {
                row.operator(operators.length ? operators[0].value : '==');
            }
            row.value(this.productAttributeHasOptions(row) ? [] : '');
            row.searchText('');
            this._setSuggestions(row, []);
            row.pillsExpanded(false);
            this._clearPasteNotice(row);
        },

        operatorsFor: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            var attrInfo;
            var named;
            if (!field) {
                return [];
            }
            // For Product Attribute rows the selected attribute can override the operator list —
            // explicitly, with an `operators` array pinned on the descriptor, or by NAMING one of
            // the shared sets the config published once (`operatorSet`), e.g. category_ids →
            // membership only; boolean → is / is-not. Own-property tested so a set name that
            // spells an Object.prototype member cannot resolve to one.
            if (field.type === PRODUCT_ATTRIBUTE_PICKER) {
                attrInfo = this.productAttributeInfo(row);
                if (attrInfo && _.isArray(attrInfo.operators) && attrInfo.operators.length) {
                    return attrInfo.operators;
                }
                named = attrInfo && typeof attrInfo.operatorSet === 'string'
                    && Object.prototype.hasOwnProperty.call(this.operatorSets, attrInfo.operatorSet)
                    ? this.operatorSets[attrInfo.operatorSet]
                    : null;
                if (_.isArray(named) && named.length) {
                    return named;
                }
            }
            return field.operators || [];
        },

        /**
         * Returns the list of selectable Field types for a given row's dropdown.
         *
         * Restriction is evaluated against the row's conjunctive scope: the conditions guaranteed
         * to hold whenever the row is relevant — its AND-siblings, the other children of AND
         * ancestors and the closure of nested AND-subgroups. A field with a coherence requirement
         * (looked up by its type or its attribute) is selectable only when that scope contains a
         * context condition targeting one of the requirement's contexts, so OR-joined branches
         * never borrow each other's context rows. Which fields depend on which context values is
         * consumer config.
         *
         * The currently-selected field is always kept visible so existing rows stay editable.
         */
        availableFieldsFor: function (row) {
            var requirements = this.coherence.requirements || {};
            var self = this;
            var path = this.findPath(row);
            var scope = path
                ? expressionTree.conjunctiveScope(this._coherenceModelFromVm(this.rootGroup()), path)
                : null;

            return _.filter(this.fields, function (field) {
                var requirement = requirements[field.type] || requirements[field.attribute];

                if (!requirement) {
                    return true;
                }

                if (row.fieldType() === field.type) {
                    return true;
                }

                if (!scope) {
                    return false;
                }

                return self._scopeSatisfies(scope, requirement.contexts || []);
            });
        },

        /**
         * True when the scope contains a context condition targeting one of the given values —
         * `context == value` or `context is one of {…, value, …}`.
         *
         * @param {Array.<Object>} scope Condition nodes from the tree module's conjunctiveScope().
         * @param {Array.<String>} contextValues Accepted context values.
         * @returns {Boolean}
         */
        _scopeSatisfies: function (scope, contextValues) {
            var contextFieldType = this._contextFieldType();
            var targets = {};

            if (!contextFieldType) {
                return false;
            }
            _.each(contextValues, function (v) { targets[v] = true; });

            return _.some(scope, function (node) {
                var condition = node.condition;

                if (condition.fieldType !== contextFieldType) {
                    return false;
                }

                if (condition.operator === '==') {
                    return !!targets[String(condition.value)];
                }

                if (condition.operator === '()') {
                    return _.some(expressionValue.asArray(condition.value), function (v) {
                        return !!targets[String(v)];
                    });
                }

                return false;
            });
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

        valueTypeFor: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            return field ? field.valueType : 'text';
        },

        valueOptionsFor: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            return field ? (field.options || []) : [];
        },

        attributesFor: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            return field ? (field.attributes || []) : [];
        },

        /**
         * Returns the descriptor for the currently-selected product attribute on a Product Attribute
         * row, or null. The descriptor contains the EAV input type and (for select/multiselect/boolean
         * attributes) a predefined option list — drives the autocomplete on the value editor.
         */
        productAttributeInfo: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            if (!field || field.type !== PRODUCT_ATTRIBUTE_PICKER) {
                return null;
            }
            var code = row.productAttribute();
            return _.findWhere(field.attributes || [], {value: code}) || null;
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
         */
        productAttributeHasOptions: function (row) {
            var info = this.productAttributeInfo(row);

            this.attributeOptionsVersion();
            this._ensureAttributeOptions(info);

            return !!(info && info.options && info.options.length);
        },

        /**
         * True while the row's attribute is optioned but its list has not arrived yet — the render
         * condition of the loading placeholder, and the guard that keeps the option-less fallback
         * editors from flashing for the length of one round-trip.
         *
         * False without an endpoint (nothing will ever arrive) and false after a failed fetch
         * (nothing more will): both degrade the row to the fallback editors instead of pinning it
         * to a placeholder no response will release.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        attributeOptionsPending: function (row) {
            var info = this.productAttributeInfo(row);

            this.attributeOptionsVersion();
            this._ensureAttributeOptions(info);

            if (!info || !info.hasOptions || info.options || this.optionsUrl === '') {
                return false;
            }

            return this._optionErrors[String(info.value)] !== true;
        },

        /**
         * Starts the one fetch for an attribute descriptor whose option list is declared but not
         * yet loaded. Guarded three ways: a descriptor with inline or already-loaded options needs
         * nothing, a code already in flight is not asked twice, and a code that already failed is
         * not retried — a broken endpoint must cost one request, not one per render.
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
            var code;
            var sep;

            if (!info || info.options || !info.hasOptions || this.optionsUrl === '') {
                return;
            }
            code = String(info.value);

            if (this._optionRequests[code] === true || this._optionErrors[code] === true) {
                return;
            }
            this._optionRequests[code] = true;
            sep = this.optionsUrl.indexOf('?') === -1 ? '?' : '&';

            window.fetch(this.optionsUrl + sep + 'attribute=' + encodeURIComponent(code), {
                credentials: 'same-origin',
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (data && _.isArray(data.options)) {
                        info.options = data.options;
                    } else {
                        self._optionErrors[code] = true;
                    }
                })
                .catch(function () { self._optionErrors[code] = true; })
                .then(function () {
                    delete self._optionRequests[code];
                    self.attributeOptionsVersion(self.attributeOptionsVersion() + 1);
                });
        },

        /**
         * Returns the option list for the row's product attribute, plus filtering by row.searchText.
         * Mirrors filteredOptionsFor() — same {items, capped} contract, same cap — but reads from
         * the per-attribute options instead of field.options.
         *
         * @param {Object} row Row view-model.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredProductAttributeOptions: function (row) {
            var info = this.productAttributeInfo(row);
            if (!info || !info.options) return {items: [], capped: false};

            var search = (row.searchText() || '').toLowerCase().trim();
            var multi = this.rowUsesListOperator(row);
            var selected = multi ? expressionValue.asArray(row.value()) : [];
            var selectedSet = {};
            var found;
            _.each(selected, function (v) { selectedSet[String(v)] = true; });

            // Hierarchical attribute options (the category picker) search by breadcrumb path,
            // exactly like the dedicated hierarchical fields.
            if (search && this.treeModeFor(row)) {
                found = expressionOptions.pathSearch(this._treeIndexFor(row), search, this.optionMatchCap);

                return {
                    items: _.filter(found.items, function (opt) {
                        return !(multi && selectedSet[String(opt.value)]);
                    }),
                    capped: found.capped
                };
            }

            var matches = _.filter(info.options, function (opt) {
                if (multi && selectedSet[String(opt.value)]) return false;
                if (!search) return true;
                return String(opt.label).toLowerCase().indexOf(search) !== -1;
            });

            return {items: matches.slice(0, this.optionMatchCap), capped: matches.length > this.optionMatchCap};
        },

        /**
         * Selected option objects for a Product Attribute row using the `()` / `!()` operator.
         */
        selectedProductAttributeOptions: function (row) {
            var info = this.productAttributeInfo(row);
            if (!info || !info.options) return [];
            var selected = expressionValue.asArray(row.value());
            var selectedSet = {};
            _.each(selected, function (v) { selectedSet[String(v)] = true; });
            return _.filter(info.options, function (opt) {
                return selectedSet[String(opt.value)];
            });
        },

        /**
         * True for Product Attribute rows whose attribute (e.g. `sku`, `name`) is in the AJAX-suggest
         * whitelist on the backend — drives the type-ahead suggestion dropdown.
         */
        productAttributeSupportsSuggest: function (row) {
            var info = this.productAttributeInfo(row);
            return !!(info && info.suggest);
        },

        /**
         * Name of the row's scalar value type, or null when the row is not in a scalar context:
         * a multi-valued operator, or an attribute with a predefined option list — those keep
         * their pickers. Product Attribute rows resolve their selected attribute's descriptor;
         * every other row resolves its field descriptor, where an explicit `scalarType` key
         * selects the default advisory validator (the editor itself stays the field's
         * valueType editor). The value module's resolution handles unknown descriptors — they
         * read as plain text, never as a blank editor.
         *
         * @param {Object} row Row view-model.
         * @returns {String|null} Value-type name, or null outside scalar contexts.
         */
        scalarTypeNameFor: function (row) {
            var field;

            if (this.productAttributeHasOptions(row) || this.rowUsesListOperator(row)) {
                return null;
            }
            field = this.fieldsByType[row.fieldType()];

            if (field && field.valueType === 'product-attribute') {
                return expressionValue.scalarTypeFor(this.productAttributeInfo(row));
            }

            return expressionValue.scalarTypeFor(field || null);
        },

        /**
         * True when the row's value area renders the generic scalar editor — one branch for every
         * scalar type, native input attributes supplied by the type's registry entry. Plain text
         * counts as a scalar type: for it the generic editor IS the free-text input. The one
         * yield: a text-typed attribute whose backend supports suggestions keeps the type-ahead
         * editor instead — only typed scalars (number, date, …) take precedence over suggestions.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesScalarEditor: function (row) {
            var name = this.scalarTypeNameFor(row);

            // A row whose option list is still on its way renders the loading placeholder, not a
            // scalar editor the arriving list would immediately replace.
            if (name === null || this.attributeOptionsPending(row)) {
                return false;
            }

            return name !== 'text' || !this.productAttributeSupportsSuggest(row);
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
            var name = this.scalarTypeNameFor(row) || 'text';
            var attrs = {
                'class': name === 'text' ? 'ufe-expr__input' : 'ufe-expr__input ufe-expr__input--typed',
                'aria-label': this.valueEditorLabel()
            };

            if (name === 'text') {
                attrs.placeholder = this.valuePlaceholder();
            }

            return _.extend(attrs, expressionValue.valueTypeDef(name).attrs);
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
            var def = expressionValue.valueTypeDef(this.scalarTypeNameFor(row));
            var raw = row.value();

            if (def.editValue) {
                return def.editValue(raw);
            }

            return raw === null || raw === undefined ? '' : String(raw);
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
            var def = expressionValue.valueTypeDef(this.scalarTypeNameFor(row));
            var input = event && event.target ? event.target.value : '';

            row.value(def.commitValue ? def.commitValue(input) : input);
        },

        /**
         * Advisory validation message for the row's current value, or '' when the value passes or
         * nothing validates it.
         *
         * Validator resolution: the selected operator's descriptor entry may carry a `validate`
         * key naming one of the registered validators; an operator naming none falls back to the
         * row's scalar value type's default `validator` (integer, float and email carry one —
         * text, date and time do not), and rows outside a scalar context validate only through an
         * operator's explicit key. Format validators pass blank input by design — presence is
         * `not-empty`'s job — so a pristine row shows nothing until non-blank input arrives. An
         * operator naming an unregistered validator validates nothing and shows no error — stale
         * consumer configs degrade silently instead of breaking the editor.
         *
         * Message resolution on failure: the operator entry's pre-translated `validateMessage`
         * wins; else the component's built-in per-validator message; else the generic fallback.
         *
         * Advisory is the load-bearing word: the autosave computed still serialises invalid
         * values — the admin may be mid-typing — so this only renders a hint under the value
         * editor and never gates the save. Plain method, computed-friendly: it reads the row's
         * observables, so any binding evaluating it re-renders on edits.
         *
         * A row that no validator faults but whose value is still EMPTY answers with the built-in
         * completion nudge instead of '' — see _emptyValueHint. A consumer wiring `not-empty`
         * still outranks it: an empty value fails that validator before the nudge is consulted.
         *
         * @param {Object} row Row view-model.
         * @returns {String} Error text, or ''.
         */
        rowValueError: function (row) {
            var entry = _.findWhere(this.operatorsFor(row), {value: row.operator()});
            var name = entry && entry.validate ? entry.validate : null;
            var typeName;
            var predicate;

            if (!name) {
                typeName = this.scalarTypeNameFor(row);
                name = typeName === null ? null : expressionValue.valueTypeDef(typeName).validator || null;
            }
            predicate = name ? expressionValue.validators[name] : null;

            if (!predicate || predicate(row.value())) {
                return this._emptyValueHint(row);
            }

            if (entry && entry.validateMessage) {
                return entry.validateMessage;
            }

            return VALIDATOR_MESSAGES[name] || $t('Invalid value');
        },

        /**
         * The built-in nudge under a value editor with nothing in it, or '' once a value exists.
         *
         * Not a validator and not a gate: an empty row still serialises like any other — what an
         * empty condition means is the consuming rule engine's question — but a just-added row
         * otherwise looks finished while it matches nothing the admin intended yet. Shaped by the
         * editor: list-valued editors take several values, everything else takes one.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        _emptyValueHint: function (row) {
            if (!this._rowValueIsEmpty(row)) {
                return '';
            }

            return this.rowUsesListOperator(row) || this.valueTypeFor(row) === 'multiselect'
                ? $t('Pick at least one value to complete this condition.')
                : $t('Enter a value to complete this condition.');
        },

        /**
         * True when the row's stored value is empty: an empty list, or blank text.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        _rowValueIsEmpty: function (row) {
            var value = row.value();

            if (_.isArray(value)) {
                return value.length === 0;
            }

            return value === null || value === undefined || String(value).trim() === '';
        },

        /**
         * Public wrapper around the tree module's asArray so templates can read the multi-value
         * pill list off row.value().
         */
        valueAsArray: function (row) {
            return expressionValue.asArray(row.value());
        },

        /**
         * Debounced AJAX request to the suggest endpoint. The `query` arg is what the user typed; for
         * single-value rows that's row.value(), for multi-value rows it's row.searchText(). The idle
         * time is the configured suggest debounce.
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

        _fetchSuggestions: function (row, query) {
            var self = this;
            var info = this.productAttributeInfo(row);
            if (!info || !info.suggest) {
                this._setSuggestions(row, []);
                return;
            }
            var q = String(query == null ? '' : query).trim();
            if (q.length < this.suggestMinQuery) {
                this._setSuggestions(row, []);
                return;
            }

            var url = this.suggestUrl;
            if (!url) {
                this._setSuggestions(row, []);
                return;
            }
            var sep = url.indexOf('?') === -1 ? '?' : '&';
            var fullUrl = url + sep
                + 'attribute=' + encodeURIComponent(row.productAttribute())
                + '&q=' + encodeURIComponent(q);

            row.suggestLoading(true);
            window.fetch(fullUrl, {
                credentials: 'same-origin',
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
                .then(function (r) { return r.ok ? r.json() : {items: []}; })
                .then(function (data) { self._setSuggestions(row, data && data.items ? data.items : []); })
                .catch(function () { self._setSuggestions(row, []); })
                .then(function () { row.suggestLoading(false); });
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
         * "no matches" verdict. Without this gate an open dropdown with nothing in it would render
         * as an empty bordered box hanging under the input — which is exactly what a short query
         * (below the request threshold) produces, since nothing was ever requested for it.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for — the row's value on a
         *     single-value editor, its search text on a multi-value one.
         * @returns {Boolean}
         */
        suggestDropdownVisible: function (row, query) {
            return row.dropdownOpen()
                && (row.suggestLoading() || row.suggestedOptions().length > 0 || this.suggestNoMatches(row, query));
        },

        /**
         * True when the suggest endpoint has answered a real query with nothing.
         *
         * All three conditions are load-bearing: while a request is in flight the answer is not in
         * yet, previous results still on screen are not "no matches", and a query below the request
         * threshold was never asked at all — reporting "no matches" for any of those would state
         * something the component does not know.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for.
         * @returns {Boolean}
         */
        suggestNoMatches: function (row, query) {
            var q = String(query === null || query === undefined ? '' : query).trim();

            return !row.suggestLoading()
                && row.suggestedOptions().length === 0
                && q.length >= this.suggestMinQuery;
        },

        /**
         * Commits the current free-text input as a multi-value pill (Enter key or blur fallback).
         */
        commitFreeTextValue: function (row) {
            var text = String(row.searchText() || '').trim();
            if (text === '') return;
            this.addOption(row, text);
        },

        placeholderFor: function (row) {
            var field = this.fieldsByType[row.fieldType()];
            return field && field.placeholder ? field.placeholder : '';
        },

        /**
         * The unit the row's value is entered in — rendered beside the editor so a bare number
         * says what it counts. On a Product Attribute row the selected attribute's descriptor
         * answers (only the attribute knows whether its number is a price or a weight); every
         * other row reads its field descriptor's `unit`. '' when neither declares one, which is
         * also the render condition — no unit, no element.
         *
         * The text arrives from the consumer's PHP (a currency code, a weight unit) and is bound
         * as it came: codes are not translated.
         *
         * @param {Object} row Row view-model.
         * @returns {String}
         */
        rowUnit: function (row) {
            var descriptor = this.fieldsByType[row.fieldType()];

            if (!descriptor) {
                return '';
            }

            if (this.valueTypeFor(row) === 'product-attribute') {
                descriptor = this.productAttributeInfo(row);
            }

            return descriptor && descriptor.unit ? String(descriptor.unit) : '';
        },

        /**
         * Multi-value autocomplete helpers (selected pills + filtered dropdown).
         */
        selectedOptionsFor: function (row) {
            var allOptions = this.valueOptionsFor(row);
            var selected = expressionValue.asArray(row.value());
            var selectedSet = {};
            _.each(selected, function (v) { selectedSet[String(v)] = true; });
            return _.filter(allOptions, function (opt) {
                return selectedSet[String(opt.value)];
            });
        },

        /**
         * The row's selectable options, filtered by row.searchText and capped, plus whether the
         * cap truncated the result — the dropdown appends its "keep typing" hint off that flag.
         *
         * `capped` means the search STOPPED at the cap, not that a known number of matches is
         * hidden: in the breadcrumb-search branch the cap applies to the walk, before
         * already-selected values are dropped from the offer, so the returned list can be shorter
         * than the cap while the search was still truncated. optionCapHint() is worded to stay
         * true under both branches.
         *
         * @param {Object} row Row view-model.
         * @returns {{items: Array.<Object>, capped: Boolean}}
         */
        filteredOptionsFor: function (row) {
            var allOptions = this.valueOptionsFor(row);
            var searchText = (row.searchText() || '').toLowerCase().trim();
            var selected = expressionValue.asArray(row.value());
            var selectedSet = {};
            var found;
            _.each(selected, function (v) { selectedSet[String(v)] = true; });

            // Hierarchical option lists search by breadcrumb path, so an ambiguous leaf name
            // ("Internal Hard Drives" exists under several parents) narrows by naming ancestors.
            if (searchText && this.treeModeFor(row)) {
                found = expressionOptions.pathSearch(this._treeIndexFor(row), searchText, this.optionMatchCap);

                return {
                    items: _.filter(found.items, function (opt) {
                        return !selectedSet[String(opt.value)];
                    }),
                    capped: found.capped
                };
            }

            var matches = _.filter(allOptions, function (opt) {
                if (selectedSet[String(opt.value)]) return false;
                if (!searchText) return true;
                return String(opt.label).toLowerCase().indexOf(searchText) !== -1;
            });

            return {items: matches.slice(0, this.optionMatchCap), capped: matches.length > this.optionMatchCap};
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
         * searchable combobox takes over. Read through the sanitised tunable, so a form's XML can
         * retune the threshold without touching this file.
         *
         * @param {Array} options Option list.
         * @returns {Boolean}
         */
        optionListIsLarge: function (options) {
            return (_.isArray(options) ? options.length : 0) > this.searchableSelectThreshold;
        },

        /**
         * True when the row's value is one option out of a `select` field's list — the case a
         * `<select>` covers, as opposed to the membership operators, which take several.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        _rowPicksOneOption: function (row) {
            return this.valueTypeFor(row) === 'select' && !this.rowUsesListOperator(row);
        },

        /**
         * True when the row's value editor is the plain `<select>`: one option out of a list short
         * enough to scan. The plain control is the better one wherever it still works — one keystroke
         * opens it and the browser owns its keyboard behaviour — so it stays the default and the
         * combobox is what a long list escalates to.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesPlainValueSelect: function (row) {
            return this._rowPicksOneOption(row) && !this.optionListIsLarge(this.valueOptionsFor(row));
        },

        /**
         * True when the row's value editor is the searchable combobox: one option out of a list too
         * long to scan.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSearchableValueSelect: function (row) {
            return this._rowPicksOneOption(row) && this.optionListIsLarge(this.valueOptionsFor(row));
        },

        /**
         * True when the row's value is one option out of an optioned attribute's list — the
         * picker-side counterpart of _rowPicksOneOption, over the SELECTED ATTRIBUTE's options
         * rather than a field's.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        _rowPicksOneAttributeOption: function (row) {
            return this.valueTypeFor(row) === 'product-attribute'
                && this.productAttributeHasOptions(row)
                && !this.rowUsesListOperator(row);
        },

        /**
         * True when an optioned attribute's single-value editor is the plain `<select>`: the same
         * threshold rule a select field's value follows, judged per selected attribute — a
         * three-option colour keeps the native control while a brand list escalates.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesPlainAttributeValueSelect: function (row) {
            return this._rowPicksOneAttributeOption(row)
                && !this.optionListIsLarge(this.productAttributeInfo(row).options);
        },

        /**
         * True when an optioned attribute's single-value editor is the searchable combobox: one
         * option out of a list too long to scan.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSearchableAttributeValueSelect: function (row) {
            return this._rowPicksOneAttributeOption(row)
                && this.optionListIsLarge(this.productAttributeInfo(row).options);
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
            selected = String(definition.selected(this, row));

            return _.find(this.searchableSelectOptions(row, control), function (option) {
                return String(option.value) === selected;
            }) || null;
        },

        /**
         * What the control's input SHOWS: the chosen option's label while the list is closed, the
         * query while it is open.
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
            var definition = searchableSelect(control);
            var option;
            var selected;

            if (definition === null) {
                return '';
            }

            if (row.dropdownOpen() && row.dropdownControl() === control) {
                return String(row.comboQuery() || '');
            }
            option = this.searchableSelectedOption(row, control);

            if (option !== null) {
                return this.displayLabel(option.label);
            }
            selected = definition.selected(this, row);

            return selected === null || selected === undefined ? '' : String(selected);
        },

        /**
         * The chosen option's CODE, as the closed control's secondary text — and '' while the list is
         * open, where the query owns the input and every entry carries its own code.
         *
         * This is the whole point of the control on a list whose labels repeat: four attributes
         * labelled the same are told apart by their code and by nothing else, so the code is part of
         * what the closed control has to say rather than something the admin opens the list to check.
         * A code equal to its own label adds nothing and is left out — many option lists are keyed by
         * the label itself.
         *
         * The element holding it is rendered even when this is '' (see the markup), so the input's
         * description reference never points at nothing.
         *
         * @param {Object} row Row view-model.
         * @param {String} control Control name of the searchable select.
         * @returns {String}
         */
        searchableSelectCode: function (row, control) {
            var option;

            if (row.dropdownOpen() && row.dropdownControl() === control) {
                return '';
            }
            option = this.searchableSelectedOption(row, control);

            return option === null ? '' : this.optionCode(option);
        },

        /**
         * One dropdown entry's code, as its muted second line — '' when the code is the label, which
         * would print the same words twice.
         *
         * @param {Object} option Option object from a searchable select's list.
         * @returns {String}
         */
        optionCode: function (option) {
            var code = option.value === null || option.value === undefined ? '' : String(option.value);

            return code === String(option.label === null || option.label === undefined ? '' : option.label)
                ? ''
                : code;
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
         * focus guard alone (one guard per list, pinned by the unit suite).
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
         * `level` key. Detected on the first entry: the option providers annotate all entries or
         * none. Flat lists (no `level`) keep the plain filtered-list behaviour everywhere.
         *
         * The active list is the one the row's value editor renders: the field's own options,
         * or the selected product attribute's options on a Product Attribute row.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        treeModeFor: function (row) {
            var host = this._activeOptionsHostFor(row);
            var options = host && host.options || [];

            return options.length > 0 && options[0].level !== undefined;
        },

        /**
         * True when the row's dropdown renders the collapsible tree: hierarchy-annotated options
         * and no search text. Typing switches the dropdown to the flat filtered list (with
         * breadcrumb labels); clearing the search returns to the tree.
         *
         * A dropdown belonging to a searchable single-select is never the tree, whatever the row's
         * VALUE options look like. Without that the Attribute control of a row whose value editor is
         * a category tree would inherit the tree's whole key pattern — Space would toggle a category
         * instead of the highlighted attribute — because both controls share the row's dropdown
         * state.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowShowsTree: function (row) {
            return searchableSelect(row.dropdownControl()) === null
                && this.treeModeFor(row)
                && (row.searchText() || '').trim() === '';
        },

        /**
         * Flattens the row's option tree into the list of currently-visible nodes, depth-first:
         * top-level nodes always, a node's children only while the node is expanded. Each entry
         * wraps one option with the presentation state the template renders directly:
         * {value, label, level, indent, hasChildren, expanded, selected, mixed, selectedInside,
         * descendants}.
         *
         * Selected options stay visible and stay clickable — the row toggles both ways, and hiding
         * a selected node would break the tree shape for its descendants anyway. Reads the row's
         * expandedNodes and value observables, so any binding evaluating this re-renders on
         * expansion and on selection.
         *
         * `mixed` is the checkbox's third state: the node itself is not selected, but at least one
         * entry below it is. It comes from ONE upward pass over the stored value (see
         * _selectedAncestorCounts) rather than from a downward walk per node, so the whole render
         * costs the number of selected values times the tree depth — nothing here scales with the
         * option count, which on this kind of list is the only cost that would matter.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>}
         */
        visibleTreeNodes: function (row) {
            var index;
            var expanded;
            var selected;
            var selectedSet = Object.create(null);
            var insideCounts;
            var nodes = [];
            var visit;

            if (!this.treeModeFor(row)) {
                return nodes;
            }
            index = this._treeIndexFor(row);
            expanded = row.expandedNodes();
            selected = expressionValue.asArray(row.value());
            _.each(selected, function (v) { selectedSet[String(v)] = true; });
            insideCounts = this._selectedAncestorCounts(index, selected);

            visit = function (option) {
                var key = String(option.value);
                var children = index.childrenByParent[key] || [];
                var isExpanded = !!expanded[key];
                var isSelected = selectedSet[key] === true;
                var inside = insideCounts[key] || 0;

                nodes.push({
                    value: option.value,
                    label: option.label,
                    level: option.level,
                    // Level 1 is a root, sitting almost flush with the list edge; each further
                    // level steps in by one caret width. Written as the row's padding so the
                    // selection edge and hover wash still span the full row.
                    indent: (Math.max((Number(option.level) || 1) - 1, 0) * 17 + 5) + 'px',
                    hasChildren: children.length > 0,
                    expanded: isExpanded,
                    selected: isSelected,
                    // A selected node reads as selected, never as partial: its own state is the
                    // definite one, whatever sits underneath it.
                    mixed: !isSelected && inside > 0,
                    selectedInside: inside,
                    descendants: index.descendantCountByValue[key] || 0
                });

                if (isExpanded) {
                    _.each(children, visit);
                }
            };
            _.each(index.roots, visit);

            return nodes;
        },

        /**
         * How many of the row's selected values sit strictly BELOW each node, keyed by node value —
         * the basis of the checkbox's indeterminate state.
         *
         * Derived by climbing from every selected value to its root and crediting each ancestor
         * once, which is the cheap direction: the answer for the whole tree costs (selected values
         * × depth) map writes, while asking each rendered node "is anything of mine selected?"
         * would walk its subtree — the whole option list once per top-level node. Nodes with
         * nothing selected below them are simply absent from the result.
         *
         * The per-value `seen` map is what makes a malformed parent cycle terminate: a chain that
         * comes back around stops at the first repeat, so an ancestor is credited at most once per
         * selected value either way.
         *
         * @param {Object} index Option index from the options module.
         * @param {Array} selected The row's stored values.
         * @returns {Object.<String, Number>} Node value → number of selected values below it.
         */
        _selectedAncestorCounts: function (index, selected) {
            var counts = Object.create(null);
            var i;
            var seen;
            var option;
            var key;

            for (i = 0; i < selected.length; i++) {
                option = index.byValue[String(selected[i])];
                seen = Object.create(null);

                while (option !== undefined) {
                    key = option.parent === null || option.parent === undefined ? '' : String(option.parent);

                    if (key === '' || seen[key] === true) {
                        break;
                    }
                    seen[key] = true;
                    counts[key] = (counts[key] || 0) + 1;
                    option = index.byValue[key];
                }
            }

            return counts;
        },

        /**
         * Expands or collapses one tree node's direct children. Writes a fresh map so every
         * binding reading expandedNodes re-evaluates.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value of the node to toggle.
         */
        toggleNode: function (row, value) {
            var key = String(value);
            var next = _.extend({}, row.expandedNodes());

            if (next[key]) {
                delete next[key];
            } else {
                next[key] = true;
            }
            row.expandedNodes(next);
        },

        /**
         * Number of options behind the row's tree — the size the expand-all guard is measured
         * against. Read off the option list rather than off the index, so it costs nothing and is
         * available before the index has ever been built.
         *
         * @param {Object} row Row view-model.
         * @returns {Number}
         */
        _treeOptionCount: function (row) {
            var host = this._activeOptionsHostFor(row);

            return host && host.options ? host.options.length : 0;
        },

        /**
         * True when the row's tree is small enough to be expanded in one action — the template's
         * guard on the expand-all control.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        canExpandAllTreeNodes: function (row) {
            return this.rowShowsTree(row) && this._treeOptionCount(row) <= this.treeExpandAllLimit;
        },

        /**
         * Expands every branch of the row's tree in ONE write.
         *
         * The expanded set is exactly the index's parent keys, so nothing walks the tree and no
         * node is visited twice. Re-checks the size guard rather than trusting the caller: the
         * control that offers this is conditional, and a path that ever calls it anyway must not be
         * the one that hangs the form.
         *
         * @param {Object} row Row view-model.
         * @returns {void}
         */
        expandAllTreeNodes: function (row) {
            var expanded = {};

            if (!this.canExpandAllTreeNodes(row)) {
                return;
            }
            _.each(_.keys(this._treeIndexFor(row).childrenByParent), function (key) {
                expanded[key] = true;
            });
            row.expandedNodes(expanded);
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
         * Breadcrumb path label for one option value — ancestors joined down to the option's own
         * label, from the row's cached option index. Falls back to the option's own label when no
         * breadcrumb exists (flat lists index to their own labels, so the fallback is uniform),
         * and to the raw value when the option is unknown. Renders as the pill tooltip and as the
         * option text of the searched dropdown.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value.
         * @returns {String}
         */
        pathLabelFor: function (row, value) {
            var index = this._treeIndexFor(row);
            var key = String(value);

            if (index) {
                if (index.pathByValue[key] !== undefined) {
                    return index.pathByValue[key];
                }

                if (index.byValue[key] !== undefined) {
                    return String(index.byValue[key].label);
                }
            }

            return key;
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
            var field = this.fieldsByType[row.fieldType()];

            if (!field) {
                return null;
            }

            if (field.valueType === 'product-attribute') {
                return this.productAttributeInfo(row);
            }

            return field;
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
         * Appends values to a row's list value in ONE observable write.
         *
         * The single write is what makes a several-hundred-entry paste usable: writing per entry
         * would re-render the growing pill list once per value and re-run the autosave walk with
         * it. De-duplication is folded into the same pass — against the values already stored AND
         * against earlier entries of this batch — so a pasted list with repeats behaves exactly
         * like clicking the same option twice. Values are stored as strings, matching what the
         * option pickers write.
         *
         * @param {Object} row Row view-model.
         * @param {Array} values Values to append, in order.
         * @returns {Number} How many were actually added — the caller's basis for reporting what a
         *     paste did, since de-duplication can silently swallow entries.
         */
        _appendValues: function (row, values) {
            var current = expressionValue.asArray(row.value());
            // Null prototype: a value that happens to spell an Object.prototype member (a SKU
            // named `constructor`, say) must not read as already seen and vanish.
            var seen = Object.create(null);
            var added = 0;

            _.each(current, function (v) { seen[String(v)] = true; });
            _.each(values, function (v) {
                var sv = String(v);

                if (seen[sv]) {
                    return;
                }
                seen[sv] = true;
                current.push(sv);
                added++;
            });

            if (added > 0) {
                row.value(current);
            }
            row.searchText('');

            return added;
        },

        /**
         * Removes one value from a row's list value. A list that shrinks back to the collapse
         * limit un-collapses, so the toggle never lingers over a list short enough to show whole.
         *
         * @param {Object} row Row view-model.
         * @param {*} optionValue Value to remove.
         */
        removeOption: function (row, optionValue) {
            var current = expressionValue.asArray(row.value());
            var sv = String(optionValue);

            row.value(_.filter(current, function (v) { return String(v) !== sv; }));
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
         * True when a row's clear-all control is worth offering — two or more stored values.
         *
         * Counted on the STORED value rather than on the rendered pills: a stored value that
         * matches no option renders no pill, and clearing is precisely how an admin gets rid of
         * such a leftover.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        canClearAll: function (row) {
            return expressionValue.asArray(row.value()).length >= 2;
        },

        /**
         * The pills a multi-value editor actually renders: all of them while expanded or while the
         * list is short enough to show whole, the first `pillCollapseLimit` otherwise.
         *
         * Shape-agnostic on purpose — it only slices — so the same helper serves the option-backed
         * editors (which pass option objects) and the free-text one (which passes raw values).
         *
         * @param {Object} row Row view-model.
         * @param {Array} allPills Every pill the editor would render, in order.
         * @returns {Array} The subset to render.
         */
        visiblePills: function (row, allPills) {
            var pills = _.isArray(allPills) ? allPills : [];

            if (row.pillsExpanded() || pills.length <= this.pillCollapseLimit) {
                return pills;
            }

            return pills.slice(0, this.pillCollapseLimit);
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
            var total = _.isArray(allPills) ? allPills.length : 0;

            if (total <= this.pillCollapseLimit) {
                return '';
            }

            return row.pillsExpanded()
                ? $t('Show fewer')
                : $t('+%1 more').replace('%1', total - this.pillCollapseLimit);
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
         * Drops the expanded flag once a row's value fits the collapse limit again, so a list that
         * later grows past the limit starts collapsed instead of inheriting an expansion the admin
         * asked for on a different set of values.
         *
         * @param {Object} row Row view-model.
         */
        _syncPillCollapse: function (row) {
            if (row.pillsExpanded() && expressionValue.asArray(row.value()).length <= this.pillCollapseLimit) {
                row.pillsExpanded(false);
            }
        },

        /**
         * Turns a paste of separator-joined text into pills — the workflow a rule built from a
         * spreadsheet column lives on.
         *
         * Text with no separator is not a list: the handler declines it and the browser pastes it
         * into the search input as usual, leaving the type-ahead flow untouched. Text WITH a
         * separator is split into trimmed entries and appended in one write:
         *  - `mode` 'options' resolves every entry against the row's own option list — an option's
         *    value verbatim, or its label matched case-insensitively (a display label's leading
         *    depth prefix is ignored, so pasted category names resolve). Unresolvable entries are
         *    skipped rather than stored as junk values that would silently match nothing, and the
         *    hint under the pills reports how many. Ambiguous labels — the same name under
         *    different parents — resolve to the first option carrying it.
         *  - any other mode appends entries verbatim: a free-text attribute has no option list to
         *    check against, and refusing unknown SKUs would defeat the point.
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
            var text = this._clipboardText(event);
            var lookup;
            var entries;
            var resolved = [];
            var skipped = 0;

            if (!expressionValue.hasListSeparators(text)) {
                return true;
            }
            // From here the paste IS a list, so any hint on screen describes a previous one and
            // goes now — including when this paste turns out to carry nothing but separators.
            this._clearPasteNotice(row);
            entries = expressionValue.splitPasteText(text);

            if (entries.length === 0) {
                return false;
            }
            lookup = mode === 'options' ? this._pasteLookupFor(row) : null;

            _.each(entries, function (entry) {
                var value = lookup ? this._resolvePastedEntry(lookup, entry) : entry;

                if (value === null) {
                    skipped++;

                    return;
                }
                resolved.push(value);
            }, this);

            this._showPasteNotice(row, entries.length, this._appendValues(row, resolved), skipped);

            return false;
        },

        /**
         * Plain-text payload of a paste event, or '' when the clipboard is unreadable — an empty
         * payload carries no separator, so the handler declines and the browser does its own thing.
         *
         * @param {Event} event Paste event.
         * @returns {String}
         */
        _clipboardText: function (event) {
            var clipboard = event && event.clipboardData ? event.clipboardData : null;

            if (!clipboard || typeof clipboard.getData !== 'function') {
                return '';
            }

            return clipboard.getData('text/plain') || '';
        },

        /**
         * Builds the value/label lookup a pasted list resolves through, from the row's active
         * option list. One pass per paste — pasting is a one-off action, so nothing is cached and
         * no stale index can survive an option list that changed.
         *
         * Labels index twice when they carry a leading depth prefix (some option sources render
         * hierarchy into the label itself): once as stored, once stripped, both lower-cased. First
         * entry wins per key, so a duplicated label resolves to the first option carrying it in
         * list order.
         *
         * Both maps have a null prototype: without one, pasting `toString` would "resolve" to an
         * Object.prototype member and store a function as a condition value.
         *
         * @param {Object} row Row view-model.
         * @returns {{byValue: Object, byLabel: Object}} Maps from an entry to the option value it
         *     resolves to.
         */
        _pasteLookupFor: function (row) {
            var host = this._activeOptionsHostFor(row);
            var options = host && host.options ? host.options : [];
            var byValue = Object.create(null);
            var byLabel = Object.create(null);
            var self = this;

            _.each(options, function (opt) {
                var value = String(opt.value);
                var label = String(opt.label === null || opt.label === undefined ? '' : opt.label);
                var stripped = self.displayLabel(label).toLowerCase();

                if (byValue[value] === undefined) {
                    byValue[value] = value;
                }

                if (label !== '' && byLabel[label.toLowerCase()] === undefined) {
                    byLabel[label.toLowerCase()] = value;
                }

                if (stripped !== '' && byLabel[stripped] === undefined) {
                    byLabel[stripped] = value;
                }
            });

            return {byValue: byValue, byLabel: byLabel};
        },

        /**
         * Resolves one pasted entry to an option value, or null when the row's options carry no
         * such value and no such label.
         *
         * @param {{byValue: Object, byLabel: Object}} lookup Lookup from _pasteLookupFor().
         * @param {String} entry One trimmed pasted entry.
         * @returns {String|null}
         */
        _resolvePastedEntry: function (lookup, entry) {
            var key = String(entry);
            var byLabel;

            if (lookup.byValue[key] !== undefined) {
                return lookup.byValue[key];
            }
            byLabel = lookup.byLabel[key.toLowerCase()];

            return byLabel === undefined ? null : byLabel;
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
         * nothing to disambiguate.
         *
         * @param {Object} row Row view-model.
         * @param {String} [control] Name of the combobox asking.
         * @returns {Boolean}
         */
        dropdownOwnedBy: function (row, control) {
            return control === undefined || row.dropdownControl() === control;
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
         * matches" verdict over its own option list — so it answers before the type-ahead rule is
         * consulted: an attribute whose backend supports suggestions must not have its ATTRIBUTE
         * list gated by the state of a value suggestion nobody asked for.
         *
         * @param {Object} row Row view-model.
         * @param {*} query The text the suggestions were requested for — the row's value on a
         *     single-value editor, its search text on a multi-value one.
         * @param {String} [control] Name of the combobox asking; omitted asks about whichever
         *     dropdown is open.
         * @returns {Boolean}
         */
        dropdownListVisible: function (row, query, control) {
            if (!row.dropdownOpen() || !this.dropdownOwnedBy(row, control)) {
                return false;
            }

            if (searchableSelect(row.dropdownControl()) !== null) {
                return true;
            }

            return this.rowUsesSuggestList(row) ? this.suggestDropdownVisible(row, query) : true;
        },

        /**
         * True when the row's dropdown is fed by the AJAX type-ahead rather than by an option list.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        rowUsesSuggestList: function (row) {
            return !this.productAttributeHasOptions(row) && this.productAttributeSupportsSuggest(row);
        },

        /**
         * True for the one dropdown that replaces the row's value instead of adding to a list: the
         * single-value type-ahead of a free-text attribute. Every other dropdown — the flat option
         * lists, the option tree and the multi-value type-ahead — appends a value.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        dropdownReplacesValue: function (row) {
            return this.rowUsesSuggestList(row) && !this.rowUsesListOperator(row);
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
         * The open dropdown's OWNER decides first: a searchable single-select's entries come from its
         * own registry-declared option list, which has nothing to do with the row's value editor.
         *
         * @param {Object} row Row view-model.
         * @returns {Array.<Object>} Tree nodes in tree mode, otherwise suggestion or option
         *     entries — every entry carrying the `value` a commit writes.
         */
        navigableDropdownItems: function (row) {
            var control = row.dropdownControl();

            if (searchableSelect(control) !== null) {
                return this.filteredSearchableOptions(row, control).items;
            }

            if (this.rowShowsTree(row)) {
                return this.visibleTreeNodes(row);
            }

            if (this.rowUsesSuggestList(row)) {
                return row.suggestedOptions();
            }

            return this.filteredDropdownOptions(row).items;
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
            var field = this.fieldsByType[row.fieldType()];

            return field && field.valueType === 'product-attribute'
                ? this.filteredProductAttributeOptions(row)
                : this.filteredOptionsFor(row);
        },

        /**
         * The highlighted dropdown entry, or null when nothing is highlighted.
         *
         * The stored index is validated against the current list on every read rather than being
         * corrected on every list change: lists re-filter on each keystroke, each pick and each
         * arriving suggestion, and an index checked at the point of use cannot survive any of them
         * as a pointer past the end.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null}
         */
        activeDropdownItem: function (row) {
            var items = this.navigableDropdownItems(row);
            var index = row.activeOptionIndex();

            return index >= 0 && index < items.length ? items[index] : null;
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
         * value editor's shape says nothing about it.
         *
         * @param {Object} row Row view-model.
         * @returns {Boolean}
         */
        dropdownAddsToList: function (row) {
            return searchableSelect(row.dropdownControl()) === null && !this.dropdownReplacesValue(row);
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
         * True when the row's current selection already holds an option value. Array values match by
         * membership, scalar values by equality; everything compares as a string, which is the
         * shape option values are stored in.
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
            var value = control === null ? row.value() : control.selected(this, row);
            var target = String(optionValue);

            if (_.isArray(value)) {
                return _.some(value, function (v) { return String(v) === target; });
            }

            return String(value === null || value === undefined ? '' : value) === target;
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
         * The combobox/listbox key pattern, shared by all four dropdown variants.
         *
         * ArrowDown and ArrowUp move the highlight over the entries the row currently renders
         * (ArrowDown from nothing lands on the first entry, ArrowUp on the last; ArrowUp off the
         * top clears the highlight, which is how an admin gets back to committing the text they
         * typed). Enter commits the highlighted entry. Escape closes the dropdown. In the option
         * tree, ArrowRight expands the highlighted parent and ArrowLeft collapses it, Enter on
         * a collapsed parent expands it rather than selecting it — one keystroke, one obvious
         * effect — and Space toggles the highlighted node's selection, which is what a click on the
         * row does. Home and End jump to the ends of the list.
         *
         * Keys that a text input needs are only taken over once a highlight exists: ArrowLeft,
         * ArrowRight, Home and End move the caret while the admin is typing, and only act on the
         * list after ArrowDown has moved into it. Space is taken over on the same terms and only in
         * the tree, which by definition has no search text — so a space typed into a breadcrumb
         * query, where it separates the tokens the search matches on, is never swallowed. Every
         * other key — every character, every deletion — clears the highlight, because it is about
         * to change the query the list was built from.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The keydown event.
         * @param {*} query The text the suggestions were requested for.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed —
         *     Knockout's event binding suppresses the default action for every value but literal
         *     true.
         */
        handleDropdownKeydown: function (row, event, query) {
            var key = this._keyName(event);
            var items;

            if (key === 'Escape') {
                if (!row.dropdownOpen()) {
                    return true;
                }
                this.closeDropdown(row);

                return false;
            }

            if (!this.dropdownListVisible(row, query)) {
                // A dropdown closed by Escape re-opens on ArrowDown without needing a re-focus.
                if (key === 'ArrowDown' && !row.dropdownOpen()) {
                    this.openDropdown(row);

                    return false;
                }

                return this._resetHighlightUnlessNavigating(row, key);
            }
            items = this.navigableDropdownItems(row);

            if (key === 'ArrowDown' || key === 'ArrowUp') {
                this._moveHighlight(row, items.length, key === 'ArrowDown' ? 1 : -1);

                return false;
            }

            if (this.activeDropdownItem(row) === null) {
                return this._resetHighlightUnlessNavigating(row, key);
            }

            return this._handleActiveEntryKey(row, key, items);
        },

        /**
         * The half of the key pattern that needs a highlighted entry: committing it, toggling its
         * selection, jumping to the ends of the list, and expanding or collapsing it in the option
         * tree.
         *
         * @param {Object} row Row view-model.
         * @param {String} key Normalised key name.
         * @param {Array.<Object>} items The row's rendered entries.
         * @returns {Boolean} true when the key was not consumed.
         */
        _handleActiveEntryKey: function (row, key, items) {
            var item = this.activeDropdownItem(row);

            if (key === 'Enter') {
                this.commitDropdownItem(row, item);

                return false;
            }

            // The listbox convention, and the tree's only way to DESELECT from the keyboard: Enter
            // on a collapsed parent is spoken for by expansion, so selection needs a key of its own.
            if (key === ' ' && this.rowShowsTree(row)) {
                this.toggleTreeNode(row, item.value);

                return false;
            }

            if (key === 'Home' || key === 'End') {
                row.activeOptionIndex(key === 'Home' ? 0 : items.length - 1);
                this._scrollHighlightIntoView(row);

                return false;
            }

            if ((key === 'ArrowRight' || key === 'ArrowLeft') && this.rowShowsTree(row)) {
                // Only a parent in the state the key would change reacts; anything else leaves the
                // key to the text caret, so arrowing through the search text never toggles a node.
                if (item.hasChildren && item.expanded === (key === 'ArrowLeft')) {
                    this.toggleNode(row, item.value);

                    return false;
                }
            }

            return this._resetHighlightUnlessNavigating(row, key);
        },

        /**
         * Clears the highlight for any key that is about to edit the query, and reports the key as
         * unconsumed either way.
         *
         * @param {Object} row Row view-model.
         * @param {String} key Normalised key name.
         * @returns {Boolean} Always true.
         */
        _resetHighlightUnlessNavigating: function (row, key) {
            if (NAVIGATION_KEYS[key] !== true) {
                row.activeOptionIndex(-1);
            }

            return true;
        },

        /**
         * Moves the highlight by one entry and scrolls it into view.
         *
         * -1 is the position of the text the admin typed, above the first entry: moving down from
         * it enters the list, moving up off the first entry returns to it, and moving up from it
         * wraps to the last entry so a short list is reachable from either direction. Moving down
         * off the last entry stays there — running past the end must not silently un-highlight the
         * entry Enter is about to commit.
         *
         * @param {Object} row Row view-model.
         * @param {Number} count How many entries the list holds.
         * @param {Number} step +1 down, -1 up.
         * @returns {void}
         */
        _moveHighlight: function (row, count, step) {
            var next = row.activeOptionIndex() + step;

            if (count === 0) {
                row.activeOptionIndex(-1);

                return;
            }

            if (next < -1) {
                next = count - 1;
            } else if (next >= count) {
                next = count - 1;
            }
            row.activeOptionIndex(next);
            this._scrollHighlightIntoView(row);
        },

        /**
         * Scrolls the highlighted entry just far enough to be visible inside the scrolling list.
         *
         * Runs against the element Knockout has already rendered — only its modifier class
         * changed, never its existence — so no deferral is needed. A missing element (an index
         * that outran the list) simply scrolls nothing.
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
         * The writes are the dropdown shapes: a searchable single-select settles its one value and
         * closes, an option tree expands a collapsed parent and otherwise toggles the node's
         * selection, a list-valued editor appends the value as a pill, and the single-value
         * type-ahead replaces the value and closes. Each one calls the same component method the
         * entry's click binding calls, so mouse and keyboard cannot drift.
         *
         * The single-selects answer first, for the same reason they do in navigableDropdownItems: the
         * row's value editor may be a tree or a list, and the Attribute control's Enter must not be
         * read as a pick in it.
         *
         * @param {Object} row Row view-model.
         * @param {Object} item Entry from navigableDropdownItems().
         * @returns {void}
         */
        commitDropdownItem: function (row, item) {
            var control = row.dropdownControl();

            if (searchableSelect(control) !== null) {
                this.commitSearchableSelect(row, control, item.value);

                return;
            }

            if (this.rowShowsTree(row)) {
                if (item.hasChildren && !item.expanded) {
                    this.toggleNode(row, item.value);

                    return;
                }
                this.toggleTreeNode(row, item.value);

                return;
            }

            if (this.dropdownReplacesValue(row)) {
                row.value(item.value);
                this.closeDropdown(row);

                return;
            }
            this.addOption(row, item.value);
        },

        /**
         * Toggles one option-tree node's selection: the node's value joins the row's list when it
         * is absent and leaves it when it is already there.
         *
         * Both directions are the point. Selected nodes stay on screen so their subtrees remain
         * reachable, which used to leave them inert — the only way to undo a mis-click was to find
         * the value's pill somewhere above the list. Clicking the row again is now the obvious
         * undo, and it is the same write the pill's remove button performs.
         *
         * Only the node's OWN value moves, never its descendants': the stored value is a flat list
         * of option values, and what a listed value covers below itself is the consuming rule's
         * business, not this picker's. Selecting descendants here would store a set nobody asked
         * for and misstate what was chosen.
         *
         * Selectedness is read from the row's value rather than taken from the node, so a click
         * acts on the state the row is in now, not on the state its last render captured.
         *
         * @param {Object} row Row view-model.
         * @param {*} value Option value of the node to toggle.
         * @returns {void}
         */
        toggleTreeNode: function (row, value) {
            if (this.optionIsSelected(row, value)) {
                this.removeOption(row, value);

                return;
            }
            this.addOption(row, value);
        },

        /**
         * Keydown on a value editor whose Enter means nothing of its own: the shared dropdown
         * pattern, with a fall-through Enter swallowed instead of handed to the browser.
         *
         * These editors take their values from the list, never from the text in the input, so
         * Enter with nothing highlighted has nothing to commit — and every one of them sits inside
         * the admin form, where an unhandled Enter submits it. Swallowing costs nothing and removes
         * a save nobody asked for.
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

            return this._keyName(event) !== 'Enter';
        },

        /**
         * Keydown on a free-text multi-value search input: the shared dropdown pattern first, then
         * the input's own Enter behaviour.
         *
         * Order is the point. With an entry highlighted, Enter commits that suggestion; with
         * nothing highlighted, Enter commits the text as typed — which is what a free-text list
         * editor is for, and what the admin sees in the input.
         *
         * @param {Object} row Row view-model.
         * @param {Event} event The keydown event.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed.
         */
        handleFreeTextKeydown: function (row, event) {
            if (this.handleDropdownKeydown(row, event, row.searchText()) !== true) {
                return false;
            }

            if (this._keyName(event) === 'Enter') {
                this.commitFreeTextValue(row);

                return false;
            }

            return true;
        },

        /**
         * Normalised name of a key event, from KeyboardEvent.key. A synthetic event without one
         * reads as no key at all, which every branch treats as "not a navigation key".
         *
         * @param {Event} event Key event.
         * @returns {String}
         */
        _keyName: function (event) {
            return event && typeof event.key === 'string' ? event.key : '';
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
            var total = _.isArray(allPills) ? allPills.length : 0;

            return row.pillsExpanded()
                ? $t('Show fewer selected values')
                : $t('Show %1 more selected values').replace('%1', total - this.pillCollapseLimit);
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

        labelForOperator: function (row) {
            var ops = this.operatorsFor(row);
            var op = row.operator();
            var match = _.findWhere(ops, {value: op});
            return match ? match.label : op;
        },

        labelForOptionValue: function (row, optionValue) {
            var options = this.valueOptionsFor(row);
            var match = _.findWhere(options, {value: String(optionValue)});
            return this.displayLabel(match ? match.label : optionValue);
        },

        /**
         * Strips the leading depth prefix (long dashes + spaces) that the Category source adds for
         * tree-rendering inside the dropdown. The hierarchy is useful while browsing, but redundant
         * once an option is selected — the pill or preview should just show the leaf label.
         */
        displayLabel: function (label) {
            return String(label == null ? '' : label).replace(/^[\s—–-]+/, '');
        },

        labelForProductAttribute: function (row) {
            var attrs = this.attributesFor(row);
            var match = _.findWhere(attrs, {value: row.productAttribute()});
            return match ? match.label : row.productAttribute();
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
         * group's own summary to state.
         *
         * @param {Object} group Group view-model.
         * @returns {String}
         */
        groupSummary: function (group) {
            var rows = 0;
            var groups = 0;
            var text;

            _.each(group.children(), function (child) {
                if (child.kind === 'group') {
                    groups++;
                } else {
                    rows++;
                }
            });

            text = rows === 1 ? $t('1 condition') : $t('%1 conditions').replace('%1', rows);

            if (groups > 0) {
                text += ' · ' + (groups === 1 ? $t('1 group') : $t('%1 groups').replace('%1', groups));
            }

            return text;
        },

        /**
         * True when a group directly holds at least one condition row — the render condition of
         * the Field/Operator/Value column-caption line, which would caption nothing over a group
         * holding only child groups.
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        groupHasConditionRows: function (group) {
            return _.some(group.children(), function (child) {
                return child.kind === 'condition';
            });
        },

        /**
         * True when a group holds nothing at all — the render condition of the inline
         * empty-group hint. The serialiser drops an empty group, so the hint says exactly that
         * instead of leaving a bare box that looks like a rendering failure.
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        groupIsEmpty: function (group) {
            return group.children().length === 0;
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
         * holds and — once any group nests — how deep. The one line that still describes the
         * whole rule while a long one is scrolled.
         *
         * @returns {String}
         */
        ruleSummaryText: function () {
            var conditions = this._conditionCount(this.rootGroup());
            var depth;
            var text;

            if (conditions === 0) {
                return $t('No conditions yet');
            }

            text = conditions === 1 ? $t('1 condition') : $t('%1 conditions').replace('%1', conditions);
            depth = this._heightOf(this.rootGroup());

            if (depth > 1) {
                text += ' · ' + $t('Nesting depth %1').replace('%1', depth);
            }

            return text;
        },

        /**
         * How many condition rows the subtree below a group holds, at any depth.
         *
         * @param {Object} group Group view-model.
         * @returns {Number}
         */
        _conditionCount: function (group) {
            var count = 0;

            _.each(group.children(), function (child) {
                count += child.kind === 'group' ? this._conditionCount(child) : 1;
            }, this);

            return count;
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
         * True when the drop indicator belongs in the gap directly ABOVE this node.
         *
         * The template renders one indicator per gap and asks per node, because inside the
         * children foreach the owning group is out of reach: identifying a gap by the node that
         * follows it needs nothing but the node itself. The comparison is by identity against the
         * target group's current children, so it costs no tree walk per rendered node.
         *
         * @param {Object} node Row or group view-model.
         * @returns {Boolean}
         */
        isDropSlotBefore: function (node) {
            var target = this.dropTarget();

            return target !== null && target.group.children()[target.index] === node;
        },

        /**
         * True when the drop indicator belongs after a group's last child — the one gap that has no
         * following node to name it, and therefore the group's own to answer for. Together with
         * isDropSlotBefore this covers every insertion slot exactly once.
         *
         * @param {Object} group Group view-model.
         * @returns {Boolean}
         */
        isDropSlotAtEnd: function (group) {
            var target = this.dropTarget();

            return target !== null && target.group === group && target.index === group.children().length;
        },

        /**
         * Begins a pointer drag of one node.
         *
         * The handle captures the pointer, so every later move and the release are delivered to it
         * even once the pointer has left the handle, the row, or the window — no document-level
         * move listener, and no drag lost the moment the pointer outruns the element it started on.
         * Escape is the one thing capture cannot deliver: key events follow focus, and suppressing
         * this event's default action (which is what stops the browser from starting a text
         * selection under the pointer) deliberately leaves focus where it was. So a document-level
         * key listener lives exactly as long as the drag does.
         *
         * A drag can only start on a handle — the handles are the only elements carrying these
         * bindings — and only from the primary button, so a right-click on a handle opens the
         * context menu instead of picking the node up.
         *
         * Two constraints on what these handlers may read. Knockout registers event handlers
         * through jQuery when it is present (it is, in adminhtml), so the object handed over is
         * jQuery's wrapper, not the native event: only the properties jQuery normalises exist here,
         * which is why the button is tested through `button` rather than `isPrimary`. And the
         * Escape listener deliberately neither stops propagation nor suppresses the default action —
         * cancelling a drag is not a reason to swallow a keystroke the rest of the page may also
         * have a use for.
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
            this._dragHandle = handle;
            this._dragPointerId = event.pointerId === undefined ? null : event.pointerId;

            if (this._dragPointerId !== null && typeof handle.setPointerCapture === 'function') {
                handle.setPointerCapture(this._dragPointerId);
            }
            this._dragEscapeHandler = function (keyEvent) {
                if (keyEvent && keyEvent.key === 'Escape') {
                    self.cancelDrag();
                }
            };
            document.addEventListener('keydown', this._dragEscapeHandler, true);

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
         * Drops every trace of a running drag: the node, the indicator, the Escape listener and the
         * pointer capture.
         *
         * The capture is released only when this element still holds it — releasing a capture that
         * has already lapsed throws, and by the time an interrupted drag reaches here it usually
         * has.
         *
         * @returns {void}
         */
        _releaseDrag: function () {
            var handle = this._dragHandle;
            var pointerId = this._dragPointerId;

            this.dragNode(null);
            this.dropTarget(null);

            if (this._dragEscapeHandler !== null) {
                document.removeEventListener('keydown', this._dragEscapeHandler, true);
                this._dragEscapeHandler = null;
            }
            this._dragHandle = null;
            this._dragPointerId = null;

            if (handle !== null && pointerId !== null
                && typeof handle.hasPointerCapture === 'function'
                && typeof handle.releasePointerCapture === 'function'
                && handle.hasPointerCapture(pointerId)) {
                handle.releasePointerCapture(pointerId);
            }
        },

        /**
         * Resolves a pointer position to the insertion slot it is nearest to, and marks it.
         *
         * A position outside the builder's own box marks nothing: the indicator disappears, which
         * is both the feedback that releasing here does nothing and the mechanism that makes it so.
         * Inside, the nearest slot by vertical distance wins — the layout is a single column, so a
         * gap is a y coordinate — and the FIRST of two equally near slots wins, which in the
         * depth-first slot order is the outer one. Nested groups carry a header and a footer, so
         * the gap just inside a group and the gap just before it are a whole chrome row apart and
         * never actually tie.
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
            var nearest = null;
            var nearestDistance = 0;

            if (this._pointerInsideBuilder(clientX, clientY)) {
                _.each(this._dropCandidates(this.dragNode()), function (candidate) {
                    var distance = Math.abs(candidate.y - clientY);

                    if (nearest === null || distance < nearestDistance) {
                        nearest = candidate;
                        nearestDistance = distance;
                    }
                });
            }

            if (nearest === null) {
                if (current !== null) {
                    this.dropTarget(null);
                }

                return;
            }

            if (current !== null && current.group === nearest.group && current.index === nearest.index) {
                return;
            }
            this.dropTarget({group: nearest.group, index: nearest.index});
        },

        /**
         * The slots a drag may drop the node into, each with the y coordinate of its gap.
         *
         * The two slots directly around the node are left out: dropping there rearranges nothing,
         * so offering them would show an indicator that promises a change and then announce a move
         * that never happened. The pure model deliberately leaves that call to the caller, and the
         * keyboard walk skips the same two.
         *
         * Slots that would nest the node past the depth cap are left out the same way: not being a
         * candidate IS the feedback — no indicator appears over them, so releasing there drops the
         * node nowhere rather than into a shape the save would refuse.
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
            var walk = this._slotWalk(node);
            var candidates = [];

            if (walk === null) {
                return candidates;
            }
            _.each(walk.slots, function (slot, index) {
                var anchor;

                if (index === walk.before || index === walk.before + 1) {
                    return;
                }

                if (!this._slotFits(slot.path, node)) {
                    return;
                }
                anchor = this._slotAnchor(slot.path);

                if (anchor !== null) {
                    candidates.push(anchor);
                }
            }, this);

            return candidates;
        },

        /**
         * The node's insertion slots, and where the node itself sits among them.
         *
         * The slot list comes from the pure model over an index-faithful projection of the
         * view-model tree, minus the slots inside the node's own subtree — a node cannot move into
         * itself. `before` is the position of the gap directly above the node, which is the slot
         * whose path IS the node's path; the gap directly below it is always the next entry, since
         * everything that would sit between them lies inside the node and has just been filtered
         * out. Those two are the anchors both the drag and the keyboard walk measure from.
         *
         * @param {Object} node Row or group view-model.
         * @returns {{slots: Array.<{path: Array.<Number>}>, before: Number}|null} null when the
         *     node is not in the tree (the root group, which cannot move).
         */
        _slotWalk: function (node) {
            var path = this.findPath(node);
            var slots;
            var before = -1;

            if (path === null) {
                return null;
            }
            slots = expressionTree.excludeSubtree(
                expressionTree.slotList(this._structureModelFromVm(this.rootGroup())),
                path
            );
            _.each(slots, function (slot, index) {
                if (before === -1 && this._samePath(slot.path, path)) {
                    before = index;
                }
            }, this);

            return before === -1 ? null : {slots: slots, before: before};
        },

        /**
         * Resolves one slot path to the group it inserts into, the index inside it, and the y
         * coordinate of the gap on screen.
         *
         * The gap above child i is that child's top edge; the gap after the last child is its
         * bottom edge. An empty group has no child to measure at all, so its add-condition button
         * stands in — it is the first thing below where a first child would appear, and it exists
         * in every group. A node whose element cannot be found yields null and simply drops out of
         * the candidate list rather than contributing a bogus coordinate.
         *
         * @param {Array.<Number>} slotPath Receiving group path plus insertion index.
         * @returns {{group: Object, index: Number, y: Number}|null}
         */
        _slotAnchor: function (slotPath) {
            var group = this._groupAtPath(slotPath.slice(0, -1));
            var index = slotPath[slotPath.length - 1];
            var children;
            var rect;

            if (group === null) {
                return null;
            }
            children = group.children();

            if (index < children.length) {
                rect = this._rectOf(this.nodeDomId(children[index]));

                return rect === null ? null : {group: group, index: index, y: rect.top};
            }

            if (children.length > 0) {
                rect = this._rectOf(this.nodeDomId(children[children.length - 1]));

                return rect === null ? null : {group: group, index: index, y: rect.bottom};
            }
            rect = this._rectOf(this.groupAddDomId(group));

            return rect === null ? null : {group: group, index: index, y: rect.top};
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
            var rect = this._rectOf(this.nodeDomId(this.rootGroup()));

            return rect !== null
                && clientX >= rect.left && clientX <= rect.right
                && clientY >= rect.top && clientY <= rect.bottom;
        },

        /**
         * Bounding box of a rendered element, or null when it is not on the page.
         *
         * @param {String} domId Id of the element to measure.
         * @returns {Object|null} The element's DOMRect.
         */
        _rectOf: function (domId) {
            var element = document.getElementById(domId);

            return element && typeof element.getBoundingClientRect === 'function'
                ? element.getBoundingClientRect()
                : null;
        },

        /**
         * Moves a node one insertion slot up or down from a focused drag handle — the keyboard's
         * whole share of reordering, and the only one an admin who cannot use a pointer has.
         *
         * The walk is the same slot list the drag measures, and it steps OVER the two slots around
         * the node, so one keystroke is always exactly one visible change: within a group the node
         * swaps with its neighbour, and at a group's edge the next slot is inside (or outside) the
         * adjacent group, so repeated presses walk into and out of nested groups. At either end of
         * the list there is no next slot and nothing happens — the key is still consumed, because a
         * handle is not a place where scrolling the page is the expected answer to an arrow key.
         *
         * @param {Object} node Row or group view-model the handle belongs to.
         * @param {Event} event The keydown event.
         * @returns {Boolean} true to let the browser act on the key, false when it was consumed.
         */
        handleDragKeydown: function (node, event) {
            var key = this._keyName(event);
            var walk;
            var slot;
            var group;

            if (key !== 'ArrowUp' && key !== 'ArrowDown') {
                return true;
            }
            walk = this._slotWalk(node);

            if (walk === null) {
                return false;
            }
            slot = this._stepSlot(walk, node, key === 'ArrowUp' ? -1 : 1);

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
         * The next slot in one direction that the node may actually be moved into.
         *
         * Starts one slot beyond the pair describing the node's current placement and keeps going
         * while slots refused by the depth cap turn up, so a keystroke lands on the next REACHABLE
         * gap instead of dead-ending on an unusable one: one keystroke stays one visible change,
         * and a subtree too tall for a nested group simply passes over it. Running out of slots
         * yields null — the key is consumed and nothing moves, which is also what a node with no
         * reachable slot at all gets in both directions.
         *
         * @param {{slots: Array.<{path: Array.<Number>}>, before: Number}} walk Slot walk of the node.
         * @param {Object} node Row or group view-model being moved.
         * @param {Number} step -1 towards the start of the list, +1 towards its end.
         * @returns {{path: Array.<Number>}|null}
         */
        _stepSlot: function (walk, node, step) {
            var index = step < 0 ? walk.before - 1 : walk.before + 2;

            while (walk.slots[index] !== undefined) {
                if (this._slotFits(walk.slots[index].path, node)) {
                    return walk.slots[index];
                }
                index += step;
            }

            return null;
        },

        /**
         * Moves one node into a group's insertion slot — the single application path for every
         * reorder, pointer drop and keystroke alike.
         *
         * The pure model decides whether the move is legal: it is asked first, over an
         * index-faithful projection of the view-model tree, and a refusal (a slot inside the moved
         * node's own subtree, a path out of range) leaves the tree untouched. Only then are the two
         * splices applied to the observable arrays, with the same insertion index the model used —
         * a move within one group compensates for the removal shift, so the slot index keeps
         * meaning "the gap you saw" rather than "the gap after removal". The two writes are
         * separate notifications, which nothing observes: the autosave and count computeds are both
         * deferred, so they see the finished tree once.
         *
         * Aggregators are never involved. They belong to groups, which a move only ever reorders,
         * so the logic around a moved node reads exactly as it did before.
         *
         * The depth cap is re-checked here rather than trusted from the caller. Both callers already
         * filter their slots — that is where the cap becomes UX, since a slot that is not offered
         * needs no explanation — but being the single application path makes this the one place where
         * "no reorder may nest past the cap" can be a fact rather than a convention every future
         * caller has to remember.
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
            var insertIndex;

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
            insertIndex = targetGroup === sourceGroup && slotIndex > fromIndex ? slotIndex - 1 : slotIndex;
            sourceGroup.children.splice(fromIndex, 1);
            targetGroup.children.splice(insertIndex, 0, node);
            this._announceMove(node);
            this._focusLater(this.dragHandleDomId(node));

            return true;
        },

        /**
         * Reports where a node ended up, for the reorder live region.
         *
         * Counted in insertion slots rather than in siblings, because that is what a move actually
         * walks: a node crossing into a nested group moves one slot, not one sibling. The total is
         * one less than the number of slots the node can address, since the two slots around the
         * node describe the SAME placement — its current one — which makes the last position
         * reachable and the total stable across every move (a move never changes how many slots a
         * tree has).
         *
         * @param {Object} node Row or group view-model that has just moved.
         * @returns {void}
         */
        _announceMove: function (node) {
            var walk = this._slotWalk(node);

            if (walk === null) {
                return;
            }
            this.moveAnnouncement(
                $t('Moved to position %1 of %2')
                    .replace('%1', walk.before + 1)
                    .replace('%2', walk.slots.length - 1)
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

        /**
         * True when two child-index paths address the same node.
         *
         * @param {Array.<Number>} left
         * @param {Array.<Number>} right
         * @returns {Boolean}
         */
        _samePath: function (left, right) {
            return left.length === right.length && _.every(left, function (index, at) {
                return index === right[at];
            });
        },

        /* ---------------- (de)serialisation ---------------- */

        /**
         * Hydrates the view-model tree from the field value.
         *
         * Malformed JSON or a non-tree value yields an empty root group. A stored leaf whose
         * condition type resolves to no configured field is skipped; a group left empty by such
         * skips is kept — it is authoring state, and an empty group serialises to nothing anyway.
         */
        _loadFromValue: function () {
            var raw = this.value();
            var model = {kind: 'group', aggregator: 'all', children: []};
            var tree = null;

            if (raw) {
                try {
                    tree = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (e) {
                    tree = null;
                }
            }

            if (tree) {
                model = expressionTree.treeToModel(tree, this.combineType);
            }

            this.rootGroup(this._vmFromModel(model));
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
         * condition's type matches no configured field.
         *
         * @param {Object} cond Stored leaf condition object.
         * @returns {Object|null}
         */
        _rowFromCondition: function (cond) {
            if (!cond || !cond.type) {
                return null;
            }
            var type = cond.type;
            var fieldType = type;
            var productAttribute = '';
            var pickerField = _.find(this.fields, function (f) { return f.type === PRODUCT_ATTRIBUTE_PICKER; });
            if (pickerField && type === pickerField.childType) {
                fieldType = PRODUCT_ATTRIBUTE_PICKER;
                productAttribute = cond.attribute || '';
            }

            if (!this.fieldsByType[fieldType]) {
                return null;
            }

            return this._buildRow(this.fieldsByType[fieldType], {
                operator: cond.operator,
                value: cond.value,
                productAttribute: productAttribute,
                isValueProcessed: cond.is_value_processed
            });
        },

        /**
         * Creates a condition-row view-model.
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
            overrides = overrides || {};
            var fieldType = field ? field.type : (this.fields[0] && this.fields[0].type);
            var operator = overrides.operator || (field && field.operators && field.operators.length ? field.operators[0].value : '==');
            var value = overrides.value !== undefined && overrides.value !== null
                ? overrides.value
                : this._defaultValueForField(field);
            var productAttribute = overrides.productAttribute || (field && field.attributes && field.attributes.length ? field.attributes[0].value : '');
            // A clone hands its source's retained number over directly; every other caller lets the
            // loaded value speak for itself. ONE test decides, so both routes agree by construction.
            var storedNumber = overrides.storedNumber !== undefined ? overrides.storedNumber : overrides.value;
            var row = {
                kind: 'condition',
                id: ++rowSeq,
                fieldType: ko.observable(fieldType),
                operator: ko.observable(operator),
                // Shaped below, once the row can say which operators it offers: a picker row's
                // attribute may carry its own operator set, and its `list` flags decide the shape.
                value: ko.observable(value),
                productAttribute: ko.observable(productAttribute),
                // Whatever the loaded leaf carried in `is_value_processed`, kept verbatim so the
                // serialiser can write it back unchanged; a row the admin adds carries null. A plain
                // property, not an observable: authoring never changes it, and it is meaningless to
                // this component — the flag is an artefact of how the PHP rule framework
                // (de)serialises a condition, and re-emitting the value that came in is what keeps a
                // load → save cycle byte-identical. Explicitly `undefined`-checked so a stored
                // `false` survives.
                isValueProcessed: overrides.isValueProcessed === undefined ? null : overrides.isValueProcessed,
                // The stored value when it arrived as a JSON number rather than a string, else null.
                // A rule saved by PHP can come back that way: the rule framework pushes the value of a
                // decimal-backed attribute through a locale number parse on load, so a `100` an editor
                // typed is re-encoded unquoted. Remembering the number lets the serialiser write back
                // the shape it read (see _conditionFromRow) instead of re-quoting it and dirtying the
                // form on open.
                storedNumber: typeof storedNumber === 'number' ? storedNumber : null,
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

            row.value(expressionValue.normaliseValueIn(field, operator, value, this.operatorsFor(row)));

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
                aggregator: ko.observable(aggregator === 'any' ? 'any' : 'all'),
                children: ko.observableArray([])
            };
        },

        _defaultValueForField: function (field) {
            if (!field) {
                return '';
            }
            if (field.valueType === 'multiselect') {
                return [];
            }
            if (field.valueType === 'select' && field.options && field.options.length) {
                return field.options[0].value;
            }
            return '';
        },

        /**
         * Serialises the authored tree into the field value.
         *
         * The recursive view-model walk produces the tree module's plain group model, the module
         * renders it in the frozen Combine shape, and a root left without any conditions maps to
         * '' — the field's "no rule" value. The walk reads the root observable, every group's
         * aggregator and children and every row's field/operator/value/attribute observables, which
         * is what lets the autosave computed react to edits at any depth.
         *
         * @returns {String} JSON condition tree, or '' when nothing serialises.
         */
        serialise: function () {
            var tree = expressionTree.modelToTree(this._modelFromVm(this.rootGroup()), this.combineType);

            if (!tree.conditions || tree.conditions.length === 0) {
                return '';
            }

            return JSON.stringify(tree);
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
         * Serialises one condition row into a stored leaf, or null when its field is not configured.
         *
         * The property ORDER is load-bearing — type, attribute, operator, value, is_value_processed —
         * because the field value is produced by JSON.stringify and an unchanged rule must come back
         * out byte-identical. `is_value_processed` is echoed from what the row was loaded with rather
         * than hardcoded: the PHP rule framework writes that key from a flag it reads back under a
         * DIFFERENT name, so a leaf that has ever round-tripped through PHP is stored with `false`
         * where a freshly authored one carries null. Emitting a constant would make every such rule
         * dirty the instant its form opened.
         *
         * A value that arrived UNQUOTED is written back unquoted for the same reason — the rule
         * framework re-encodes the value of a decimal-backed attribute as a JSON number. The
         * restoration is deliberately narrow: only when the row still holds exactly that number, judged
         * by comparing string forms, so the first real edit falls straight back to the string shape and
         * no state has to be invalidated by hand.
         *
         * @param {Object} row Row view-model.
         * @returns {Object|null} Leaf condition in the frozen shape, or null.
         */
        _conditionFromRow: function (row) {
            var fieldType = row.fieldType();
            var field = this.fieldsByType[fieldType];
            if (!field) {
                return null;
            }
            var op = row.operator();
            var rawValue = row.value();
            var value = expressionValue.serialiseValueOut(field, op, rawValue, this.operatorsFor(row));

            if (row.storedNumber !== null && String(row.storedNumber) === value) {
                value = row.storedNumber;
            }

            if (fieldType === PRODUCT_ATTRIBUTE_PICKER) {
                return {
                    type: field.childType,
                    attribute: row.productAttribute(),
                    operator: op,
                    value: value,
                    is_value_processed: row.isValueProcessed
                };
            }

            return {
                type: fieldType,
                attribute: field.attribute,
                operator: op,
                value: value,
                is_value_processed: row.isValueProcessed
            };
        },

        /* ---------------- Live preview ---------------- */

        /**
         * Recursive display structure of the authored rule for the structured preview, or null
         * when nothing renders — the template shows the consumer's empty-state message instead.
         *
         * Presentation only: nodes carry ready-to-print token strings resolved through the row
         * label helpers, the template emits every one through a text binding, and nothing here
         * feeds the serialised value.
         *
         * @returns {Object|null} Root preview group node, or null for an empty rule.
         */
        _buildPreviewTree: function () {
            return this._previewNodeForGroup(this.rootGroup(), true);
        },

        /**
         * Builds the preview node of one group: renderable children in authoring order, each
         * carrying the joiner word that precedes it — the group's aggregator word on every child
         * but the first. Groups with nothing to show collapse to null and are skipped by their
         * parent, exactly like the serialiser drops them.
         *
         * @param {Object} groupVm Group view-model.
         * @param {Boolean} isRoot True for the root group — the template parenthesises every
         *     group but the root.
         * @returns {Object|null} {kind: 'group', root, children} node, or null when empty.
         */
        _previewNodeForGroup: function (groupVm, isRoot) {
            var joiner = groupVm.aggregator() === 'any' ? $t('OR') : $t('AND');
            var children = [];

            _.each(groupVm.children(), function (child) {
                var node = child.kind === 'group'
                    ? this._previewNodeForGroup(child, false)
                    : this._previewNodeForRow(child);

                if (node) {
                    node.joiner = children.length > 0 ? joiner : '';
                    children.push(node);
                }
            }, this);

            if (children.length === 0) {
                return null;
            }

            return {kind: 'group', root: isRoot, children: children};
        },

        /**
         * Builds the preview node of one condition row: field, operator and value as
         * ready-to-print token strings. A row whose field is not configured keeps the historic
         * '?' placeholder as its field token.
         *
         * @param {Object} row Row view-model.
         * @returns {Object} {kind: 'condition', field, operator, value} node.
         */
        _previewNodeForRow: function (row) {
            var fieldType = row.fieldType();
            var field = this.fieldsByType[fieldType];

            if (!field) {
                return {kind: 'condition', field: '?', operator: '', value: ''};
            }

            return {
                kind: 'condition',
                field: fieldType === PRODUCT_ATTRIBUTE_PICKER ? this.labelForProductAttribute(row) : field.label,
                operator: this.labelForOperator(row),
                value: this._previewValueFor(row, field)
            };
        },

        /**
         * Renders a row's value as one preview string: selected option labels for list values
         * (braced, comma-separated), the option's label for single select and optioned-attribute
         * values, the raw text quoted otherwise.
         *
         * @param {Object} row Row view-model.
         * @param {Object} field Field descriptor of the row.
         * @returns {String}
         */
        _previewValueFor: function (row, field) {
            var value = row.value();
            var self = this;
            var labels;

            if (_.isArray(value)) {
                labels = _.map(value, function (v) {
                    return self._previewValueLabel(row, field, v);
                });

                return '{' + labels.join(', ') + '}';
            }

            if (field.valueType === 'select') {
                return this.labelForOptionValue(row, value);
            }

            // The optioned-attribute select uses an options caption, which writes undefined
            // while unselected — that renders as the quoted empty value, never as a label lookup.
            if (field.valueType === 'product-attribute' && this.productAttributeHasOptions(row)) {
                return value === null || value === undefined || value === ''
                    ? '""'
                    : this._previewValueLabel(row, field, value);
            }

            return '"' + (value || '') + '"';
        },

        /**
         * Label of one option value in the preview. Values of a product-attribute row resolve
         * through pathLabelFor, whose index reads the selected attribute's own option list —
         * the field's option list would be the wrong host there: hierarchical attribute options
         * (the category picker) render their breadcrumb path, flat ones their label, optionless
         * ones the raw value. Every other row reads the field options via labelForOptionValue.
         *
         * @param {Object} row Row view-model.
         * @param {Object} field Field descriptor of the row.
         * @param {*} value One option value.
         * @returns {String}
         */
        _previewValueLabel: function (row, field, value) {
            if (field.valueType === 'product-attribute') {
                return this.pathLabelFor(row, value);
            }

            return this.labelForOptionValue(row, value);
        },

        /* ---------------- Validation ---------------- */

        /**
         * Detects rules that can never match, plus rows missing their supporting context.
         *
         * Contradictions are checked per AND-group over its conjunctive closure — the context
         * conditions guaranteed by the group's own rows and by nested AND-subgroups:
         *  - Multiple `context ==` rows with different values (only one context value can hold at a time).
         *  - `context ==` combined with `context !=` of the same value.
         *  - `context is one of {…}` combined with `context ==` outside that set.
         *  - `context is one of` sets with an empty intersection.
         * Each clash is reported once, at the topmost group jointly guaranteeing it: a group whose
         * parent is also an AND-group hands the report up, because its closure is part of the
         * parent's closure.
         *
         * Returns an array of human-readable warning strings (empty if the rule is satisfiable).
         */
        _validateRule: function () {
            var warnings = [];
            var contextFieldType = this._contextFieldType();
            var model;
            var groups;
            var contradictionText;

            if (!contextFieldType) {
                return warnings;
            }

            model = this._coherenceModelFromVm(this.rootGroup());
            groups = expressionTree.groupsWithPaths(model);
            contradictionText = this.coherence.contradictionWarning;

            if (contradictionText) {
                _.each(groups, function (entry) {
                    var contextRows;

                    if (entry.group.aggregator !== 'all') {
                        return;
                    }

                    if (entry.path.length > 0 && this._parentAggregatorAt(model, entry.path) === 'all') {
                        return;
                    }

                    contextRows = this._contextConditionsIn(
                        expressionTree.conjunctiveClosure(entry.group),
                        contextFieldType
                    );

                    if (contextRows.length < 2) {
                        return;
                    }

                    if (expressionTree.solveContradictions(contextRows)) {
                        warnings.push(this._groupPrefix(entry.number, groups.length) + contradictionText);
                    }
                }, this);
            }

            return warnings.concat(this._validateOrphanedDependencies(model, groups));
        },

        /**
         * Catches rows that need a supporting context condition but have none in their conjunctive
         * scope. Typical breakage: the user changes the context row's field, orphaning dependent
         * rows; or builds an OR-branch with a dependent row but no context filter to anchor it.
         *
         * A row is dependent when a `coherence.requirements` entry matches its field's type or
         * attribute — the same lookup that gates the field dropdown. Each group's direct rows are
         * checked with their own scope, so OR-joined branches don't borrow each other's context
         * rules while AND-ancestors legitimately share theirs. At most one warning per requirement
         * key per group; a requirement without warning text gates the dropdown but reports nothing.
         *
         * @param {Object} model Plain group model from _coherenceModelFromVm().
         * @param {Array.<Object>} groups groupsWithPaths() entries for `model`.
         * @returns {Array.<String>} Warning strings.
         */
        _validateOrphanedDependencies: function (model, groups) {
            var warnings = [];
            var requirements = this.coherence.requirements || {};
            var self = this;

            _.each(groups, function (entry) {
                var prefix = self._groupPrefix(entry.number, groups.length);
                var warnedKeys = {};

                _.each(entry.group.children, function (child, idx) {
                    var field;
                    var key;
                    var requirement;
                    var scope;

                    if (child.kind !== 'condition') {
                        return;
                    }

                    field = self.fieldsByType[child.condition.fieldType];

                    if (!field) {
                        return;
                    }

                    key = requirements[field.type] ? field.type
                        : requirements[field.attribute] ? field.attribute : null;

                    if (key === null || warnedKeys[key]) {
                        return;
                    }

                    requirement = requirements[key];

                    if (!requirement.warning || !requirement.contexts || !requirement.contexts.length) {
                        return;
                    }

                    scope = expressionTree.conjunctiveScope(model, entry.path.concat([idx]));

                    if (!self._scopeSatisfies(scope, requirement.contexts)) {
                        warnings.push(prefix + requirement.warning);
                        warnedKeys[key] = true;
                    }
                });
            });

            return warnings;
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

        /**
         * Filters closure conditions down to the context field's operator/value pairs, the shape
         * the tree module's satisfiability check takes.
         *
         * @param {Array.<Object>} closure Condition nodes from conjunctiveClosure().
         * @param {String} contextFieldType Field type of the context field.
         * @returns {Array.<{operator: String, value: *}>}
         */
        _contextConditionsIn: function (closure, contextFieldType) {
            var rows = [];

            _.each(closure, function (node) {
                if (node.condition.fieldType === contextFieldType) {
                    rows.push({operator: node.condition.operator, value: node.condition.value});
                }
            });

            return rows;
        },

        /**
         * Aggregator of the group containing the group addressed by `path`.
         *
         * @param {Object} model Plain root group.
         * @param {Array.<Number>} path Non-empty path of a group inside `model`.
         * @returns {String} 'all' or 'any'.
         */
        _parentAggregatorAt: function (model, path) {
            var current = model;
            var i;

            for (i = 0; i < path.length - 1; i++) {
                current = current.children[path[i]];
            }

            return current.aggregator;
        },

        /**
         * Warning prefix naming a group by its depth-first number — only when the tree has more
         * than one group to point at.
         *
         * @param {Number} number 1-based depth-first group number.
         * @param {Number} totalGroups Total number of groups in the model.
         * @returns {String}
         */
        _groupPrefix: function (number, totalGroups) {
            return totalGroups > 1 ? $t('Group %1: ').replace('%1', number) : '';
        },

        /**
         * Field type of the configured context field — the field whose conditions define a node's
         * conjunctive context. Resolved from `coherence.contextAttribute` against the configured
         * fields; null when no context attribute is configured or no field carries it, which
         * disables every coherence warning.
         *
         * @returns {String|null}
         */
        _contextFieldType: function () {
            var attribute = this.coherence.contextAttribute;
            if (!attribute) {
                return null;
            }
            var f = _.find(this.fields, function (f) { return f.attribute === attribute; });
            return f ? f.type : null;
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

            if (this.countUrl === '') {
                return;
            }
            this._disposable(ko.computed(function () {
                self._scheduleCount(self.serialise());
            }).extend({deferred: true}));
        },

        /**
         * Debounces one count request for a serialised tree, and invalidates everything older.
         *
         * The sequence bump is the invalidation: it retires both the pending timer and any request
         * already in flight, so a number that describes a superseded tree can neither be requested
         * nor rendered. The badge drops to 'loading' immediately rather than at request time —
         * keeping the previous number on screen through the debounce window would state a count for
         * a rule that no longer exists.
         *
         * An empty tree short-circuits: an empty rule is not a question this component can ask.
         * Consumers disagree on what "no conditions" selects (see the empty-state message), the
         * endpoint contract treats a count request for it as an error, and a fresh row would
         * otherwise open on "Count unavailable" — so it resolves locally to 'idle' and no request
         * is made.
         *
         * A tree identical to the one the current state already describes is ignored outright. Not
         * every notification means the rule changed: an observable holding an array notifies on
         * every write, equal contents included, and several of the row's edits rewrite the value
         * wholesale. Without this an unchanged rule would cost a request and, worse, throw a
         * settled number back to 'loading' — a badge flickering over an untouched rule.
         *
         * @param {String} serialised The serialised condition tree, '' when nothing serialises.
         * @returns {void}
         */
        _scheduleCount: function (serialised) {
            var self = this;
            var seq;

            if (serialised === this._countedTree) {
                return;
            }
            this._countedTree = serialised;
            seq = ++this._countSeq;

            if (this._countTimer) {
                clearTimeout(this._countTimer);
                this._countTimer = null;
            }

            if (serialised === '') {
                this._setCount(seq, null, false, 'idle');

                return;
            }
            this._setCount(seq, null, false, 'loading');
            this._countTimer = setTimeout(function () {
                self._countTimer = null;
                self._requestCount(serialised, seq);
            }, this.countDebounce);
        },

        /**
         * POSTs one serialised tree to the counting endpoint and routes the answer back.
         *
         * The body is form-encoded because that is what an adminhtml controller reads request
         * params from, and it is handed over as URLSearchParams so the browser sets the matching
         * content type itself — a hand-written header here could only get out of step with the
         * encoding. The form key rides along as a body param for the same reason: adminhtml
         * validates POSTs against it, and a request without one is answered with a redirect rather
         * than JSON.
         *
         * Every failure mode ends in the same place. A non-OK status, a body that is not JSON (an
         * expired session answers with an HTML login page), a rejected fetch and an `{error: true}`
         * payload all mean one thing to the badge — no count is available — and the endpoint
         * deliberately sends no reason, so there is nothing more to distinguish.
         *
         * @param {String} serialised The serialised condition tree to count.
         * @param {Number} seq Sequence id this request answers for.
         * @returns {void}
         */
        _requestCount: function (serialised, seq) {
            var self = this;
            var body = new window.URLSearchParams();

            body.append('conditions', serialised);
            body.append('store_id', String(this.countStoreId));
            body.append('form_key', this._formKey());

            window.fetch(this.countUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {'X-Requested-With': 'XMLHttpRequest'},
                body: body
            })
                .then(function (response) {
                    return response.ok ? response.json() : null;
                })
                .then(function (data) {
                    self._applyCountResponse(seq, data);
                })
                .catch(function () {
                    self._setCount(seq, null, false, 'error');
                });
        },

        /**
         * Turns one endpoint payload into badge state.
         *
         * Only a payload carrying a usable count reads as a count: the contract's `{count, capped}`
         * with a count that is a non-negative number (a numeric string is accepted, since the
         * contract is public and JSON encoders differ on integer types). `{error: true}`, an absent
         * count, a blank or null count and a count that is not a number all render as unavailable
         * rather than as a zero — "nothing matches" and "the count could not be produced" are
         * different statements and must not look alike.
         *
         * @param {Number} seq Sequence id the payload answers for.
         * @param {Object|null} data Decoded endpoint payload, or null when the response was unusable.
         * @returns {void}
         */
        _applyCountResponse: function (seq, data) {
            var raw = data ? data.count : null;
            var count = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);

            if (!data || data.error === true || !isFinite(count) || count < 0) {
                this._setCount(seq, null, false, 'error');

                return;
            }
            this._setCount(seq, Math.floor(count), data.capped === true, 'ready');
        },

        /**
         * Writes one count outcome, unless a newer request has already superseded it.
         *
         * The single write path for all three observables, and the reason overlapping requests are
         * safe: responses can arrive in any order — a broad tree's count takes longer than the
         * narrower one the admin typed next — and a late answer must not overwrite a newer one, nor
         * turn a 'loading' badge back into a number for a rule that has since changed. Everything,
         * the synchronous transitions included, carries its sequence id and is checked here.
         *
         * @param {Number} seq Sequence id the outcome belongs to.
         * @param {Number|null} count Matches, or null when there is no number to show.
         * @param {Boolean} capped Whether the endpoint stopped counting at its cap.
         * @param {String} state 'idle', 'loading', 'ready' or 'error'.
         * @returns {void}
         */
        _setCount: function (seq, count, capped, state) {
            if (seq !== this._countSeq) {
                return;
            }
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
         * True when the match-count badge has something to say.
         *
         * Two independent reasons for silence, both deliberate: no configured endpoint (the
         * consumer cannot count, so the badge does not exist) and the 'idle' state (there is no
         * rule to count). The endpoint check is not redundant — it makes "a consumer that cannot
         * count shows no badge at all" a property of the config rather than a side effect of a
         * state machine.
         *
         * @returns {Boolean}
         */
        countBadgeVisible: function () {
            return this.countUrl !== '' && this.countState() !== 'idle';
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
                return this._countLabelWith(this._formatCount(this.matchCount(), this.countCapped()));
            }

            return '';
        },

        /**
         * The consumer's wording with the formatted number substituted for its `%1` placeholder.
         *
         * A consumer that supplies no wording — or wording without the placeholder, which is the
         * same mistake as supplying none — gets the bare number: the number is the point of the
         * badge, so it degrades to that rather than to a sentence with the count missing. Every
         * occurrence of the placeholder is substituted, and the substitution is a plain split/join
         * so nothing in the number can be read as a replacement pattern.
         *
         * @param {String} formatted The number as the badge prints it.
         * @returns {String}
         */
        _countLabelWith: function (formatted) {
            if (this.countLabel.indexOf('%1') === -1) {
                return formatted;
            }

            return this.countLabel.split('%1').join(formatted);
        },

        /**
         * One count as the badge prints it: thousands grouped, and a trailing `+` when the endpoint
         * stopped counting at its cap.
         *
         * The cap itself is never named here. The endpoint answers with the number it stopped at
         * plus the flag, so "more than this many" is rendered from what arrived — the component
         * cannot claim a threshold of its own, and a retuned cap on the endpoint needs no change on
         * this side. Grouping uses a non-breaking space, so a formatted number never wraps across
         * lines mid-digits, and it is computed rather than delegated to a locale formatter: the
         * badge must read the same in every admin locale until wording is translated as a whole.
         *
         * @param {Number|null} count Matches reported by the endpoint.
         * @param {Boolean} capped Whether the endpoint stopped at its cap.
         * @returns {String} Formatted number, or '' when there is no number.
         */
        _formatCount: function (count, capped) {
            var grouped;

            if (count === null || count === undefined) {
                return '';
            }
            grouped = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

            return capped ? grouped + '+' : grouped;
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
