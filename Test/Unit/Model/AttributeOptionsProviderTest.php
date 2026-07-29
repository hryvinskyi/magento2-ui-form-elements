<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Api\CategoryTreeOptionsProviderInterface;
use Hryvinskyi\UiFormElements\Model\AttributeOptionsProvider;
use Magento\Catalog\Model\Product;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute\AbstractAttribute;
use Magento\Eav\Model\Entity\Attribute\Source\Table as TableSource;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Phrase;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the on-demand attribute option reader.
 *
 * The normalisation asserted here is the one the attribute descriptors used to embed inline, so a
 * rule authored against a lazily-loaded list serialises exactly as it always did — the select
 * normalisation cases mirror what the meta provider's test asserted before options moved out.
 */
final class AttributeOptionsProviderTest extends TestCase
{
    /**
     * @var EavConfig&MockObject
     */
    private $eavConfig;

    /**
     * @var CategoryTreeOptionsProviderInterface&MockObject
     */
    private $categoryTreeOptionsProvider;

    /**
     * Provider under test.
     */
    private AttributeOptionsProvider $provider;

    /**
     * @inheritDoc
     */
    #[\Override]
    protected function setUp(): void
    {
        $this->eavConfig = $this->createMock(EavConfig::class);
        $this->categoryTreeOptionsProvider = $this->createMock(CategoryTreeOptionsProviderInterface::class);

        $this->provider = new AttributeOptionsProvider(
            $this->eavConfig,
            $this->categoryTreeOptionsProvider
        );
    }

    /**
     * A select attribute's source options are normalised to strings: table sources asked without
     * the empty option, empty and group values skipped, Phrase labels rendered, label falling back
     * to the value.
     *
     * @return void
     */
    public function testSelectAttributeNormalisesItsSourceOptions(): void
    {
        $source = $this->createMock(TableSource::class);
        $source->expects(self::once())
            ->method('getAllOptions')
            ->with(false, true)
            ->willReturn([
                ['value' => 10, 'label' => 'Red'],
                ['value' => '', 'label' => 'Empty value must be skipped'],
                ['value' => ['nested'], 'label' => 'Option groups must be skipped'],
                ['value' => 11, 'label' => new Phrase('Blue')],
                ['value' => 12],
            ]);
        $attribute = $this->attributeMock(101, 'select');
        $attribute->method('getSource')->willReturn($source);
        $this->eavConfig->expects(self::once())
            ->method('getAttribute')
            ->with(Product::ENTITY, 'color')
            ->willReturn($attribute);

        self::assertSame(
            [
                ['value' => '10', 'label' => 'Red'],
                ['value' => '11', 'label' => 'Blue'],
                ['value' => '12', 'label' => '12'],
            ],
            $this->provider->getOptions('color')
        );
    }

    /**
     * category_ids bypasses EAV entirely and answers the tree-shaped category options, with the
     * hierarchy keys intact.
     *
     * @return void
     */
    public function testCategoryIdsAnswersTheTreeOptions(): void
    {
        $treeOptions = [
            ['value' => '2', 'label' => 'Root A', 'level' => 1, 'parent' => ''],
            ['value' => '3', 'label' => 'Laptops', 'level' => 2, 'parent' => '2'],
        ];
        $this->categoryTreeOptionsProvider->expects(self::once())
            ->method('getOptions')
            ->willReturn($treeOptions);
        $this->eavConfig->expects(self::never())->method('getAttribute');

        self::assertSame($treeOptions, $this->provider->getOptions('category_ids'));
    }

    /**
     * Every failure answers an empty list, never an exception: an unknown code, an id-less
     * attribute, a non-optioned input type, and a throwing source model.
     *
     * @return void
     */
    public function testEveryFailureAnswersAnEmptyList(): void
    {
        $throwingSource = $this->attributeMock(55, 'select');
        $throwingSource->method('getSource')
            ->willThrowException(new LocalizedException(new Phrase('Source model not found')));

        $this->eavConfig->method('getAttribute')->willReturnCallback(
            fn (string $entityType, string $code) => match ($code) {
                'unknown' => throw new LocalizedException(new Phrase('No such attribute')),
                'idless' => $this->attributeMock(0, 'select'),
                'plain_text' => $this->attributeMock(7, 'text'),
                'broken_source' => $throwingSource,
                default => self::fail('Unexpected code ' . $code),
            }
        );

        foreach (['unknown', 'idless', 'plain_text', 'broken_source'] as $code) {
            self::assertSame([], $this->provider->getOptions($code), sprintf('"%s" must answer [].', $code));
        }
    }

    /**
     * Build an attribute mock with the given id and frontend input.
     *
     * @param int $id Attribute id (0 = not a real EAV attribute)
     * @param string $frontendInput Frontend input type
     * @return AbstractAttribute&MockObject
     */
    private function attributeMock(int $id, string $frontendInput)
    {
        $attribute = $this->createMock(AbstractAttribute::class);
        $attribute->method('getId')->willReturn($id);
        $attribute->method('getFrontendInput')->willReturn($frontendInput);

        return $attribute;
    }
}
