<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * Contract for the config object an expression-builder form field reads on init.
 *
 * Implement this in the consuming module and pass it to the field as an object argument:
 *
 *     <item name="component" xsi:type="string">Hryvinskyi_UiFormElements/js/form/element/expression-builder</item>
 *     <item name="template" xsi:type="string">Hryvinskyi_UiFormElements/form/element/expression-builder</item>
 *     <item name="builderConfig" xsi:type="object">Acme\Module\Block\Adminhtml\MyConditionsConfig</item>
 *
 * The field posts a single JSON string holding a nested Magento condition tree
 * (`{type, attribute, operator, value, aggregator, conditions: [...]}`). Hydrate it with
 * `$rule->getConditions()->loadArray($tree)` — **not** `loadPost()`, which expects the flat `1--1`
 * form-POST shape and will mangle a nested tree.
 *
 * `ArgumentInterface` is required because the object is resolved as a ui_component argument;
 * `JsonSerializable` is what lets the XML argument be encoded straight into the field's JS config.
 *
 * @api
 */
interface ExpressionBuilderConfigInterface extends ArgumentInterface, \JsonSerializable
{
    /**
     * Condition class used for the tree's Combine nodes, e.g.
     * Magento\CatalogWidget\Model\Rule\Condition\Combine::class.
     */
    public const COMBINE_TYPE = 'combineType';

    /**
     * Absolute admin URL of the value-autocomplete endpoint. The endpoint must validate the requested
     * attribute code against a whitelist — never let an arbitrary code be queried.
     */
    public const SUGGEST_URL = 'suggestUrl';

    /**
     * Shortest query the suggest endpoint will answer, so the type-ahead never asks below it.
     *
     * Optional; the component falls back to its own default when the key is absent. Publish the
     * backing service's own minimum ({@see AttributeValueSuggesterInterface::getMinQueryLength()})
     * rather than a number chosen here: a client querying under the server's threshold gets the
     * same empty list as a genuinely fruitless search and would report "no matches" for input the
     * endpoint never looked at.
     */
    public const SUGGEST_MIN_QUERY = 'suggestMinQuery';

    /**
     * List of selectable field descriptors. Each descriptor carries:
     *  - `type`       string  the condition class, or `product_attribute_picker` for the attribute picker
     *  - `childType`  string  (picker only) the concrete condition class written for each chosen attribute
     *  - `label`      string  what the admin sees in the field dropdown
     *  - `attribute`  string  the condition's attribute code (omitted for the picker)
     *  - `valueType`  string  `text` | `select` | `multiselect` | `product-attribute`
     *  - `operators`  array   list of `{value, label}` pairs offered for this field
     *  - `options`    array   (select/multiselect) list of `{value, label}` pairs
     *  - `attributes` array   (picker only) selectable attributes with their input type and options
     *  - `scalarType` string  optional value-type name pinning the scalar editor/validator (see below)
     *
     * An `operators` entry may additionally carry:
     *  - `validate`        string  name of a registered value validator applied to the row's value while
     *                              this operator is selected — built-ins: `regex`, `number`, `integer`,
     *                              `float`, `email`, `not-empty`. Advisory only: a failing value shows a
     *                              hint under the editor but still saves (the admin may be mid-typing).
     *  - `validateMessage` string  already-translated text shown when that validation fails; without it
     *                              the component's built-in message for the validator is used.
     *
     * Scalar value editors (single-valued operator, no option list) resolve through a value-type
     * registry: built-in names `text`, `integer`, `float`, `date`, `time`, `email`, each contributing its
     * native input attributes and an optional default validator. A picker attribute descriptor — and, for
     * the validator default only, a field descriptor — may pin its type explicitly with `scalarType`;
     * without it the attribute's EAV input type decides, then the operator-set heuristic, then plain text.
     * Both axes are open to consumers through a RequireJS mixin on
     * `Hryvinskyi_UiFormElements/js/form/element/expression-value`, with no edits to this module:
     * `registerValueType(name, definition)` adds or deliberately re-skins a scalar editor type;
     * `registerValidator(name, predicate)` adds a value predicate that `validate` keys and value-type
     * defaults can name.
     */
    public const FIELDS = 'fields';

