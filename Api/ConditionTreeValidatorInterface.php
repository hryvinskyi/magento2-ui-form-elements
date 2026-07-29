<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

/**
 * Whitelist gate for serialised condition trees, applied before any hydration.
 *
 * `Magento\Rule\Model\Condition\Combine::loadArray()` instantiates whatever class name each node's
 * `type` carries, via the condition factory and ultimately the ObjectManager. The expression
 * builder's field value is a documented public JSON contract that travels through form POSTs and a
 * database column, so every path that feeds a stored or posted tree into `loadArray()` must first
 * pass it through this validator: a node naming a class outside the consumer's own declared set is
 * rejected as a whole, and the caller decides what "rejected" means on its path (keep the previous
 * tree, hide the entity, return no products, ...).
 *
 * The allowed set is derived from the same builder config that renders the form
 * ({@see ExpressionBuilderConfigInterface}), so the whitelist can never drift from what the UI is
 * able to author. Consumers whose config build runs queries should publish the derived list as a
 * dependency-free class constant and pin it to {@see self::allowedTypesFromConfig()} with a unit
 * test, rather than building the config on a hot path.
 *
 * @api
 */
interface ConditionTreeValidatorInterface
{
    /**
     * Deepest node level accepted by default.
     *
     * The authoring UI nests groups far shallower than this; the guard exists so a hand-crafted
     * payload cannot drive the recursive hydration in `loadArray()` (and every recursive consumer
     * of the tree) arbitrarily deep. It is denial-of-service headroom, not a UX limit.
     */
    public const DEFAULT_MAX_DEPTH = 10;

    /**
     * Whether every node of the tree carries an allowed condition type.
     *
     * Rules, applied to the root and to every entry of every `conditions` list at any depth:
     *  - the node must be an array holding a string `type` contained in `$allowedTypes`
     *    (strict comparison — no coercion, no substring matching);
     *  - a `conditions` key, when present, must be an array, and each of its entries must itself
     *    be a valid node — a scalar or otherwise non-array entry invalidates the whole tree;
     *  - nodes nested deeper than `$maxDepth` levels (the root counts as level one) invalidate
     *    the whole tree.
     *
     * An empty tree (`[]`) is valid: it means "no rule authored", which every consumer already
     * handles on its own terms. A childless root node is equally valid — zero children is a
     * legitimate stored state, not an error.
     *
     * @param array<int|string, mixed> $tree Decoded condition tree (a nested node array), or []
     * @param list<string> $allowedTypes Condition class names the consumer's config declares
     * @param int $maxDepth Deepest accepted node level; the root node is level one
     * @return bool True when the whole tree is safe to hand to loadArray()
     */
    public function isValid(array $tree, array $allowedTypes, int $maxDepth = self::DEFAULT_MAX_DEPTH): bool;

    /**
     * Derive the allowed condition types from a builder config array.
     *
     * Collects, in this order: the `combineType`, every field's `type`, and every field's
     * `childType`. The attribute picker's own `type` is the component-vocabulary string
     * `product_attribute_picker` — it never appears in a serialised tree (the picker writes its
     * `childType` instead), so it is skipped rather than whitelisted. The result is deduplicated
     * and reindexed.
     *
     * @param array<string, mixed> $builderConfig The array {@see ExpressionBuilderConfigInterface::getConfig()} returns
     * @return list<string> Deduplicated condition class names the config can author
     */
    public function allowedTypesFromConfig(array $builderConfig): array;
}
