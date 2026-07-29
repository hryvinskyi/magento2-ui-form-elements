<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

use Magento\Framework\Phrase;

/**
 * Single source of the operator subsets the expression builder offers per attribute input type.
 *
 * Magento's rule validators do not honour every operator for every input type — most notably, for a
 * multiselect attribute the equality and containment operators silently collapse into one
 * set-intersection check, so offering them only misleads the admin into believing they behave
 * differently. Centralising the subsets here keeps every consumer of the expression builder aligned
 * on the operators that actually change matching behaviour, and is also where numeric and date
 * attributes get their comparison operators.
 *
 * @api
 */
interface OperatorSetPolicyInterface
{
    /**
     * Operator descriptors for an attribute input type, or null when no meaningful subset exists for
     * that type and the caller should fall back to its field-level operator list.
     *
     * Recognised input types: `boolean`, `select`, `multiselect`, `price`, `decimal`, `weight`,
     * `date`, `datetime`. A text attribute stored in a numeric backend column should be passed as
     * `decimal` so it receives the comparison set.
     *
     * @param string $inputType Attribute frontend input type (or `decimal` for numeric-backed text)
     * @return list<array{value: string, label: Phrase}>|null Operator descriptors, or null for
     *     unrecognised types
     */
    public function forInputType(string $inputType): ?array;

    /**
     * The membership pair — `()` "is in" and `!()` "is not in" — the only operators whose behaviour
     * differs from one another on multiselect attributes such as category assignments.
     *
     * @return list<array{value: string, label: Phrase}> Exactly the two membership operator descriptors
     */
    public function membership(): array;

    /**
     * Every named operator set at once, keyed by the input types {@see forInputType()} recognises.
     *
     * This is what a consumer publishes ONCE into its builder config (`operatorSets`), so attribute
     * descriptors can carry a set NAME (`operatorSet`) instead of each repeating the same handful of
     * operator objects — on a catalog with hundreds of pickable attributes, the repetition was most
     * of the descriptors' weight. Types that share a set (price/decimal/weight, date/datetime)
     * appear as separate keys with equal contents: the descriptor names the type it was judged by,
     * and aliasing keys is cheaper than a canonicalisation both sides would have to agree on.
     *
     * @return array<string, list<array{value: string, label: Phrase}>> Set per recognised input type
     */
    public function sets(): array;
}
