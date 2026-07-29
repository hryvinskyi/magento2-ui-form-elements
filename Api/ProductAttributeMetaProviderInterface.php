<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

/**
 * Builds the attribute descriptors behind the expression builder's product-attribute picker.
 *
 * Consumers hand in the raw `code => label` map their rule condition reports and get back the
 * enriched descriptor list the component's `attributes` key consumes: EAV input type, whether a
 * finite option list exists, the NAME of the per-input-type operator set, whether the consumer's
 * autocomplete endpoint may be queried for the attribute's values, and the unit a number is
 * entered in. Deliberately no option lists and no embedded operator arrays — options are served on
 * demand by {@see AttributeOptionsProviderInterface} through a consumer endpoint, and operator
 * sets are published once via {@see OperatorSetPolicyInterface::sets()}, because a catalog can
 * carry hundreds of pickable attributes and the repetition was most of a form's page weight.
 * Keeping the introspection here — instead of in every consumer — is what keeps the offered
 * operators and option normalisation identical across all forms that embed the builder.
 *
 * @api
 */
interface ProductAttributeMetaProviderInterface
{
    /**
     * Describe every selectable attribute of a product rule condition.
     *
     * `category_ids` is special-cased: it is a synthetic rule attribute, not a real EAV one, so it
     * reads as an optioned multiselect (its list — the tree-shaped category options — comes from
     * the on-demand provider like every other list) with the membership operator set and never a
     * suggest flag. Attributes with an empty code are skipped. Unknown or non-EAV attributes
     * (sku, …) fall back to free text with a null operator set, which tells the component to use
     * its field-level operator list.
     *
     * `unit` says what the attribute's number is entered in, rendered beside its value editor:
     * the base currency code for `price`-input attributes, the configured weight unit for
     * `weight`-input ones, '' everywhere else. A code, not a phrase — never translated.
     *
     * @param array<int|string, mixed> $attributeOptions `code => label` map as returned by a rule
     *     condition's `loadAttributeOptions()`; labels may be strings or Phrase objects — anything
     *     else falls back to the code
     * @param list<string> $suggestableCodes Attribute codes the consumer's value-autocomplete
     *     endpoint accepts (its whitelist)
     * @return list<array{value: string, label: string, inputType: string, hasOptions: bool, suggest: bool, operatorSet: string|null, unit: string, scalarType?: string}>
     *     Attribute descriptors in the input map's order; `scalarType` appears only where the
     *     input type alone would resolve the wrong editor (numeric-backed text attributes)
     */
    public function getAttributes(array $attributeOptions, array $suggestableCodes): array;
}
