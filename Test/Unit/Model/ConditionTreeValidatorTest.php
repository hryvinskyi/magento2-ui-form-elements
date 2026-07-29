<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Api\ConditionTreeValidatorInterface;
use Hryvinskyi\UiFormElements\Model\ConditionTreeValidator;
use PHPUnit\Framework\TestCase;

/**
 * Pins the whitelist gate every hydration path relies on.
 *
 * The polarity matters more than the mechanics: a tree is rejected as a whole on the first node
 * whose `type` is not in the allowed set, while an empty tree and a childless root both pass —
 * "nothing authored" is a legitimate state, not an attack.
 */
final class ConditionTreeValidatorTest extends TestCase
{
    /**
     * Stand-in condition classes for the allowed set — the validator compares strings, so the
     * classes do not need to exist.
     */
    private const ALLOWED = [
        'Acme\Rule\Condition\Combine',
        'Acme\Rule\Condition\Product',
        'Acme\Rule\Condition\Url',
    ];

    /**
     * Validator under test — stateless, so one shared instance is enough.
     */
    private ConditionTreeValidator $validator;

    /**
     * @inheritDoc
     */
    #[\Override]
    protected function setUp(): void
    {
        $this->validator = new ConditionTreeValidator();
    }

    /**
     * A nested tree mixing combines and leaves, all with allowed types, passes.
     *
     * @return void
     */
    public function testValidNestedMixedTreePasses(): void
    {
        $tree = [
            'type' => 'Acme\Rule\Condition\Combine',
            'aggregator' => 'all',
            'value' => '1',
            'conditions' => [
                ['type' => 'Acme\Rule\Condition\Url', 'attribute' => 'url', 'operator' => '{}', 'value' => '/x'],
                [
                    'type' => 'Acme\Rule\Condition\Combine',
                    'aggregator' => 'any',
                    'value' => '1',
                    'conditions' => [
                        ['type' => 'Acme\Rule\Condition\Product', 'attribute' => 'sku', 'operator' => '==', 'value' => 'A'],
                        ['type' => 'Acme\Rule\Condition\Product', 'attribute' => 'name', 'operator' => '{}', 'value' => 'B'],
                    ],
                ],
            ],
        ];

        self::assertTrue($this->validator->isValid($tree, self::ALLOWED));
    }

    /**
     * An empty tree means "no rule authored" and passes.
     *
     * @return void
     */
    public function testEmptyTreePasses(): void
    {
        self::assertTrue($this->validator->isValid([], self::ALLOWED));
    }

    /**
     * A childless root combine is a legitimate stored state (a cleared rule) and passes.
     *
     * @return void
     */
    public function testChildlessRootCombinePasses(): void
    {
        $tree = [
            'type' => 'Acme\Rule\Condition\Combine',
            'attribute' => null,
            'operator' => null,
            'value' => null,
            'aggregator' => 'all',
        ];

        self::assertTrue($this->validator->isValid($tree, self::ALLOWED));

        $tree['conditions'] = [];
        self::assertTrue(
            $this->validator->isValid($tree, self::ALLOWED),
            'An explicit empty conditions list is as valid as an absent one.'
        );
    }

    /**
     * An unknown type at the root fails the whole tree.
     *
     * @return void
     */
    public function testUnknownTypeAtRootFails(): void
    {
        $tree = ['type' => 'Evil\Arbitrary\Model', 'aggregator' => 'all', 'value' => '1'];

        self::assertFalse($this->validator->isValid($tree, self::ALLOWED));
    }

    /**
     * An unknown type buried two levels down fails the whole tree.
     *
     * @return void
     */
    public function testUnknownTypeAtDepthTwoFails(): void
    {
        $tree = [
            'type' => 'Acme\Rule\Condition\Combine',
            'aggregator' => 'all',
            'value' => '1',
            'conditions' => [
                ['type' => 'Acme\Rule\Condition\Product', 'attribute' => 'sku', 'operator' => '==', 'value' => 'A'],
                ['type' => 'Evil\Arbitrary\Model', 'attribute' => 'x', 'operator' => '==', 'value' => 'y'],
            ],
        ];

        self::assertFalse($this->validator->isValid($tree, self::ALLOWED));
    }

    /**
     * A node without a type — or with a non-string one — fails.
     *
     * @dataProvider missingTypeProvider
     * @param array<int|string, mixed> $tree Tree whose root lacks a usable type
     * @return void
     */
    public function testMissingOrNonStringTypeFails(array $tree): void
    {
        self::assertFalse($this->validator->isValid($tree, self::ALLOWED));
    }

    /**
     * @return array<string, array{0: array<int|string, mixed>}>
     */
    public static function missingTypeProvider(): array
    {
        return [
            'no type key' => [['aggregator' => 'all', 'value' => '1']],
            'null type' => [['type' => null, 'aggregator' => 'all']],
            'int type' => [['type' => 42, 'aggregator' => 'all']],
            'array type' => [['type' => ['Acme\Rule\Condition\Combine'], 'aggregator' => 'all']],
        ];
    }

    /**
     * Type matching is strict: no case folding, no substring or prefix acceptance.
     *
     * @return void
     */
    public function testTypeComparisonIsStrict(): void
    {
        self::assertFalse(
            $this->validator->isValid(['type' => 'acme\rule\condition\combine'], self::ALLOWED),
            'Lower-cased class name must not pass.'
        );
        self::assertFalse(
            $this->validator->isValid(['type' => 'Acme\Rule\Condition\CombineExtra'], self::ALLOWED),
            'A prefixed class name must not pass.'
        );
    }