    /**
     * What the live preview shows when no condition has been added yet.
     *
     * There is no sensible default: an empty rule means "match everything" in some domains and
     * "select nothing" in others, so a shared default would be wrong for half of its consumers.
     * Supply an already-translated string (the config runs in PHP, so wrap it in `__()`).
     */
    public const EMPTY_STATE_MESSAGE = 'emptyStateMessage';

    /**
     * Optional semantic rules — omit the key entirely and the builder applies none: nothing is
     * gated, no warnings are shown.
     *
     * Some domains have fields that only make sense alongside a supporting field: a condition reading a
     * page-scoped context is meaningless unless the surrounding AND-logic pins the request to the matching
     * page kind. Those relationships are domain knowledge, so they are declared here rather than baked into
     * the component. Shape:
     *
     *     self::COHERENCE => [
     *         'contextAttribute' => 'my_context_code',   // the field whose conditions define a node's
     *                                                    // conjunctive context
     *         'contradictionWarning' => (string)__('…'), // shown when a group's guaranteed context
     *                                                    // conditions can never all hold
     *         'requirements' => [
     *             // key = field `type` OR field `attribute` (both are looked up)
     *             'my_dependent_field_type' => [
     *                 'contexts' => ['a_context_value'], // context values that satisfy the dependency
     *                 'warning'  => (string)__('…'),     // shown for a group holding such a field without
     *                                                    // a satisfying context in its conjunctive scope
     *             ],
     *         ],
     *     ],
     *
     * A field whose key appears in `requirements` is offered in a row's dropdown only when the row's
     * conjunctive scope — the conditions guaranteed to hold alongside it through its AND-ancestors,
     * including the closure through nested AND-sibling groups — contains a context condition targeting one
     * of its `contexts`; OR-joined branches never borrow each other's context rows. Warnings are prefixed
     * with the group's depth-first number when more than one group exists. All strings arrive
     * already-translated; a requirement with no `warning` text gates the dropdown but shows nothing.
     *
     * **A field type absent from `requirements` is always selectable** — which is why a consumer with no
     * context field must omit `coherence` entirely, or its own fields would be gated behind a field it
     * never declares.
     */
    public const COHERENCE = 'coherence';

    /**
     * Absolute admin URL of an endpoint that answers how many items the current tree matches.
     *
     * Optional — omit the key and no match count is shown, same philosophy as
     * {@see self::EMPTY_STATE_MESSAGE}: only consumers that can actually count their matches
     * supply it. The endpoint receives POST `conditions` (the serialised tree JSON, exactly the
     * field value) plus `form_key`, and answers `{count: int, capped: bool}` on success or
     * `{error: true}` when the tree cannot be counted.
     */
    public const COUNT_URL = 'countUrl';

    /**
     * Optional consumer wording template for the match-count badge; `%1` is replaced with the
     * number. What is being counted, and in which scope, is the consumer's knowledge — which is why
     * no example phrase is quoted here: one would be exactly the domain vocabulary this module must
     * not carry. Absent while `countUrl` is present, the badge shows just the number. Supply an
     * already-translated string with the `%1` placeholder left intact — the substitution happens
     * client-side.
     */
    public const COUNT_LABEL = 'countLabel';

    /**
     * Optional store id the count runs against; the component posts it back to `countUrl` as
     * `store_id`. Absent → 0 (all websites).
     */
    public const COUNT_STORE_ID = 'countStoreId';

    /**
     * Absolute admin URL of an endpoint that answers one attribute's option list on demand — a
     * thin JSON shell around {@see AttributeOptionsProviderInterface}, guarded by the codes the
     * consumer's own form can author. The component requests it with GET `attribute=<code>` the
     * moment an optioned attribute is selected, and expects `{options: [...]}`.
     *
     * Practically required for the product-attribute picker: descriptors ship without their option
     * lists (`hasOptions` only), so with the key absent an optioned attribute degrades to a
     * free-text editor.
     */
    public const OPTIONS_URL = 'optionsUrl';

    /**
     * The shared operator sets, keyed by input type — publish
     * {@see OperatorSetPolicyInterface::sets()} verbatim. Attribute descriptors name their set
     * (`operatorSet`) instead of embedding the same operator objects hundreds of times; with the
     * key absent every named set is unresolvable and those attributes fall back to their field's
     * operator list.
     */
    public const OPERATOR_SETS = 'operatorSets';

    /**
     * Build the configuration the JS component reads on init.
     *
     * @return array<string, mixed> Keyed by the constants above
     */
    public function getConfig(): array;
}
