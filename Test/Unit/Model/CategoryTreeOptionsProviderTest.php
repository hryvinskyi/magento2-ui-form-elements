<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Model\CategoryTreeOptionsProvider;
use Magento\Catalog\Model\ResourceModel\Category\Collection as CategoryCollection;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Framework\DataObject;
use Magento\Store\Model\Store;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the tree-shaped category options provider.
 *
 * The client-side tree derives all hierarchy from `level` + `parent`, so the shape of those two
 * keys — plain un-prefixed labels included — is the load-bearing contract here.
 */
final class CategoryTreeOptionsProviderTest extends TestCase
{
    /**
     * @var CollectionFactory&MockObject
     */
    private $collectionFactory;

    /**
     * @var CategoryCollection&MockObject
     */
    private $collection;

    /**
     * @inheritDoc
     */
    #[\Override]
    protected function setUp(): void
    {
        $this->collectionFactory = $this->getMockBuilder(CollectionFactory::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['create'])
            ->getMock();

        $this->collection = $this->getMockBuilder(CategoryCollection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addAttributeToSelect', 'addFieldToFilter', 'setStore', 'setOrder', 'getIterator'])
            ->getMock();
        $this->collection->method('addAttributeToSelect')->willReturnSelf();
        $this->collection->method('addFieldToFilter')->willReturnSelf();
        $this->collection->method('setStore')->willReturnSelf();
        $this->collection->method('setOrder')->willReturnSelf();
    }

    /**
     * Levels and parents are mapped, labels stay un-prefixed, and level-1 roots get an empty parent.
     *
     * @return void
     */
    public function testOptionsCarryLevelAndParentWithPlainLabels(): void
    {
        $this->collection->expects(self::once())
            ->method('addAttributeToSelect')
            ->with(['name', 'parent_id']);
        $this->collection->expects(self::once())
            ->method('addFieldToFilter')
            ->with('level', ['gt' => 0]);
        $this->collection->expects(self::once())
            ->method('setStore')
            ->with(Store::DEFAULT_STORE_ID);
        $this->collection->expects(self::once())
            ->method('setOrder')
            ->with('path', 'ASC');
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([
            new DataObject(['entity_id' => 2, 'name' => 'Root A', 'level' => 1, 'parent_id' => 1]),
            new DataObject(['entity_id' => 3, 'name' => 'Laptops', 'level' => 2, 'parent_id' => 2]),
            new DataObject(['entity_id' => 4, 'name' => 'Gaming — Special', 'level' => 3, 'parent_id' => 3]),
        ]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $provider = new CategoryTreeOptionsProvider($this->collectionFactory);

        self::assertSame(
            [
                ['value' => '2', 'label' => 'Root A', 'level' => 1, 'parent' => ''],
                ['value' => '3', 'label' => 'Laptops', 'level' => 2, 'parent' => '2'],
                // A name containing a dash stays verbatim — no prefix logic may touch labels.
                ['value' => '4', 'label' => 'Gaming — Special', 'level' => 3, 'parent' => '3'],
            ],
            $provider->getOptions()
        );
    }

    /**
     * The second call is served from the memo — the factory builds exactly one collection.
     *
     * @return void
     */
    public function testGetOptionsMemoisesTheCollectionPass(): void
    {
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([
            new DataObject(['entity_id' => 2, 'name' => 'Root A', 'level' => 1, 'parent_id' => 1]),
        ]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $provider = new CategoryTreeOptionsProvider($this->collectionFactory);
        $first = $provider->getOptions();
        $second = $provider->getOptions();

        self::assertSame($first, $second);
    }

    /**
     * An empty catalog yields an empty list, not an error — and is memoised too.
     *
     * @return void
     */
    public function testEmptyCollectionYieldsEmptyList(): void
    {
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $provider = new CategoryTreeOptionsProvider($this->collectionFactory);

        self::assertSame([], $provider->getOptions());
        self::assertSame([], $provider->getOptions());
    }
}
