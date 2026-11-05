# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-05

### Added
- **Membership operators a consumer names.** An operator descriptor may carry `list: true`; the builder then treats
  that operator like `()`/`!()`: the value editor collects a list, a stored CSV loads as a list, and the list is
  written back as CSV. A rule engine whose operators are `in`, `not_in` or `between` gets list editors without
  re-spelling its operators as `()`. The flag is read from the operators the row offers, so a picker attribute's
  own operator set (`operators` or `operatorSet`) can flag its operators too. Only a literal `true` counts.

## [1.0.0] - 2026-07-27

### Added
- **Admin design system.** The builder is restyled onto the Magento admin's own palette (#4a3f39 ink,
  #666 muted, #adadad control borders, #e3e3e3 hairlines, #f5f5f5 panels, 3px radii) with one accent
  (Magento orange, `#eb5202`) driving selection, focus and structure. The accent's washes, rings and rail tints are
  their own custom properties, so a consumer re-themes the whole ladder by overriding five tokens on one
  selector. Structure that came with it: the ALL/ANY pair is a segmented toggle; every group header
  states its meaning in words ("Every condition below must match") plus a right-aligned contents summary
  ("3 conditions · 1 group"); the builder heading carries a rule-summary chip (condition count, nesting
  depth); rows sit on one shared grid (drag · Field · Operator · Value · actions) captioned once per
  group instead of labelled per row, with the picker's Attribute control stacked inside the Field cell so
  picker rows keep the same columns as every other row; an empty group says inline that it is skipped;
  the preview is the card's own footer band with the match-count pill in the palette's green and the
  warnings in the admin's yellow note; and every glyph (grip, copy, ×, carets, alert, info) is a Lucide
  icon inlined as a CSS mask, coloured by the control it sits in.
- Three visual tunables, sanitised like the numeric ones: `joinerStyle` (`rail` — a tinted line down each
  group's left edge carrying the aggregator word — or `chip`, the word between every two children, or
  `none`), `density` (`comfortable`/`compact` row padding) and `showPreview` (whether the preview block
  renders at all).
