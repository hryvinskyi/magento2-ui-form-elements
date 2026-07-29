<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Model\OperatorSetPolicy;
use Hryvinskyi\UiFormElements\Model\ProductAttributeMetaProvider;
use Magento\Catalog\Model\Product;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute\AbstractAttribute;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Phrase;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the shared attribute descriptor provider.
 *
 * The operator policy is used for real (it is a pure value class pinned by its own test), so these
 * tests assert the operator-set NAMES a consumer's form will actually resolve against the sets the
 * policy publishes. Descriptors are deliberately option-free — the on-demand provider has its own
 * test — so the assertions here also pin that no source model is ever read at describe time.
 */
final class ProductAttributeMetaProviderTest extends TestCase
{
    /**
     * @var EavConfig&MockObject
     */
    private $eavConfig;

    /**
     * @var ScopeConfigInterface&MockObject
     */
    private $scopeConfig;

    /**
     * Provider under test.
     */
    private ProductAttributeMetaProvider $provider;

    /**
     * @inheritDoc
     */
    #[\Override]
    protected function setUp(): void
    {
        $this->eavConfig = $this->createMock(EavConfig::class);
        $this->scopeConfig = $this->createMock(ScopeConfigInterface::class);

        $this->provider = new ProductAttributeMetaProvider(
            $this->eavConfig,
            new OperatorSetPolicy(),
            $this->scopeConfig
        );
    }

    /**
     * A select attribute is described as optioned with the select operator set — and its source
     * model is never read: option lists are the on-demand provider's job, not the describe pass's.
     *
     * @return void
     */
    public function testSelectAttributeIsOptionedWithoutReadingItsSource(): void
    {
        $attribute = $this->attributeMock(101, 'select');
        $attribute->expects(self::never())->method('getSource');
        $this->eavConfig->expects(self::once())
            ->method('getAttribute')
            ->with(Product::ENTITY, 'color')
            ->willReturn($attribute);

        $attributes = $this->provider->getAttributes(['color' => 'Colour'], ['color']);

        self::assertCount(1, $attributes);
        $descriptor = $attributes[0];
        self::assertSame('color', $descriptor['value']);
        self::assertSame('Colour', $descriptor['label']);
        self::assertSame('select', $descriptor['inputType']);
        self::assertTrue($descriptor['hasOptions'], 'A select attribute has a finite option list.');
        self::assertTrue($descriptor['suggest'], 'Whitelisted code must be suggest-enabled.');
        self::assertSame('select', $descriptor['operatorSet']);
        self::assertArrayNotHasKey('options', $descriptor, 'Option lists are served on demand, never embedded.');
        self::assertArrayNotHasKey('operators', $descriptor, 'Operator sets are named, never embedded.');
    }

    /**
     * An unknown attribute (EAV lookup throws) degrades to free text with no operator set.
     *
     * @return void
     */
    public function testUnknownAttributeFallsBackToText(): void
    {
        $this->eavConfig->method('getAttribute')
            ->willThrowException(new LocalizedException(new Phrase('No such attribute')));

        $attributes = $this->provider->getAttributes(['mystery' => 'Mystery'], []);

        self::assertSame(
            [
                [
                    'value' => 'mystery',
                    'label' => 'Mystery',
                    'inputType' => 'text',
                    'hasOptions' => false,
                    'suggest' => false,
                    'operatorSet' => null,
                    'unit' => '',
                ],
            ],
            $attributes
        );
    }

