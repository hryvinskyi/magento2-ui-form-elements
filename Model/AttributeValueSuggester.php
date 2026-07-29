<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\AttributeValueSuggesterInterface;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory;

/**
 * LIKE-based product attribute value lookup with a construction-time whitelist.
 *
 * The module's default DI preference resolves the interface to this class with an EMPTY whitelist,
 * so every suggest() call answers an empty list until a consumer wires a virtual type supplying its
 * own `suggestableCodes` (the wiring shape is documented in etc/di.xml). Because the whitelist has
 * no setter and no per-call override, an endpoint delegating here cannot accidentally expose an
 * unwhitelisted attribute — long-text attributes stay out by construction, keeping type-ahead
 * responses small.
 */
final class AttributeValueSuggester implements AttributeValueSuggesterInterface
{
    /**
     * Whitelisted attribute codes, normalised at construction.
     *
     * @var list<string>
     */
    private readonly array $suggestableCodes;

    /**
     * @param CollectionFactory $productCollectionFactory Product collection factory for the LIKE lookup
     * @param array<int|string, mixed> $suggestableCodes Attribute codes eligible for lookup; every
     *     entry is cast to string, empty and non-stringable entries are dropped
     * @param int $maxResults Result cap per lookup
     * @param int $minQueryLength Minimum trimmed query length before a lookup runs
     */
    public function __construct(
        private readonly CollectionFactory $productCollectionFactory,
        array $suggestableCodes = [],
        private readonly int $maxResults = 25,
        private readonly int $minQueryLength = 2
    ) {
        $normalised = [];
        foreach ($suggestableCodes as $code) {
            $code = is_scalar($code) || $code instanceof \Stringable ? (string)$code : '';
            if ($code === '') {
                continue;
            }
            $normalised[] = $code;
        }
        $this->suggestableCodes = $normalised;
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function suggest(string $attributeCode, string $query): array
    {
        $query = trim($query);
        if (!in_array($attributeCode, $this->suggestableCodes, true)) {
            return [];
        }
        if (mb_strlen($query) < $this->minQueryLength) {
            return [];
        }

        try {
            return $this->fetchMatches($attributeCode, $query);
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function getSuggestableCodes(): array
    {
        return $this->suggestableCodes;
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function getMinQueryLength(): int
    {
        return $this->minQueryLength;
    }

    /**
     * Fetch up to the result cap of distinct values of the attribute matching the query.
     *
     * The whitelist and length guards have already run by the time this executes — only a
     * whitelisted attribute code ever reaches the collection.
     *
     * @param string $attributeCode Whitelisted attribute code
     * @param string $query Case-insensitive substring to match
     * @return list<array{value: string, label: string}> Distinct non-empty values; value === label
     */
    private function fetchMatches(string $attributeCode, string $query): array
    {
        $collection = $this->productCollectionFactory->create();
        $collection->addAttributeToSelect($attributeCode);
        $collection->addAttributeToFilter($attributeCode, ['like' => '%' . $query . '%']);
        $collection->setOrder($attributeCode, 'ASC');
        $collection->setPageSize($this->maxResults);
        $collection->setCurPage(1);

        $items = [];
        $seen = [];
        foreach ($collection as $product) {
            $value = (string)$product->getData($attributeCode);
            if ($value === '' || isset($seen[$value])) {
                continue;
            }
            $seen[$value] = true;
            $items[] = ['value' => $value, 'label' => $value];
        }

        return $items;
    }
}
