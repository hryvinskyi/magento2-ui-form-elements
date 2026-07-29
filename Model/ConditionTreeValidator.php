<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\ConditionTreeValidatorInterface;
use Hryvinskyi\UiFormElements\Api\ExpressionBuilderConfigInterface;

/**
 * Pure recursive implementation of the condition-tree whitelist gate.
 *
 * Stateless and dependency-free on purpose: the validator runs on save paths and on storefront
 * render paths alike, so it must cost nothing to construct and must never pull adminhtml
 * collaborators into frontend execution.
 */
final class ConditionTreeValidator implements ConditionTreeValidatorInterface
{
    /**
     * The attribute picker's own field type — component vocabulary, never a loadable class.
     *
     * A serialised tree never carries this string (the picker's rows are written with the field's
     * `childType`), so {@see self::allowedTypesFromConfig()} skips it instead of whitelisting it.
     */
    private const ATTRIBUTE_PICKER_TYPE = 'product_attribute_picker';

    /**
     * @inheritDoc
     */
    #[\Override]
    public function isValid(array $tree, array $allowedTypes, int $maxDepth = self::DEFAULT_MAX_DEPTH): bool
    {
        if ($tree === []) {
            // "No rule authored" — nothing will be hydrated, so there is nothing to reject.
            return true;
        }

        return $this->isValidNode($tree, $allowedTypes, $maxDepth, 1);
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function allowedTypesFromConfig(array $builderConfig): array
    {
        $types = [];

        $combineType = $builderConfig[ExpressionBuilderConfigInterface::COMBINE_TYPE] ?? null;
        if (is_string($combineType) && $combineType !== '') {
            $types[] = $combineType;
        }

        $fields = $builderConfig[ExpressionBuilderConfigInterface::FIELDS] ?? [];
        if (is_array($fields)) {
            foreach ($fields as $field) {
                if (!is_array($field)) {
                    continue;
                }

                $type = $field['type'] ?? null;
                if (is_string($type) && $type !== '' && $type !== self::ATTRIBUTE_PICKER_TYPE) {
                    $types[] = $type;
                }

                $childType = $field['childType'] ?? null;
                if (is_string($childType) && $childType !== '') {
                    $types[] = $childType;
                }
            }
        }

        return array_values(array_unique($types));
    }

    /**
     * Validate one node and, recursively, everything below it.
     *
     * @param array<int|string, mixed> $node Tree node (combine or leaf)
     * @param list<string> $allowedTypes Condition class names accepted for the `type` key
     * @param int $maxDepth Deepest accepted node level
     * @param int $depth Level of this node; the root node is level one
     * @return bool True when this node and its whole subtree are acceptable
     */
    private function isValidNode(array $node, array $allowedTypes, int $maxDepth, int $depth): bool
    {
        if ($depth > $maxDepth) {
            return false;
        }

        $type = $node['type'] ?? null;
        if (!is_string($type) || !in_array($type, $allowedTypes, true)) {
            return false;
        }

        if (!array_key_exists('conditions', $node)) {
            // A leaf, or a childless combine — a legitimate stored state either way.
            return true;
        }

        $children = $node['conditions'];
        if (!is_array($children)) {
            // A serialiser only ever writes an array here; anything else is a tampered tree.
            return false;
        }

        foreach ($children as $child) {
            if (!is_array($child) || !$this->isValidNode($child, $allowedTypes, $maxDepth, $depth + 1)) {
                return false;
            }
        }

        return true;
    }
}
