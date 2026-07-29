<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit\Model;

use Hryvinskyi\UiFormElements\Model\OperatorSetPolicy;
use Magento\Framework\Phrase;
use PHPUnit\Framework\TestCase;

/**
 * Pins the exact operator subset per attribute input type.
 *
 * The values (not the label wording) are the contract: a serialised rule stores the operator value
 * verbatim, and Magento's validators only behave distinctly for the values listed here — most
 * notably, multiselect must never regain equality/containment operators, which validators collapse
 * into the same membership check.
 */
final class OperatorSetPolicyTest extends TestCase
{
    /**
     * Policy under test — stateless, so one shared instance is enough.
     */
    private OperatorSetPolicy $policy;

    /**
     * @inheritDoc
     */
    #[\Override]
    protected function setUp(): void
    {
        $this->policy = new OperatorSetPolicy();
    }

    /**
     * Every input type maps to its exact operator value list, unknown types to null.
     *
     * @dataProvider inputTypeProvider
     * @param string $inputType Input type handed to the policy
     * @param list<string>|null $expectedValues Expected operator values in order, or null
     * @return void
     */
    public function testForInputTypeReturnsExactOperatorValues(string $inputType, ?array $expectedValues): void
    {
        $operators = $this->policy->forInputType($inputType);

        if ($expectedValues === null) {
            self::assertNull($operators, sprintf('Input type "%s" must yield no operator subset.', $inputType));

            return;
        }

        self::assertIsArray($operators);
        self::assertSame($expectedValues, array_column($operators, 'value'));
        foreach ($operators as $operator) {
            self::assertInstanceOf(Phrase::class, $operator['label'], 'Operator labels must be translatable.');
        }
    }

    /**
     * Input type to expected operator values.
     *
     * @return array<string, array{0: string, 1: list<string>|null}>
     */
    public static function inputTypeProvider(): array
    {
        $numeric = ['==', '!=', '>=', '>', '<=', '<'];
        $date = ['==', '>=', '<=', '>', '<'];

        return [
            'boolean' => ['boolean', ['==', '!=']],
            'select' => ['select', ['==', '!=', '()', '!()']],
            'multiselect' => ['multiselect', ['()', '!()']],
            'price' => ['price', $numeric],
            'decimal' => ['decimal', $numeric],
            'weight' => ['weight', $numeric],
            'date' => ['date', $date],
            'datetime' => ['datetime', $date],
            'text' => ['text', null],
            'textarea' => ['textarea', null],
            'media_image' => ['media_image', null],
            'empty string' => ['', null],
        ];
    }

    /**
     * Multiselect offers exactly the membership pair — nothing Magento's validator would collapse.
     *
     * @return void
     */
    public function testMultiselectHasExactlyTheMembershipPair(): void
    {
        $operators = $this->policy->forInputType('multiselect');

        self::assertIsArray($operators);
        self::assertSame(['()', '!()'], array_column($operators, 'value'));
        self::assertSame(
            array_column($this->policy->membership(), 'value'),
            array_column($operators, 'value'),
            'Multiselect must offer the same pair membership() exposes.'
        );
    }

    /**
     * The membership pair is is-in / is-not-in with translatable labels.
     *
     * @return void
     */
    public function testMembershipReturnsExactPair(): void
    {
        $membership = $this->policy->membership();

        self::assertSame(['()', '!()'], array_column($membership, 'value'));
        foreach ($membership as $operator) {
            self::assertInstanceOf(Phrase::class, $operator['label'], 'Membership labels must be translatable.');
        }
    }

    /**
     * Numeric and date types all carry the four comparison operators.
     *
     * @dataProvider comparisonInputTypeProvider
     * @param string $inputType Numeric or date input type
     * @return void
     */
    public function testComparisonTypesIncludeAllFourComparisons(string $inputType): void
    {
        $operators = $this->policy->forInputType($inputType);

        self::assertIsArray($operators);
        $values = array_column($operators, 'value');
        foreach (['>=', '>', '<=', '<'] as $comparison) {
            self::assertContains($comparison, $values, sprintf('"%s" must offer %s.', $inputType, $comparison));
        }
    }

    /**
     * Input types that must carry the comparison operators.
     *
     * @return array<string, array{0: string}>
     */
    public static function comparisonInputTypeProvider(): array
    {
        return [
            'price' => ['price'],
            'decimal' => ['decimal'],
            'weight' => ['weight'],
            'date' => ['date'],
            'datetime' => ['datetime'],
        ];
    }

    /**
     * sets() publishes one entry per recognised input type, each equal to what forInputType()
     * answers for that type — the map a consumer's config ships once so attribute descriptors can
     * name their set instead of embedding it.
     *
     * @return void
     */
    public function testSetsMirrorsForInputTypePerRecognisedType(): void
    {
        $sets = $this->policy->sets();

        self::assertSame(
            ['boolean', 'select', 'multiselect', 'price', 'decimal', 'weight', 'date', 'datetime'],
            array_keys($sets),
            'One named set per recognised input type — aliases included, since descriptors name the type they were judged by.'
        );

        foreach ($sets as $inputType => $set) {
            self::assertEquals(
                $this->policy->forInputType($inputType),
                $set,
                sprintf('The published "%s" set must be exactly what forInputType() answers.', $inputType)
            );
        }
    }
}
