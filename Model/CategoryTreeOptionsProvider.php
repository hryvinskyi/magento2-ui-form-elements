<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Model;

use Hryvinskyi\UiFormElements\Api\CategoryTreeOptionsProviderInterface;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Framework\DataObject;
use Magento\Store\Model\Store;

/**
 * Builds the tree-shaped category options from a single category-collection pass.
 *
 * Reads admin-scope names (store 0), skips the invisible global root (level 0) and orders by path so
 * every parent precedes its children — which lets clients build the tree in one linear scan. The
 * result is memoised because one form typically renders the same list in more than one picker.
 */
final class CategoryTreeOptionsProvider implements CategoryTreeOptionsProviderInterface
{
    /**
     * Memoised options — a full category-tree read is expensive and the list is immutable within a
     * request.
     *
     * @var list<array{value: string, label: string, level: int, parent: string}>|null
     */
    private ?array $options = null;

    /**
     * @param CollectionFactory $categoryCollectionFactory Category collection factory
     */
    public function __construct(
        private readonly CollectionFactory $categoryCollectionFactory
    ) {
    }

    /**
     * @inheritDoc
     */
    #[\Override]
    public function getOptions(): array
    {
        if ($this->options !== null) {
            return $this->options;
        }

        $collection = $this->categoryCollectionFactory->create();
        $collection->addAttributeToSelect(['name', 'parent_id']);
        $collection->addFieldToFilter('level', ['gt' => 0]);
        $collection->setStore(Store::DEFAULT_STORE_ID);
        $collection->setOrder('path', 'ASC');

        $options = [];
        foreach ($collection as $category) {
            if (!$category instanceof DataObject) {
                continue;
            }
            $level = (int)$category->getData('level');
            $name = $category->getData('name');
            $options[] = [
                'value' => (string)$category->getData('entity_id'),
                'label' => is_scalar($name) ? (string)$name : '',
                'level' => $level,
                // A level-1 root's parent is the excluded global root, so it gets no parent at all.
                'parent' => $level > 1 ? (string)(int)$category->getData('parent_id') : '',
            ];
        }

        return $this->options = $options;
    }
}
