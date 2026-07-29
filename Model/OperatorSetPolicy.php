<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\OperatorSetPolicyInterface;
use Magento\Framework\Phrase;

/**
 * Maps attribute input types to the operator subsets that actually change matching behaviour.
 *
 * Multiselect attributes get membership operators only: Magento's rule validators collapse
 * equality and containment into the same set-intersection check there, so anything beyond
 * is-in / is-not-in is noise. Numeric and date types get the four comparison operators on top of
 * equality, matching what Magento's own rule forms offer for those types.
 */
final class OperatorSetPolicy implements OperatorSetPolicyInterface
{
    /**
     * @inheritDoc
     */
    #[\Override]
    public function forInputType(string $inputType): ?array
    {
        return match ($inputType) {
            'boolean' => $this->equality(),
            'select' => array_merge($this->equality(), $this->choice()),
            'multiselect' => $this->membership(),
            'price', 'decimal', 'weight' => $this->numeric(),
            'date', 'datetime' => $this->date(),
            default => null,
        };
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function sets(): array
    {
        $types = ['boolean', 'select', 'multiselect', 'price', 'decimal', 'weight', 'date', 'datetime'];
        $sets = [];
        foreach ($types as $type) {
            $set = $this->forInputType($type);
            if ($set !== null) {
                $sets[$type] = $set;
            }
        }

        return $sets;
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function membership(): array
    {
        return [
            ['value' => '()', 'label' => __('is in')],
            ['value' => '!()', 'label' => __('is not in')],
        ];
    }

    /**
     * The equality pair shared by boolean and select types.
     *
     * @return list<array{value: string, label: Phrase}> Equality operator descriptors
     */
    private function equality(): array
    {
        return [
            ['value' => '==', 'label' => __('is')],
            ['value' => '!=', 'label' => __('is not')],
        ];
    }

    /**
     * The one-of pair a single-value select adds on top of equality.
     *
     * @return list<array{value: string, label: Phrase}> Choice operator descriptors
     */
    private function choice(): array
    {
        return [
            ['value' => '()', 'label' => __('is one of')],
            ['value' => '!()', 'label' => __('is not one of')],
        ];
    }

    /**
     * Equality plus the four comparisons for numeric types (price, weight, decimal/int-backed).
     *
     * @return list<array{value: string, label: Phrase}> Numeric operator descriptors
     */
    private function numeric(): array
    {
        return [
            ['value' => '==', 'label' => __('is')],
            ['value' => '!=', 'label' => __('is not')],
            ['value' => '>=', 'label' => __('equals or greater than')],
            ['value' => '>', 'label' => __('greater than')],
            ['value' => '<=', 'label' => __('equals or less than')],
            ['value' => '<', 'label' => __('less than')],
        ];
    }

    /**
     * The date set: equality plus the four comparisons, without is-not — matching the operators
     * Magento's own rule forms offer for date attributes.
     *
     * @return list<array{value: string, label: Phrase}> Date operator descriptors
     */
    private function date(): array
    {
        return [
            ['value' => '==', 'label' => __('is')],
            ['value' => '>=', 'label' => __('equals or greater than')],
            ['value' => '<=', 'label' => __('equals or less than')],
            ['value' => '>', 'label' => __('greater than')],
            ['value' => '<', 'label' => __('less than')],
        ];
    }
}
