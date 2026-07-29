<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\OperatorSetPolicyInterface;
use Hryvinskyi\UiFormElements\Api\ProductAttributeMetaProviderInterface;
use Magento\Catalog\Model\Product;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute\AbstractAttribute;
use Magento\Framework\App\Config\ScopeConfigInterface;

/**
 * Enriches a rule condition's raw attribute map with EAV metadata for the attribute picker.
 *
 * Deliberately option-free: a descriptor says only WHETHER an attribute has a finite option list
 * (`hasOptions`) — the list itself is served on demand by {@see AttributeOptionsProvider} through a
 * consumer endpoint, because a catalog can carry hundreds of optioned attributes and thousands of
 * options, and a form must not front-load them all for the one or two the admin will open.
 * Operators are named, not embedded, for the same reason: `operatorSet` keys into the shared
 * per-input-type sets a consumer publishes once, instead of repeating the same six descriptors on
 * every attribute.
 *
 * Every lookup is defensive: a missing attribute or a broken EAV record degrades that attribute to
 * free text instead of failing the whole form — the picker must render even when one attribute's
 * EAV setup is unhealthy.
 */
final class ProductAttributeMetaProvider implements ProductAttributeMetaProviderInterface
{
    /**
     * The synthetic rule attribute for category membership — not a real EAV attribute, so the EAV
     * lookup would degrade it to free text when it must offer the category tree instead.
     */
    private const CATEGORY_IDS_CODE = 'category_ids';

    /**
     * Backend column types that make a text-input attribute numeric for operator purposes.
     */
    private const NUMERIC_BACKEND_TYPES = ['decimal', 'int'];

    /**
     * Input types whose source model supplies a finite, pickable option list.
     */
    private const OPTION_INPUT_TYPES = ['select', 'multiselect', 'boolean'];

    /**
     * Config path of the base currency code — the currency catalog prices are stored in, which is
     * therefore the currency a price condition's value is entered in.
     */
    private const XML_PATH_BASE_CURRENCY = 'currency/options/base';

    /**
     * Config path of the catalog's weight unit.
     */
    private const XML_PATH_WEIGHT_UNIT = 'general/locale/weight_unit';

    /**
     * @param EavConfig $eavConfig EAV config for per-attribute introspection
     * @param OperatorSetPolicyInterface $operatorSetPolicy Operator subsets per input type
     * @param ScopeConfigInterface $scopeConfig Default-scope config for the currency and weight units
     */
    public function __construct(
        private readonly EavConfig $eavConfig,
        private readonly OperatorSetPolicyInterface $operatorSetPolicy,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function getAttributes(array $attributeOptions, array $suggestableCodes): array
    {
        $out = [];
        foreach ($attributeOptions as $code => $label) {
            $code = (string)$code;
            if ($code === '') {
                continue;
            }
            $info = $this->attributeInfo($code, in_array($code, $suggestableCodes, true));
            $descriptor = [
                'value' => $code,
                'label' => is_scalar($label) || $label instanceof \Stringable ? (string)$label : $code,
                'inputType' => $info['inputType'],
                'hasOptions' => $info['hasOptions'],
                'suggest' => $info['suggest'],
                'operatorSet' => $info['operatorSet'],
                'unit' => $this->unitFor($info['inputType']),
            ];
            if ($info['scalarType'] !== null) {
                $descriptor['scalarType'] = $info['scalarType'];
            }
            $out[] = $descriptor;
        }

        return $out;
    }

    /**
     * Inspect one attribute: input type, whether an option list exists, suggest flag, the name of
     * its operator set, and an explicit scalar type where the input type alone would resolve the
     * wrong one.
     *
     * `hasOptions` is judged by the input type alone, never by reading the source model: whether
     * the list is worth an editor is the component's question once the list actually arrives, and
     * a source model broken enough to answer nothing then degrades the row to free text after one
     * empty response instead of costing every form render an option read.
     *
     * `scalarType` is pinned only for the text-input-numeric-backend case: the client-side
     * resolution used to sniff a `>=` entry out of the embedded operator array, and with operators
     * now named rather than embedded there is nothing left to sniff — so the provider states
     * `float` outright, which is rule one of the same resolution.
     *
     * @param string $code Attribute code
     * @param bool $suggest Whether the consumer's suggest endpoint accepts this code
     * @return array{inputType: string, hasOptions: bool, suggest: bool, operatorSet: string|null, scalarType: string|null}
     */
    private function attributeInfo(string $code, bool $suggest): array
    {
        if ($code === self::CATEGORY_IDS_CODE) {
            return [
                'inputType' => 'multiselect',
                'hasOptions' => true,
                'suggest' => false,
                'operatorSet' => 'multiselect',
                'scalarType' => null,
            ];
        }

        try {
            $attribute = $this->eavConfig->getAttribute(Product::ENTITY, $code);
        } catch (\Throwable) {
            $attribute = null;
        }

        if ($attribute === null || !$attribute->getId()) {
            return [
                'inputType' => 'text',
                'hasOptions' => false,
                'suggest' => $suggest,
                'operatorSet' => null,
                'scalarType' => null,
            ];
        }

        $inputType = (string)$attribute->getFrontendInput();
        if ($inputType === '') {
            $inputType = 'text';
        }
        $operatorType = $this->operatorInputType($attribute, $inputType);

        return [
            'inputType' => $inputType,
            'hasOptions' => in_array($inputType, self::OPTION_INPUT_TYPES, true),
            'suggest' => $suggest,
            'operatorSet' => $this->operatorSetPolicy->forInputType($operatorType) !== null ? $operatorType : null,
            'scalarType' => $inputType === 'text' && $operatorType === 'decimal' ? 'float' : null,
        ];
    }

    /**
     * The unit an attribute's value is entered in, from what its input type measures: prices are
     * entered in the base currency (the one catalog prices are stored in — per-store display
     * currencies are a storefront conversion this admin value never sees), weights in the
     * configured weight unit. Everything else measures nothing and gets ''.
     *
     * A code, not a phrase: currency and weight-unit codes are identifiers and are rendered as
     * they are, so nothing here is translated.
     *
     * @param string $inputType Frontend input type of the attribute
     * @return string Unit code, or ''
     */
    private function unitFor(string $inputType): string
    {
        if ($inputType === 'price') {
            return strtoupper((string)$this->scopeConfig->getValue(self::XML_PATH_BASE_CURRENCY));
        }

        if ($inputType === 'weight') {
            return (string)$this->scopeConfig->getValue(self::XML_PATH_WEIGHT_UNIT);
        }

        return '';
    }

    /**
     * The input type the operator policy should judge by.
     *
     * A text-input attribute stored in a numeric backend column compares like a number, so it is
     * upgraded to `decimal` for operator purposes while its descriptor keeps reporting `text`.
     *
     * @param AbstractAttribute $attribute Attribute under inspection
     * @param string $inputType Its frontend input type
     * @return string Input type to hand to the operator policy
     */
    private function operatorInputType(AbstractAttribute $attribute, string $inputType): string
    {
        if ($inputType === 'text'
            && in_array((string)$attribute->getBackendType(), self::NUMERIC_BACKEND_TYPES, true)
        ) {
            return 'decimal';
        }

        return $inputType;
    }
}