- Options dropdowns carry a footer: an advisory line saying what a click does in the current mode, and a
  pointer-only **Done** that closes the list (the keyboard's way out remains `Escape`). The tree's header
  row additionally states how many values the row stores, and the free-text list editor shows a standing
  "Press Enter to add · paste a list" hint.
- Value editors say their **unit**: a `unit` on a field descriptor — or on a picker attribute descriptor —
  renders beside the editor as a muted mono code. `ProductAttributeMetaProviderInterface` now emits it
  from what the input type measures: the base currency code for `price`-input attributes, the configured
  weight unit for `weight`-input ones, `''` otherwise, so both consumers' price and weight conditions
  say their currency and unit with no consumer change.
- An optioned attribute's **single-value editor escalates to the searchable combobox** once that
  attribute's option list passes `searchableSelectThreshold` — the same rule a `select` field's value
  follows, judged per selected attribute, over a fourth registry control (`attribute-value`). A brand
  list gets search and per-entry option ids; a three-option colour keeps the plain `<select>`, and the
  commit is the same verbatim value write, so serialisation is untouched. (The multi-value operators
  already had the searchable pills editor.)
- A **built-in completion nudge** under empty value editors: "Enter a value to complete this condition."
  (or "Pick at least one value…" on list-valued editors), in the same muted advisory style as the
  validators. Not a gate — an empty row still serialises, and what an empty condition means stays the
  consuming rule engine's question — and a consumer wiring `not-empty` outranks it with its own message.
- **Nested groups.** The flat two-level row model is replaced by a recursive group model: a group *is* a
  Combine node carrying an `all`/`any` aggregator, and groups nest to arbitrary depth alongside condition
  rows. Aggregators live on groups, so per-row aggregators and the OR-divider UI are gone and reordering
  never rewrites them. Authoring depth is capped by the new `maxGroupDepth` tunable (5), read by the
  "+ Add group" guard and by both reorder paths, well below the server-side hydration guard.
- Three pure, dependency-light JS modules split by concern, each with behavioural tests that run on plain
  Node (`Test/Js/run.mjs`, no build step): `expression-tree.js` (tree structure and serialisation only),
  `expression-value.js` (leaf-value shapes, pasted-list parsing, the two registries) and
  `expression-options.js` (option-list/tree indexing, breadcrumb paths, capped path search). The Knockout
  component is presentation-only; no user-facing wording lives in the pure modules.
- Scalar value editors are registry data instead of template branches: `expression-value.js` carries a
  value-type registry (`text`, `integer`, `float`, `date`, `time`, `email` — each entry native input
  attributes plus optional default validator and edit/commit transforms) rendered by one generic editor
  branch, and a validator registry gains `integer`, `float` and `email` predicates. Consumers extend or
  re-skin both axes from a RequireJS mixin via `registerValueType()` / `registerValidator()` with no edits
  to this module. Operator entries may carry `validate` and `validateMessage`; attribute and field
  descriptors may pin their type with `scalarType`.
- Collapsible category tree picker. Options carrying `level` and `parent` render as an expandable tree.
  Every row is a checkbox-style toggle — clicking it selects the node, clicking it again deselects it —
  laid out as checkbox, label, count badge, expand caret, with the caret in its own column at the right
  edge so it never competes with the row's own click target. The checkbox is the Lucide `square` family
  inlined as CSS mask data URIs — no network request, theme-coloured — with three states: checked, empty,
  and partially selected when the node itself is not selected but something below it is (said in words in
  the row's tooltip, not only in colour). Parents are bold and carry a badge counting the entries
  below them, and a header row offers whole-tree Expand all / Collapse all — Expand all is withdrawn above
  the new `treeExpandAllLimit` tunable (200 options), where rendering every node at once would hang the
  form, and the surviving action's tooltip says so. Selecting a parent stores that one value: descendants
  are never expanded into the stored list. Typing switches to a flat match list whose entries and pill
  tooltips show the full breadcrumb path, and the search matches any option whose path contains every
  whitespace-separated token. Breadcrumbs and subtree sizes are derived client-side from the `parent`
  chain in one pass and the index is cached per option list — no server-side path map exists, and on a
  multi-thousand-category catalog none should. Flat option lists (no `level`) keep their previous
  behaviour; hierarchy is feature-detected.
- Searchable single-select for long option lists. A list too long to scan renders as a combobox instead of
  a `<select>`: the input filters the options as you type and each entry shows its **code** beneath its
  label, with the chosen option's code beside the label while the control is closed. The code is what makes
  the control necessary rather than merely nicer — a product-attribute list runs to hundreds of entries and
  several of them share a display label, differing only in the prefix of their code, which a native option
  cannot show at all. Search matches every whitespace-separated token against the label *or* the code, so
  one word finds every bearer of a repeated label and a second word naming part of the code narrows to one;
  matches are ranked (exact code, label prefix, code prefix, label body, code body, then token-only) and
  ties keep the list's own order. The picker's Attribute control is always this control; a `select`-valueType
  field escalates to it once its option list passes the new `searchableSelectThreshold` tunable (15), and
  keeps its plain `<select>` below that, where the browser's own type-to-select is the better control. Field
  and Operator are unaffected — they hold a handful of entries each. The search itself is pure and
  node-tested (`expression-options.js`), and the dropdown reuses the existing combobox contract: same focus
  guard, same roving highlight, same ARIA, same truncation hint.
- Multi-value UX: pasting a comma/semicolon/tab/newline-separated list turns it into pills in one write
  (option-backed editors resolve entries against their options by value or label and report what was
  skipped), a clear-all action once a row holds two or more values, pill overflow behind a `+N more`
  toggle, and honest type-ahead states — a loading row, a "No matches" verdict that is only stated once a
  real query has actually been answered, and a truncation hint whose wording interpolates the very cap it
  reports.
- Full keyboard operation and ARIA. Every dropdown variant shares one combobox/listbox contract
  (roving `aria-activedescendant` highlight over exactly the rendered list, `ArrowUp`/`ArrowDown`,
  `Enter`, `Escape`, `Home`/`End` once a highlight exists, `ArrowRight`/`ArrowLeft` to expand/collapse a
  tree parent, `Space` to toggle a tree node's selection), every icon-only button has an accessible name,
  tree entries carry `aria-level`, a single-select's listbox says so rather than claiming to be
  multi-selectable, and — because a row can host two comboboxes — each dropdown names the control it
  belongs to, so one focused input never opens two lists nor commits into the other's model. The
  searchable single-select additionally describes itself with the chosen option's code, since its label may
  be one of several identical ones. And the
  preview, warnings, count badge, paste reports and reorder status are polite live regions rendered from
  first paint rather than inserted with their first message.
- Reordering rows and groups across the whole tree, by pointer drag (pointer-events only, with pointer
  capture and `Escape` to cancel) and by `ArrowUp`/`ArrowDown` on a focused drag handle. Both go through
  one move path over the pure model, both refuse slots that would nest past `maxGroupDepth` — for a
  dragged subtree the check is the slot's depth plus the subtree's own height — and a refused slot is
  simply not a candidate, so the arrow-key walk steps over it to the next reachable gap.
- Match-count badge: a consumer supplying `countUrl` (plus optional `countLabel` and `countStoreId`) gets
  a debounced "matches N" badge above the preview, with loading/unavailable states, thousands grouping, a
  `+` suffix when the endpoint reports its count capped, and sequence-guarded requests so a late answer
  can never overwrite a newer one. Omitting `countUrl` means no badge and no requests at all.
- Shared PHP services, so every form embedding the builder offers identical operator semantics and option
  normalisation: `ProductAttributeMetaProviderInterface` (attribute descriptors from a rule condition's
  raw attribute map), `OperatorSetPolicyInterface` (the operator subset per EAV input type),
  `CategoryTreeOptionsProviderInterface` (tree-shaped category options),
  `AttributeValueSuggesterInterface` (whitelisted value autocomplete, publishing both its whitelist and
  its minimum query length so the endpoint and the UI cannot drift) and `ConditionTreeValidatorInterface`
  (the condition-type whitelist gate plus a depth guard, with the allowed set derivable from the builder
  config). Wired in the module's first `etc/di.xml`; the suggester's default preference ships an empty
  whitelist so a consumer must opt codes in through a virtual type.
- `Test/Unit/ModuleBoundaryTest` — asserts this module names no consumer symbol in its PHP or package
  metadata, the counterpart to `AssetIntegrityTest`'s vocabulary sweep over the assets.
- `i18n/en_US.csv` is generated from the three places this module produces text (`$t()` in the JS,
  `i18n:` in the templates, `__()` in the shipped PHP) and pinned in both directions by the unit suite:
  a missing row and a dead row both fail, as do the row count, the key-equals-value shape and the
  alphabetical order.

### Changed
- **Breaking: attribute option lists are on-demand, and descriptors slimmed accordingly.** The picker's
  attribute descriptors used to embed every attribute's full option list and its own copy of the
  operator descriptors, which on a CNET-sized catalog (~700 pickable attributes, ~3,500 options here)
  front-loaded each form with hundreds of kilobytes of JSON for the one or two lists an admin actually
  opens — and embedded the category tree twice. `ProductAttributeMetaProviderInterface::getAttributes()`
  now emits `hasOptions` (bool) instead of `options`, `operatorSet` (a name into the shared sets a
  consumer publishes once via the new `OperatorSetPolicyInterface::sets()` and the `operatorSets`
  config key) instead of `operators`, and pins `scalarType: float` on numeric-backed text attributes
  (the client used to sniff that from a `>=` entry in the embedded operators). The lists themselves are
  served by the new `AttributeOptionsProviderInterface` through a consumer endpoint named by the new
  `optionsUrl` config key: the component fetches one attribute's list the moment it is selected (or a
  stored rule renders it), shows a "Loading values…" placeholder for the round-trip, de-duplicates
  in-flight requests per code and never retries a failed one — that row degrades to the option-less
  editors. The normalisation is byte-identical to what was embedded, so authored rules serialise
  exactly as before. Both in-repo consumers ship the endpoint (`row/attributeOptions`,
  `banner/attributeOptions`), guarded by the codes their own forms can author; a consumer that also
  processes descriptors must adapt to the new keys, and one that supplies no `optionsUrl` gets
  free-text editors for optioned attributes.
- A tree row now reads caret first — expand caret, checkbox, label, count badge — matching where every
  tree UI keeps its caret; the per-level indent tightened to match (roots sit almost flush, one caret
  width per level). Behaviour is unchanged: the row still toggles, the caret still only expands.
- The group heading wording changed from "Match ALL/ANY of the following" to "Every condition below must
  match" / "At least one condition below must match" — the same claim the aggregator tooltips already
  made, now made where the admin actually reads it.
- Advisory value hints render muted with an info glyph instead of alarm red: the value still serialises
  while the admin is mid-typing, and a hint styled as an error read as a save gate that does not exist.
- Format validators (`number`, `integer`, `float`, `email`, `regex`) now pass blank input
  (''/null/whitespace-only) — they judge the format of present input only, mirroring native HTML5
  validation semantics, so a pristine value editor shows no error. Flagging emptiness is exclusively the
  `not-empty` validator's responsibility.
- A consumer's form-XML `label` is no longer discarded. It renders as the builder's own heading, while
  the standard Magento label/control wrap stays suppressed either way — this element replaces the
  standard field template, so that wrap would only reappear as a stray heading around a widget that is
  not an input.
- The component's numeric tunables (`maxGroupDepth`, `optionMatchCap`, `pillCollapseLimit`,
  `pasteNoticeTimeout`, `suggestDebounce`, `suggestMinQuery`, `countDebounce`) moved into `defaults`, so a
  form can retune any of them per field from its ui_component XML. Each is sanitised once on init and a
  nonsense override degrades to the shipped value instead of sending a `NaN` into a slice bound, a timer
  delay or a query threshold.
- `suggestMinQuery` is now server-authoritative: a `builderConfig.suggestMinQuery` (published from
  `AttributeValueSuggesterInterface::getMinQueryLength()`) outranks the shipped default and any XML
  override, so the UI can never ask below what the endpoint answers and report "no matches" for input the
  backend never looked at.
- **Breaking:** the `coherence` config shape is generalised. `pageTypeAttribute` is renamed
  `contextAttribute`; the `categoryAttribute` special case is removed; the named `warnings` map is replaced
  by a top-level `contradictionWarning` plus a per-requirement `warning` — each `requirements` entry is now
  a `{contexts, warning}` object keyed by field `type` or field `attribute`. Consumers supplying `coherence`
  must re-emit it in the new shape; serialised condition trees are unaffected.

### Fixed
- **A searchable select only answered clicks on its input half.** The chosen option's code sits beside
  the input, and for a long attribute code that span — plus the chevron and the padding — is most of the
  control's face, all of it dead to the pointer. The whole control now focuses the input on click, like
  the `<select>` it replaces; a click on the input itself is left to the browser, so caret placement
  still works.
- **Stored trees that were not disjunctive-normal-form were silently dropped on load.** The flat loader
  only understood an OR-root of AND-Combines; a nested Combine under an `all` root had no place in the
  row model and vanished, taking its conditions with it on the next save. The recursive model is 1:1 with
  the serialisation, so any stored shape loads losslessly and round-trips byte-identical.
- **A bare `Enter` in a value editor submitted the admin form.** Those editors take their values from the
  list, so `Enter` with nothing highlighted had nothing to commit and reached the form instead, saving
  whatever was on screen. It is now swallowed — except in a free-text list editor, where it commits the
  typed text as a pill.
- Destroying the element releases everything it holds outside its own object graph: every `ko.computed`
  it created, the pending count, focus, paste and per-row suggest timers at any depth, and a drag's
  document-level `Escape` listener and pointer capture. A form that destroys and rebuilds a field — a
  modal closing, a dynamic-rows entry being removed — previously left live computeds re-walking a
  discarded tree and timers firing into a dead view-model.
- The keyboard highlight can no longer point at a stale entry: every write to a suggestion list clears
  it, so `Enter` commits the value that was actually highlighted rather than whatever the asynchronous
  answer moved into that position.
- **Every rule that had ever been saved by PHP opened dirty.** Two keys are written by the rule framework
  in a shape it does not read back, and the serialiser was emitting constants for both: it now echoes what
  each leaf was loaded with. `is_value_processed` is written from a flag read under the different name
  `is_value_parsed`, so a PHP-persisted leaf carries `false` where a freshly authored one carries `null`;
  and a decimal-backed attribute's value comes back re-encoded as an unquoted JSON number, which is
  written back unquoted for as long as the row still holds exactly that number. Both retentions are
  carried through row duplication, so a copy still serialises identically to its source. See the README
  for the one remaining exception (a cleared rule).
- The membership operator set (`()`, `!()`) had drifted into eight literal re-spellings across the
  component and the group template, next to the single definition in `expression-value.js` that exists to
  prevent exactly that. Every check now routes through one `rowUsesListOperator()` delegation, and the
  asset guard fails on any re-spelling — a consumer registering a third membership operator would
  otherwise have got list-shaped serialisation behind a single-value editor, replacing a stored list with
  one entry on the next save.
- **The field could not be hidden.** The element overrides `template`, not just `elementTmpl`, so
  `Magento_Ui`'s `form/field.html` — the only place `visible` was ever bound — never rendered, and the
  widget's own root bound nothing in its place. A host form asking for the field to be hidden, whether by a
  `switcherConfig` rule or by the field's own `visible` setting, was silently ignored: the observable
  flipped, nothing errored, and the builder stayed on screen on first paint and after every change. The root
  now binds `visible`. Hiding also takes a field out of validation, so a `validation` rule on the builder
  can no longer block a save on a form that has hidden it.

### Added
- Expression-builder `ui_component` admin form element: Knockout component, template and stylesheet, with
  mixed AND/OR grouping, select/multiselect/free-text values, a product-attribute picker whose operators adapt
  to the attribute's EAV input type, and value autocomplete against a consumer-provided endpoint.
- `Api/ExpressionBuilderConfigInterface` — the contract a consuming module implements to declare selectable
  fields, operators and value sources.
- `Test/Unit/AssetIntegrityTest` — guards the asset paths, the `ufe-` class contract, and the nested-tree
  serialisation shape that consumers hydrate with `Combine::loadArray()`.

### Changed
- Wording and semantic rules are now consumer-supplied via `emptyStateMessage` and `coherence` instead of
  hardcoded. The component previously carried one consumer's attribute codes (`bz_page_type`,
  `bz_page_category_ids`) and wording, which gave a second consumer meaningless warnings and gated its
  Product Attribute field behind a context field it never declares.
- Extracted from `Hryvinskyi_BannerZone`, which owned these assets. CSS classes and custom properties were
  re-prefixed `bz-` → `ufe-`. `Hryvinskyi_BannerZone` and `Hryvinskyi_ProductShowcase` now both depend on this
  module instead of on each other.
