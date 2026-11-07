<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\AttributeOptionsProviderInterface;
use Hryvinskyi\UiFormElements\Api\CategoryTreeOptionsProviderInterface;
use Magento\Catalog\Model\Product;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute\AbstractAttribute;
use Magento\Eav\Model\Entity\Attribute\Source\Table as TableSource;

/**
 * Reads one attribute's option list on demand, with the exact normalisation the attribute
 * descriptors used to embed inline.
 *
 * This is the option half of what {@see ProductAttributeMetaProvider} did eagerly: the meta
 * provider now only says whether a list exists, and this service answers what is in it — for one
 * code, at the moment the picker actually needs it. Every lookup is defensive: a broken source
 * model degrades to an empty list instead of failing the request.
 */
class AttributeOptionsProvider implements AttributeOptionsProviderInterface
{
    /**
     * The synthetic rule attribute for category membership — not a real EAV attribute, so the EAV
     * lookup would answer nothing when it must answer the category tree.
     */
    private const CATEGORY_IDS_CODE = 'category_ids';

    /**
     * Input types whose source model supplies a finite, pickable option list.
     */
    private const OPTION_INPUT_TYPES = ['select', 'multiselect', 'boolean'];

    /**
     * @param EavConfig $eavConfig EAV config for per-attribute introspection
     * @param CategoryTreeOptionsProviderInterface $categoryTreeOptionsProvider Tree-shaped category options
     */
    public function __construct(
        private readonly EavConfig $eavConfig,
        private readonly CategoryTreeOptionsProviderInterface $categoryTreeOptionsProvider
    ) {
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function getOptions(string $attributeCode): array
    {
        if ($attributeCode === self::CATEGORY_IDS_CODE) {
            return $this->categoryTreeOptionsProvider->getOptions();
        }

        try {
            $attribute = $this->eavConfig->getAttribute(Product::ENTITY, $attributeCode);
        } catch (\Throwable) {
            return [];
        }

        if (!$attribute->getId()) {
            return [];
        }

        return $this->sourceOptions($attribute, (string)$attribute->getFrontendInput());
    }

    /**
     * Read the attribute's predefined option list, normalised to string values and labels.
     *
     * Only option-backed input types are read at all. Table-backed sources are asked without the
     * empty option and with admin/default labels; other sources take no parameters, and the empty
     * option they might emit is dropped by the value filter below either way. Options with an
     * empty or array value (option groups), or a value with no string form, are skipped; a label
     * with no string form falls back to the value. Any source failure collapses to an empty list
     * so one broken source model cannot take down the endpoint.
     *
     * @param AbstractAttribute $attribute Attribute whose source to read
     * @param string $inputType Its frontend input type
     * @return list<array{value: string, label: string}> Normalised options
     */
    private function sourceOptions(AbstractAttribute $attribute, string $inputType): array
    {
        if (!in_array($inputType, self::OPTION_INPUT_TYPES, true)) {
            return [];
        }

        try {
            $source = $attribute->getSource();
            $rawOptions = $source instanceof TableSource
                ? $source->getAllOptions(false, true)
                : $source->getAllOptions();
        } catch (\Throwable) {
            return [];
        }

        $options = [];
        foreach ($rawOptions as $option) {
            if (!is_array($option)) {
                continue;
            }
            $rawValue = $option['value'] ?? null;
            $value = $rawValue === '' ? null : $this->text($rawValue);
            if ($value === null) {
                continue;
            }
            $options[] = [
                'value' => $value,
                'label' => $this->text($option['label'] ?? null) ?? $value,
            ];
        }

        return $options;
    }

    /**
     * The string form of an option's value or label, or null when it has none.
     *
     * Scalars and Phrase-like objects render as text; null, arrays (option groups) and objects
     * without a string form have no text.
     *
     * @param mixed $value Raw value or label from the source model
     * @return string|null Its text, or null
     */
    private function text(mixed $value): ?string
    {
        return is_scalar($value) || $value instanceof \Stringable ? (string)$value : null;
    }
}