    /**
     * A non-array entry inside a conditions list fails, as does a non-array conditions value.
     *
     * @return void
     */
    public function testNonArrayConditionEntriesFail(): void
    {
        $scalarChild = [
            'type' => 'Acme\Rule\Condition\Combine',
            'aggregator' => 'all',
            'conditions' => ['not-a-node'],
        ];
        self::assertFalse($this->validator->isValid($scalarChild, self::ALLOWED));

        $scalarConditions = [
            'type' => 'Acme\Rule\Condition\Combine',
            'aggregator' => 'all',
            'conditions' => 'not-a-list',
        ];
        self::assertFalse($this->validator->isValid($scalarConditions, self::ALLOWED));
    }

    /**
     * The depth guard: a chain of ten nested combines passes, eleven fails — even though every
     * node's type is allowed.
     *
     * @return void
     */
    public function testDepthGuardAcceptsTenLevelsAndRejectsEleven(): void
    {
        self::assertTrue($this->validator->isValid($this->chainOfDepth(10), self::ALLOWED));
        self::assertFalse($this->validator->isValid($this->chainOfDepth(11), self::ALLOWED));
    }

    /**
     * The depth guard is an explicit parameter, so a caller can tighten it.
     *
     * @return void
     */
    public function testDepthGuardParameterIsRespected(): void
    {
        self::assertTrue($this->validator->isValid($this->chainOfDepth(3), self::ALLOWED, 3));
        self::assertFalse($this->validator->isValid($this->chainOfDepth(4), self::ALLOWED, 3));
        self::assertSame(10, ConditionTreeValidatorInterface::DEFAULT_MAX_DEPTH);
    }

    /**
     * allowedTypesFromConfig() collects the combine type, every field type and every childType,
     * skips the picker's own component-vocabulary type string, and deduplicates.
     *
     * @return void
     */
    public function testAllowedTypesFromConfigExtractsAndDeduplicates(): void
    {
        $config = [
            'combineType' => 'Acme\Rule\Condition\Combine',
            'suggestUrl' => 'https://admin/suggest',
            'fields' => [
                ['type' => 'Acme\Rule\Condition\Url', 'label' => 'URL'],
                ['type' => 'Acme\Rule\Condition\Product', 'attribute' => 'category_ids', 'label' => 'Category'],
                [
                    'type' => 'product_attribute_picker',
                    'childType' => 'Acme\Rule\Condition\Product',
                    'label' => 'Product Attribute',
                ],
            ],
            'emptyStateMessage' => 'No rule.',
        ];

        self::assertSame(
            [
                'Acme\Rule\Condition\Combine',
                'Acme\Rule\Condition\Url',
                'Acme\Rule\Condition\Product',
            ],
            $this->validator->allowedTypesFromConfig($config)
        );
    }

    /**
     * The picker's own type string never becomes an allowed hydration type, even when a config
     * carries no childType next to it.
     *
     * @return void
     */
    public function testPickerTypeStringIsNeverWhitelisted(): void
    {
        $config = [
            'combineType' => 'Acme\Rule\Condition\Combine',
            'fields' => [
                ['type' => 'product_attribute_picker', 'label' => 'Product Attribute'],
            ],
        ];

        $allowed = $this->validator->allowedTypesFromConfig($config);

        self::assertSame(['Acme\Rule\Condition\Combine'], $allowed);
        self::assertFalse($this->validator->isValid(['type' => 'product_attribute_picker'], $allowed));
    }

    /**
     * A degenerate config (missing keys, malformed field entries) degrades to an empty or partial
     * list instead of erroring.
     *
     * @return void
     */
    public function testAllowedTypesFromConfigToleratesDegenerateShapes(): void
    {
        self::assertSame([], $this->validator->allowedTypesFromConfig([]));
        self::assertSame(
            ['Acme\Rule\Condition\Combine'],
            $this->validator->allowedTypesFromConfig([
                'combineType' => 'Acme\Rule\Condition\Combine',
                'fields' => ['not-a-field', ['label' => 'typeless'], ['type' => ''], ['childType' => 123]],
            ])
        );
    }

    /**
     * With an empty allowed set, only the empty tree passes — a fail-closed default.
     *
     * @return void
     */
    public function testEmptyAllowedSetAcceptsOnlyTheEmptyTree(): void
    {
        self::assertTrue($this->validator->isValid([], []));
        self::assertFalse($this->validator->isValid(['type' => 'Acme\Rule\Condition\Combine'], []));
    }

    /**
     * Build a chain of nested combines with the given number of levels.
     *
     * @param int $levels Total node count from root to the deepest node
     * @return array<string, mixed> Root node of the chain
     */
    private function chainOfDepth(int $levels): array
    {
        $node = ['type' => 'Acme\Rule\Condition\Combine', 'aggregator' => 'all', 'value' => '1'];
        for ($i = 1; $i < $levels; $i++) {
            $node = [
                'type' => 'Acme\Rule\Condition\Combine',
                'aggregator' => 'all',
                'value' => '1',
                'conditions' => [$node],
            ];
        }

        return $node;
    }
}