    /**
     * Price and weight attributes carry the unit their number is entered in — the base currency
     * (uppercased: it is a code) and the configured weight unit — while everything else measures
     * nothing and names no unit.
     *
     * @return void
     */
    public function testPriceAndWeightAttributesCarryTheirUnit(): void
    {
        $this->scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path): ?string => match ($path) {
                'currency/options/base' => 'dkk',
                'general/locale/weight_unit' => 'kgs',
                default => null,
            }
        );
        $this->eavConfig->method('getAttribute')->willReturnCallback(
            fn (string $entityType, string $code) => match ($code) {
                'price' => $this->attributeMock(21, 'price'),
                'weight' => $this->attributeMock(22, 'weight'),
                default => $this->attributeMock(23, 'text', 'varchar'),
            }
        );

        $attributes = $this->provider->getAttributes(
            ['price' => 'Price', 'weight' => 'Weight', 'name' => 'Name'],
            []
        );

        self::assertSame('DKK', $attributes[0]['unit'], 'A price is entered in the base currency, spelled as a code.');
        self::assertSame('kgs', $attributes[1]['unit'], 'A weight is entered in the configured weight unit.');
        self::assertSame('', $attributes[2]['unit'], 'An attribute that measures nothing names no unit.');
    }

    /**
     * A non-EAV attribute (id-less, like sku) falls back to text and renders a Phrase label.
     *
     * @return void
     */
    public function testIdLessAttributeFallsBackToTextAndRendersPhraseLabel(): void
    {
        $this->eavConfig->method('getAttribute')
            ->with(Product::ENTITY, 'sku')
            ->willReturn($this->attributeMock(0, 'text'));

        $attributes = $this->provider->getAttributes(['sku' => new Phrase('SKU')], ['sku']);

        self::assertCount(1, $attributes);
        $descriptor = $attributes[0];
        self::assertSame('SKU', $descriptor['label'], 'Phrase labels must be rendered to strings.');
        self::assertSame('text', $descriptor['inputType']);
        self::assertFalse($descriptor['hasOptions']);
        self::assertTrue($descriptor['suggest'], 'The whitelist decides suggest even for non-EAV codes.');
        self::assertNull($descriptor['operatorSet'], 'Text attributes fall back to the field-level operator list.');
    }

    /**
     * category_ids bypasses EAV entirely: an optioned multiselect naming the membership set,
     * never suggestable — its tree-shaped list comes from the on-demand provider like every
     * other list.
     *
     * @return void
     */
    public function testCategoryIdsIsAnOptionedMultiselectNamingTheMembershipSet(): void
    {
        $this->eavConfig->expects(self::never())->method('getAttribute');

        $attributes = $this->provider->getAttributes(['category_ids' => 'Category'], ['category_ids']);

        self::assertCount(1, $attributes);
        $descriptor = $attributes[0];
        self::assertSame('multiselect', $descriptor['inputType']);
        self::assertTrue($descriptor['hasOptions'], 'The category tree exists — it is just served on demand.');
        self::assertFalse($descriptor['suggest'], 'category_ids must never be suggestable.');
        self::assertSame('multiselect', $descriptor['operatorSet'], 'The multiselect set IS the membership pair.');
    }

    /**
     * Attributes with an empty code are skipped and never looked up.
     *
     * @return void
     */
    public function testEmptyCodeIsSkipped(): void
    {
        $this->eavConfig->expects(self::once())
            ->method('getAttribute')
            ->with(Product::ENTITY, 'name')
            ->willReturn($this->attributeMock(7, 'text', 'varchar'));

        $attributes = $this->provider->getAttributes(['' => 'Nameless', 'name' => 'Name'], []);

        self::assertCount(1, $attributes);
        self::assertSame('name', $attributes[0]['value']);
    }

    /**
     * A text-input attribute stored in a numeric backend column names the comparison set AND pins
     * its scalar type: the client used to infer "this is a number" from a `>=` entry in the
     * embedded operator array, and with operators named rather than embedded the provider must
     * state it outright.
     *
     * @dataProvider numericBackendTypeProvider
     * @param string $backendType Backend column type reported by the attribute
     * @return void
     */
    public function testNumericBackedTextAttributeNamesComparisonSetAndPinsFloat(string $backendType): void
    {
        $this->eavConfig->method('getAttribute')
            ->willReturn($this->attributeMock(31, 'text', $backendType));

        $attributes = $this->provider->getAttributes(['custom_length' => 'Length'], []);

        self::assertCount(1, $attributes);
        $descriptor = $attributes[0];
        self::assertSame('text', $descriptor['inputType'], 'The descriptor keeps the real input type.');
        self::assertSame('decimal', $descriptor['operatorSet']);
        self::assertSame('float', $descriptor['scalarType'], 'The numeric editor no longer has operators to sniff.');
    }

    /**
     * Numeric backend column types.
     *
     * @return array<string, array{0: string}>
     */
    public static function numericBackendTypeProvider(): array
    {
        return [
            'decimal' => ['decimal'],
            'int' => ['int'],
        ];
    }

    /**
     * A string-backed text attribute keeps the null operator-set fallback and pins no scalar
     * type — only numeric backends upgrade.
     *
     * @return void
     */
    public function testVarcharBackedTextAttributeKeepsNullOperatorSet(): void
    {
        $this->eavConfig->method('getAttribute')
            ->willReturn($this->attributeMock(32, 'text', 'varchar'));

        $attributes = $this->provider->getAttributes(['custom_text' => 'Custom'], []);

        self::assertCount(1, $attributes);
        self::assertNull($attributes[0]['operatorSet']);
        self::assertArrayNotHasKey('scalarType', $attributes[0]);
    }

    /**
     * Build an attribute mock with the given id, frontend input and backend type.
     *
     * @param int $id Attribute id (0 = not a real EAV attribute)
     * @param string $frontendInput Frontend input type
     * @param string|null $backendType Backend column type
     * @return AbstractAttribute&MockObject
     */
    private function attributeMock(int $id, string $frontendInput, ?string $backendType = null)
    {
        $attribute = $this->createMock(AbstractAttribute::class);
        $attribute->method('getId')->willReturn($id);
        $attribute->method('getFrontendInput')->willReturn($frontendInput);
        $attribute->method('getBackendType')->willReturn($backendType);

        return $attribute;
    }
}
