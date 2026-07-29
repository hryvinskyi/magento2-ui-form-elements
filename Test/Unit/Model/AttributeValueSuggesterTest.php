<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Model\AttributeValueSuggester;
use Magento\Catalog\Model\ResourceModel\Product\Collection as ProductCollection;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory;
use Magento\Framework\DataObject;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the whitelisted attribute-value suggester.
 *
 * The guard order is the load-bearing contract: a non-whitelisted code or an under-length query
 * must short-circuit BEFORE the collection factory is touched, and no internal failure may ever
 * escape as an exception.
 */
final class AttributeValueSuggesterTest extends TestCase
{
    /**
     * @var CollectionFactory&MockObject
     */
    private $collectionFactory;

    /**
     * @var ProductCollection&MockObject
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

        $this->collection = $this->getMockBuilder(ProductCollection::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'addAttributeToSelect',
                'addAttributeToFilter',
                'setOrder',
                'setPageSize',
                'setCurPage',
                'getIterator',
            ])
            ->getMock();
        $this->collection->method('addAttributeToSelect')->willReturnSelf();
        $this->collection->method('addAttributeToFilter')->willReturnSelf();
        $this->collection->method('setOrder')->willReturnSelf();
        $this->collection->method('setPageSize')->willReturnSelf();
        $this->collection->method('setCurPage')->willReturnSelf();
    }

    /**
     * A code outside the whitelist yields an empty list without the factory ever being called.
     *
     * @return void
     */
    public function testNonWhitelistedCodeShortCircuitsWithoutQuerying(): void
    {
        $this->collectionFactory->expects($this->never())->method('create');

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['sku', 'name']);

        self::assertSame([], $suggester->suggest('description', 'laptop'));
    }

    /**
     * A query below the minimum length yields an empty list without the factory ever being called.
     *
     * @return void
     */
    public function testUnderLengthQueryShortCircuitsWithoutQuerying(): void
    {
        $this->collectionFactory->expects($this->never())->method('create');

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['sku', 'name']);

        self::assertSame([], $suggester->suggest('name', 'a'));
    }

    /**
     * The query is trimmed BEFORE the length guard — surrounding whitespace cannot smuggle a
     * too-short query past it.
     *
     * @return void
     */
    public function testQueryIsTrimmedBeforeTheLengthGuard(): void
    {
        $this->collectionFactory->expects($this->never())->method('create');

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['sku', 'name']);

        self::assertSame([], $suggester->suggest('name', '  a  '));
    }

    /**
     * The default construction carries an empty whitelist — every code is rejected before any query.
     *
     * @return void
     */
    public function testEmptyWhitelistByDefaultRejectsEveryCode(): void
    {
        $this->collectionFactory->expects($this->never())->method('create');

        $suggester = new AttributeValueSuggester($this->collectionFactory);

        self::assertSame([], $suggester->suggest('sku', 'laptop'));
        self::assertSame([], $suggester->getSuggestableCodes());
    }

    /**
     * Happy path: LIKE query on the trimmed term, ascending order, capped page, duplicates folded,
     * empty values skipped, and every entry uses the value as its own label.
     *
     * @return void
     */
    public function testHappyPathFoldsDistinctValuesAndSkipsEmpties(): void
    {
        $this->collection->expects(self::once())
            ->method('addAttributeToSelect')
            ->with('name');
        $this->collection->expects(self::once())
            ->method('addAttributeToFilter')
            ->with('name', ['like' => '%lap%']);
        $this->collection->expects(self::once())
            ->method('setOrder')
            ->with('name', 'ASC');
        $this->collection->expects(self::once())
            ->method('setPageSize')
            ->with(25);
        $this->collection->expects(self::once())
            ->method('setCurPage')
            ->with(1);
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([
            new DataObject(['name' => 'Laptop A']),
            new DataObject(['name' => 'Laptop A']),
            new DataObject(['name' => '']),
            new DataObject(['name' => 'Laptop B']),
        ]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['sku', 'name']);

        self::assertSame(
            [
                ['value' => 'Laptop A', 'label' => 'Laptop A'],
                ['value' => 'Laptop B', 'label' => 'Laptop B'],
            ],
            $suggester->suggest('name', ' lap ')
        );
    }

    /**
     * Constructor-tuned cap and minimum length flow through to the guard and the collection.
     *
     * @return void
     */
    public function testCustomLimitsAreHonoured(): void
    {
        $this->collection->expects(self::once())
            ->method('setPageSize')
            ->with(10);
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['name'], 10, 4);

        // Three characters sit below the tuned minimum of four — no query may run for them.
        self::assertSame([], $suggester->suggest('name', 'lap'));
        // Four characters clear the guard and hit the collection with the tuned page size.
        self::assertSame([], $suggester->suggest('name', 'lapt'));
    }

    /**
     * A throwing collection collapses to an empty list — no exception escapes suggest().
     *
     * @return void
     */
    public function testCollectionFailureCollapsesToEmptyList(): void
    {
        $this->collection->method('getIterator')
            ->willThrowException(new \RuntimeException('storage gone'));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['sku', 'name']);

        self::assertSame([], $suggester->suggest('name', 'lap'));
    }

    /**
     * The whitelist is normalised at construction: entries are stringified, empty and
     * non-stringable entries are dropped, and the result is a plain re-indexed list.
     *
     * @return void
     */
    public function testGetSuggestableCodesReturnsTheConstructorListNormalised(): void
    {
        $suggester = new AttributeValueSuggester($this->collectionFactory, [
            'sku' => 'sku',
            'blank' => '',
            'numeric' => 42,
            'null' => null,
            'nested' => ['not', 'a', 'code'],
            'name' => 'name',
        ]);

        self::assertSame(['sku', '42', 'name'], $suggester->getSuggestableCodes());
    }

    /**
     * The published minimum query length is the one the guard enforces — the shipped default here.
     *
     * @return void
     */
    public function testMinQueryLengthDefaultsToTheShippedMinimum(): void
    {
        $suggester = new AttributeValueSuggester($this->collectionFactory, ['name']);

        self::assertSame(2, $suggester->getMinQueryLength());
    }

    /**
     * A tuned minimum is published as tuned, and it is the same number the guard applies — a
     * published value the guard disagreed with is exactly the drift this accessor exists to stop.
     *
     * @return void
     */
    public function testMinQueryLengthPublishesTheTunedGuardValue(): void
    {
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $suggester = new AttributeValueSuggester($this->collectionFactory, ['name'], 25, 4);
        $minimum = $suggester->getMinQueryLength();

        self::assertSame(4, $minimum);
        // One character below the published minimum: no query may run for it.
        self::assertSame([], $suggester->suggest('name', str_repeat('a', $minimum - 1)));
        // Exactly the published minimum: the lookup runs (the collection above answers nothing).
        self::assertSame([], $suggester->suggest('name', str_repeat('a', $minimum)));
    }

    /**
     * A normalised (stringified) whitelist entry is what the suggest() guard matches against.
     *
     * @return void
     */
    public function testSuggestMatchesAgainstTheNormalisedWhitelist(): void
    {
        $this->collection->method('getIterator')->willReturn(new \ArrayIterator([]));
        $this->collectionFactory->expects(self::once())
            ->method('create')
            ->willReturn($this->collection);

        $suggester = new AttributeValueSuggester($this->collectionFactory, [42]);

        self::assertSame([], $suggester->suggest('42', 'lap'));
    }
}
