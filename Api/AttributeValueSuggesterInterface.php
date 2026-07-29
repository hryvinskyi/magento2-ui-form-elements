<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

/**
 * Attribute-value autocomplete behind the expression builder's suggest dropdown.
 *
 * One service owns the whole lookup: the whitelist of queryable attribute codes, the minimum query
 * length, the LIKE query over the product collection and the distinct-value folding. The whitelist
 * is fixed at construction — consumers supply their codes through DI wiring (see the module's
 * etc/di.xml), so no calling code can widen the set of queryable attributes at runtime.
 *
 * @api
 */
interface AttributeValueSuggesterInterface
{
    /**
     * Distinct product attribute values matching the query, ready for a type-ahead dropdown.
     *
     * Guards run before any query: an attribute code outside the construction-time whitelist, or a
     * query whose trimmed length is below the minimum, short-circuits to an empty list without
     * touching the database. Matches are folded to distinct non-empty values ordered ascending,
     * capped at the maximum result count, each entry using the value as its own label. Never
     * throws: any internal failure (broken attribute, database error, …) collapses to an empty
     * list so an autocomplete endpoint can pass the result through unconditionally.
     *
     * @param string $attributeCode Product attribute code to look values up for
     * @param string $query Substring to match; trimmed before the length guard and the lookup
     * @return list<array{value: string, label: string}> Distinct matches; empty on guard failure or error
     */
    public function suggest(string $attributeCode, string $query): array;

    /**
     * The construction-time whitelist of attribute codes suggest() will query.
     *
     * Consumers publish this same list wherever the UI needs to know which attributes are
     * autocompletable (e.g. the suggest flags in the attribute picker's metadata), so the endpoint
     * whitelist and the UI affordance can never drift apart.
     *
     * @return list<string> Whitelisted attribute codes as normalised at construction
     */
    public function getSuggestableCodes(): array;

    /**
     * The shortest query the endpoint answers; the UI must not request below it.
     *
     * Same charter as {@see self::getSuggestableCodes()}: a threshold the service enforces and the
     * UI merely guesses at is a threshold that drifts. Below it suggest() short-circuits to an
     * empty list without querying, which a client that asked anyway cannot tell apart from "nothing
     * matches" — so a consumer publishes this value to the UI (see
     * {@see ExpressionBuilderConfigInterface::SUGGEST_MIN_QUERY}) and the type-ahead stays silent
     * until a query can actually be answered.
     *
     * @return int Minimum trimmed query length, as fixed at construction
     */
    public function getMinQueryLength(): int;
}
