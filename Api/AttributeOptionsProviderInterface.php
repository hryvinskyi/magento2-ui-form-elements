<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

/**
 * On-demand option lists for the expression builder's product-attribute picker.
 *
 * The picker's attribute descriptors deliberately ship WITHOUT their option lists: a catalog can
 * carry hundreds of optioned attributes and thousands of options, and embedding them all into a
 * form's page config front-loads megabytes of JSON for lists the admin will never open. Instead a
 * descriptor says only that a list exists (`hasOptions`), and the component asks a consumer's
 * endpoint — a thin JSON shell around this service — for one attribute's list at the moment that
 * attribute is actually selected.
 *
 * The normalisation is byte-identical to what the descriptors used to embed, so a rule authored
 * against a lazily-loaded list serialises exactly as it always did.
 *
 * @api
 */
interface AttributeOptionsProviderInterface
{
    /**
     * The normalised option list of one product attribute.
     *
     * `category_ids` is special-cased to the tree-shaped category options (entries additionally
     * carry `level` and `parent`), exactly as the attribute descriptors used to embed them. Every
     * lookup is defensive: an unknown code, a non-optioned input type, a broken source model or a
     * throwing option read all answer an empty list — never an exception — so an endpoint can pass
     * the result through unconditionally. Guarding WHICH codes may be asked at all is the calling
     * endpoint's job, against the set its own form can author.
     *
     * @param string $attributeCode Product attribute code
     * @return list<array{value: string, label: string, level?: int, parent?: string}> Options, or []
     */
    public function getOptions(string $attributeCode): array;
}
