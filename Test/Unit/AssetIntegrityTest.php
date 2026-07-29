<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Guards the expression-builder's asset contract.
 *
 * The Knockout template is resolved from a path string inside the JS component's `defaults`, so a moved or
 * renamed asset fails silently in the browser instead of at compile time. These checks are cheap and catch the
 * whole class of breakage a rename causes.
 */
class AssetIntegrityTest extends TestCase
{
    private const MODULE_NAME = 'Hryvinskyi_UiFormElements';

    /**
     * Every spelling of a consumer's domain that must not appear in this module: attribute codes,
     * user-facing wording, retired consumer-shaped config sub-keys, and the consumers' own names.
     *
     * @var list<string>
     */
    private const CONSUMER_VOCABULARY = [
        'bz_',
        'page_type',
        'category_page',
        'product_page',
        'Show on every page',
        'Page Type',
        'pageTypeAttribute',
        'categoryAttribute',
        'Matches %1',
        'BannerZone',
        'ProductShowcase',
    ];

    /**
     * Absolute path to the module root.
     *
     * @return string
     */
    private function moduleDir(): string
    {
        return dirname(__DIR__, 2);
    }

    /**
     * Read one of the module's web assets.
     *
     * @param string $relativePath Path below view/adminhtml/web
     * @return string
     */
    private function asset(string $relativePath): string
    {
        $path = $this->moduleDir() . '/view/adminhtml/web/' . $relativePath;
        self::assertFileExists($path, sprintf('Asset %s is missing.', $relativePath));

        return (string)file_get_contents($path);
    }

    /**
     * All assets the element needs are present.
     *
     * @return void
     */
    public function testAllAssetsExist(): void
    {
        $this->asset('js/form/element/expression-builder.js');
        $this->asset('template/form/element/expression-builder.html');
        $this->asset('template/form/element/expression-group.html');
        $this->asset('template/form/element/expression-preview.html');
        $this->asset('css/expression-builder.css');
    }

    /**
     * The pure modules (tree structure + leaf values + option indexing) and their Node test harness ship
     * together.
     *
     * The pure modules' behavioural tests run outside PHPUnit (plain Node, no build step), so this suite can
     * only guarantee they exist — a deleted runner or harness file would otherwise go unnoticed until someone
     * tries to run it.
     *
     * @return void
     */
    public function testPureModulesAndNodeHarnessExist(): void
    {
        $this->asset('js/form/element/expression-tree.js');
        $this->asset('js/form/element/expression-value.js');
        $this->asset('js/form/element/expression-options.js');

        foreach ([
            'run.mjs',
            'amd-shim.mjs',
            'expression-tree.test.mjs',
            'expression-value.test.mjs',
            'expression-options.test.mjs',
        ] as $file) {
            self::assertFileExists(
                $this->moduleDir() . '/Test/Js/' . $file,
                sprintf('Node test harness file Test/Js/%s is missing.', $file)
            );
        }
    }

    /**
     * The component resolves its own template from this module, not from whichever module used to own it.
     *
     * @return void
     */
    public function testComponentPointsAtThisModulesTemplate(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertStringContainsString(
            self::MODULE_NAME . '/form/element/expression-builder',
            $js,
            'The component must resolve its template from this module.'
        );
        self::assertMatchesRegularExpression(
            '/template:\s*\'' . preg_quote(self::MODULE_NAME, '/') . '\/form\/element\/expression-builder\'/',
            $js,
            'The `template` default must name this module.'
        );
    }

    /**
     * The component delegates the tree shape and the structural queries to the tree model.
     *
     * The recursive group model, the frozen Combine property order and the structural queries live
     * in expression-tree.js; the component must load that module and route (de)serialisation
     * through it, or the two files drift apart and saved rules silently change shape.
     *
     * @return void
     */
    public function testComponentDelegatesToTheTreeModel(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertStringContainsString(
            self::MODULE_NAME . '/js/form/element/expression-tree',
            $js,
            'The component must require the expression-tree module.'
        );
        self::assertStringContainsString(
            'expressionTree.treeToModel(',
            $js,
            'Loading must go through the tree model.'
        );
        self::assertStringContainsString(
            'expressionTree.modelToTree(',
            $js,
            'Serialising must go through the tree model.'
        );
    }

    /**
     * Both templates name the group template: the builder template for the root include, the group
     * template for its own recursion.
     *
     * The name is resolved at render time, so renaming the file without updating either reference
     * renders an empty builder with no error anywhere but the browser console.
     *
     * @return void
     */
    public function testGroupTemplateIsNamedInBothTemplates(): void
    {
        $groupTemplateName = self::MODULE_NAME . '/form/element/expression-group';

        foreach ([
            'template/form/element/expression-builder.html',
            'template/form/element/expression-group.html',
        ] as $relativePath) {
            self::assertStringContainsString(
                $groupTemplateName,
                $this->asset($relativePath),
                sprintf('%s must reference the group template by its full name.', $relativePath)
            );
        }
    }

    /**
     * Both templates name the preview template: the builder template for the structured-preview
     * include, the preview template for its own recursion into child groups.
     *
     * Same failure mode as the group template: the name resolves at render time, so a rename
     * renders an empty preview with no error anywhere but the browser console.
     *
     * @return void
     */
    public function testPreviewTemplateIsNamedInBothTemplates(): void
    {
        $previewTemplateName = self::MODULE_NAME . '/form/element/expression-preview';

        foreach ([
            'template/form/element/expression-builder.html',
            'template/form/element/expression-preview.html',
        ] as $relativePath) {
            self::assertStringContainsString(
                $previewTemplateName,
                $this->asset($relativePath),
                sprintf('%s must reference the preview template by its full name.', $relativePath)
            );
        }
    }

    /**
     * The structured preview can actually render something, and its template is asked for before
     * anything needs it.
     *
     * This exists because of a failure that is invisible from every other angle. The preview is the
     * one template rendered behind a condition — it exists only once the authored rule has something
     * to show — so on a form that opens empty, the binding that names it, and therefore the REQUEST
     * for it, is created at the instant the admin adds their first condition. Until that request
     * lands the binding has nothing to render; if it ever fails, the renderer memoises the failure
     * and the area stays blank for the rest of the page's life. Either way the DOM is a live preview
     * element with no content and no error anywhere, which reads as "this rule is empty" over a rule
     * that is not — so the component asks for the template up front, and that is pinned here
     * together with the template being able to produce tokens at all.
     *
     * The template's own content is asserted for the same reason: an emptied or truncated
     * expression-preview.html breaks nothing that any other test can see. It would simply render
     * nothing, forever.
     *
     * @return void
     */
    public function testPreviewTemplateIsPreloadedAndCanRenderTokens(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $builder = $this->asset('template/form/element/expression-builder.html');
        $preview = $this->asset('template/form/element/expression-preview.html');
        $name = self::MODULE_NAME . '/form/element/expression-preview';

        self::assertStringContainsString(
            "PREVIEW_TEMPLATE = '" . $name . "'",
            $js,
            'The component must name the preview template it warms, and name it exactly as the markup does.'
        );
        self::assertStringContainsString(
            'renderer.render(PREVIEW_TEMPLATE)',
            $js,
            'The preview template must be requested up front, not first at the moment a rule stops being empty.'
        );
        self::assertStringContainsString(
            'this._preloadPreviewTemplate()',
            $js,
            'The warm-up must actually be reached from initialize().'
        );
        self::assertStringContainsString(
            "typeof window === 'undefined' || typeof window.require !== 'function'",
            $js,
            'The warm-up must degrade to nothing without a module loader — and the guard has to test the '
            . 'global itself, since it runs from initialize(), where a headless harness may not declare '
            . 'window at all and a property read would be a ReferenceError.'
        );
        self::assertStringContainsString(
            $name,
            $builder,
            'The builder template must render the very template the component warms.'
        );

        // The preview template has to be able to produce visible tokens. Emptying it would render an
        // authored rule as a blank area, which is indistinguishable from an empty rule.
        foreach ([
            'class="ufe-expr__preview-field"',
            'class="ufe-expr__preview-op"',
            'class="ufe-expr__preview-value"',
            "child.kind === 'condition'",
            "child.kind === 'group'",
            'node.children',
        ] as $needle) {
            self::assertStringContainsString(
                $needle,
                $preview,
                sprintf('The preview template must still carry %s, or it renders nothing at all.', $needle)
            );
        }

        // The component must emit exactly the two node kinds the template branches on — a third kind
        // would render as nothing, silently.
        preg_match_all('/kind:\s*\'([a-z]+)\'/', $js, $kinds);
        self::assertSame(
            ['condition', 'group'],
            array_values(array_unique($kinds[1])),
            'The preview and view-model nodes may only be conditions and groups; the template branches on those two.'
        );
    }

    /**
     * No asset still references the module that previously owned these files.
     *
     * @return void
     */
    public function testNoStaleModuleReferences(): void
    {
        foreach ([
            'js/form/element/expression-builder.js',
            'js/form/element/expression-tree.js',
            'js/form/element/expression-value.js',
            'js/form/element/expression-options.js',
            'template/form/element/expression-builder.html',
            'template/form/element/expression-group.html',
            'template/form/element/expression-preview.html',
            'css/expression-builder.css',
        ] as $relativePath) {
            $contents = $this->asset($relativePath);

            self::assertStringNotContainsString(
                'Hryvinskyi_BannerZone',
                $contents,
                sprintf('%s still references its previous owning module.', $relativePath)
            );
            self::assertStringNotContainsString(
                'bz-',
                $contents,
                sprintf('%s still uses the previous owner\'s CSS prefix.', $relativePath)
            );
        }
    }

    /**
     * Every class the templates render is styled, and every styled class is prefixed for this module.
     *
     * @return void
     */
    public function testTemplateClassesAreStyledAndPrefixed(): void
    {
        $templates = $this->asset('template/form/element/expression-builder.html')
            . "\n" . $this->asset('template/form/element/expression-group.html')
            . "\n" . $this->asset('template/form/element/expression-preview.html');
        $css = $this->asset('css/expression-builder.css');

        preg_match_all('/ufe-[a-z0-9_-]+/', $templates, $templateMatches);
        preg_match_all('/ufe-[a-z0-9_-]+/', $css, $cssMatches);

        $templateTokens = array_unique($templateMatches[0]);
        $cssTokens = array_unique($cssMatches[0]);

        self::assertNotEmpty($templateTokens, 'The templates render no prefixed classes at all.');
        self::assertNotEmpty($cssTokens, 'The stylesheet defines no prefixed classes at all.');

        foreach ($templateTokens as $token) {
            self::assertContains(
                $token,
                $cssTokens,
                sprintf('Class %s is rendered by a template but never styled.', $token)
            );
        }
    }

    /**
     * Every member the templates bind to actually exists, and the binding-context chain is used
     * only for the two names the recursive template contract defines.
     *
     * Knockout resolves these names at render time, so a template referencing a member the
     * component never defines fails only in the browser, as an uncaught TypeError on user
     * interaction — exactly how a missing closeDropdown() once shipped unnoticed. And because the
     * group template renders against a plain {group, builder, depth} data object at every nesting
     * level, all component access must go through `builder` at a fixed distance: reaching anything
     * else through $parent/$parents (or $root) would depend on how deep a group happens to sit and
     * break silently the moment nesting changes.
     *
     * @return void
     */
    public function testTemplateBindsOnlyToMembersTheComponentDefines(): void
    {
        $templates = [
            'template/form/element/expression-builder.html' => $this->asset('template/form/element/expression-builder.html'),
            'template/form/element/expression-group.html' => $this->asset('template/form/element/expression-group.html'),
            'template/form/element/expression-preview.html' => $this->asset('template/form/element/expression-preview.html'),
        ];
        $combined = implode("\n", $templates);
        $js = $this->asset('js/form/element/expression-builder.js');

        preg_match_all('/\bbuilder\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/', $combined, $methodMatches);
        $calledMethods = array_unique($methodMatches[1]);
        self::assertNotEmpty($calledMethods, 'The templates call no component methods at all — the regex is broken.');

        foreach ($calledMethods as $method) {
            self::assertMatchesRegularExpression(
                '/\b' . preg_quote($method, '/') . ':\s*function\s*\(/',
                $js,
                sprintf('Templates call builder.%s(), but the component never defines it.', $method)
            );
        }

        preg_match_all('/\brow\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/', $combined, $rowMatches);
        $rowMembers = array_unique($rowMatches[1]);
        self::assertNotEmpty($rowMembers, 'The templates read no row observables at all — the regex is broken.');

        foreach ($rowMembers as $member) {
            self::assertMatchesRegularExpression(
                '/\b' . preg_quote($member, '/') . ':\s*ko\.observable/',
                $js,
                sprintf('Templates read row.%s(), but the row view-model never creates that observable.', $member)
            );
        }

        preg_match_all('/\bgroup\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/', $combined, $groupMatches);
        $groupMembers = array_unique($groupMatches[1]);
        self::assertNotEmpty($groupMembers, 'The templates read no group observables at all — the regex is broken.');

        foreach ($groupMembers as $member) {
            self::assertMatchesRegularExpression(
                '/\b' . preg_quote($member, '/') . ':\s*ko\.observable/',
                $js,
                sprintf('Templates read group.%s(), but the group view-model never creates that observable.', $member)
            );
        }

        foreach ($templates as $relativePath => $contents) {
            self::assertDoesNotMatchRegularExpression(
                '/\$parents?(?:\[\d+\])?\.(?!builder\b|depth\b)/',
                $contents,
                sprintf(
                    '%s reaches through the binding-context chain for something other than builder/depth.',
                    $relativePath
                )
            );
            self::assertStringNotContainsString(
                '$root',
                $contents,
                sprintf('%s must not use $root — component access goes through builder.', $relativePath)
            );
        }
    }

    /**
     * The membership operator set is spelled in exactly one place.
     *
     * Which operators take a list of alternatives decides two things that must never disagree: how the
     * value module shapes a stored value, and which editor the template renders over it. The set lives
     * in the value module, which exposes the test; a component predicate delegates to it once and the
     * templates ask that predicate. Re-spelling the pair anywhere in the component or the templates is
     * the drift this pins out — a consumer registering a third membership operator would otherwise get
     * list-shaped serialisation behind a single-value editor, quietly replacing a stored list with one
     * entry on the next save. The tree model is deliberately outside the sweep: it names operators to
     * reason about what they ASSERT (the contradiction solver), never to choose an editor.
     *
     * @return void
     */
    public function testTheMembershipOperatorSetHasASingleDefinition(): void
    {
        $value = $this->asset('js/form/element/expression-value.js');
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertStringContainsString(
            'LIST_OPERATORS',
            $value,
            'The value module must hold the one definition of the membership operator set.'
        );
        self::assertStringContainsString(
            'isListOperator: isListOperator',
            $value,
            'The value module must export the membership test, or nothing can delegate to it.'
        );

        self::assertSame(
            1,
            substr_count($js, 'expressionValue.isListOperator('),
            'The component reaches the value module\'s membership test through one delegating method.'
        );
        self::assertMatchesRegularExpression(
            '/rowUsesListOperator:\s*function\s*\(/',
            $js,
            'That delegating method is what the templates and the component\'s predicates call.'
        );

        $group = $this->asset('template/form/element/expression-group.html');
        self::assertStringContainsString(
            'builder.rowUsesListOperator(',
            $group,
            'The template must decide list-versus-scalar through the component, not by itself.'
        );

        foreach ([
            'js/form/element/expression-builder.js',
            'template/form/element/expression-builder.html',
            'template/form/element/expression-group.html',
        ] as $relativePath) {
            self::assertStringNotContainsString(
                "'!()'",
                $this->asset($relativePath),
                sprintf(
                    '%s spells a membership operator out: the set has one definition and one test.',
                    $relativePath
                )
            );
        }
    }

    /**
     * The capped option helpers are read through their `{items, capped}` shape, never as plain arrays.
     *
     * A dropdown reads its options from a helper that also has to report whether the match list was
     * truncated, so the helpers answer an object. Knockout resolves the property at render time: a
     * template left reading `.length` off that object gets `undefined`, renders no options and no
     * error — an empty dropdown with a healthy console. This pins every access in the templates to
     * one of the two documented keys, and pins the flag itself to the search that produces it.
     *
     * @return void
     */
    public function testCappedOptionHelpersAreReadThroughTheItemsShape(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');

        preg_match_all(
            '/builder\.(?:filteredOptionsFor|filteredProductAttributeOptions|filteredSearchableOptions)'
            . '\(row[^)]*\)(\.[A-Za-z_][A-Za-z0-9_]*)?/',
            $group,
            $matches
        );

        self::assertNotEmpty($matches[0], 'No template reads the capped option helpers at all — the regex is broken.');

        foreach ($matches[1] as $accessor) {
            self::assertContains(
                $accessor,
                ['.items', '.capped'],
                'The capped option helpers answer {items, capped}: a template must read one of those keys.'
            );
        }

        self::assertStringContainsString(
            'capped:',
            $this->asset('js/form/element/expression-options.js'),
            'The breadcrumb search must report whether its walk stopped at the cap.'
        );
        self::assertStringContainsString(
            'capped:',
            $this->asset('js/form/element/expression-builder.js'),
            'The component must pass the cap state on to the dropdown.'
        );
    }

    /**
     * Mouse selection inside a dropdown commits on `click`, with the list container holding focus.
     *
     * Three things make that work and all three have to stay together: the container suppresses
     * mousedown so the bound input never blurs, the entries commit on click, and blur closes the
     * list at once. Half of it — click commits without the container guard — steals focus and
     * closes the list before the click lands, which is exactly the bug the old deferred close was
     * papering over. A committing `mousedown` handler anywhere would be the other half of the
     * regression: two commit paths racing over one pick.
     *
     * @return void
     */
    public function testDropdownCommitsHappenOnClickBehindTheFocusGuard(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $js = $this->asset('js/form/element/expression-builder.js');
        $dropdownCount = substr_count($group, 'class="ufe-expr__autocomplete-list"');

        self::assertGreaterThan(0, $dropdownCount, 'The template renders no dropdown list at all.');

        preg_match_all('/mousedown:(.{0,120})/s', $group, $mousedownHandlers);
        self::assertCount(
            $dropdownCount,
            $mousedownHandlers[0],
            'Every dropdown list — and nothing else — binds mousedown, to hold the input\'s focus.'
        );

        foreach ($mousedownHandlers[1] as $handler) {
            self::assertStringContainsString(
                'keepInputFocus',
                $handler,
                'The only mousedown handler allowed is the focus guard; commits belong on click.'
            );
        }

        self::assertSame(
            $dropdownCount,
            substr_count($group, '.keepInputFocus('),
            'Each dropdown list needs its own focus guard — bubbling only covers its own subtree.'
        );

        foreach ([$group, $js] as $contents) {
            self::assertStringNotContainsString(
                'deferCloseDropdown',
                $contents,
                'The deferred close is gone: two close paths mean untestable zombie states.'
            );
        }

        preg_match_all('/blur:(.{0,120})/s', $group, $blurHandlers);
        self::assertNotEmpty($blurHandlers[0], 'No input closes its dropdown on blur — the regex is broken.');

        foreach ($blurHandlers[1] as $handler) {
            self::assertStringContainsString(
                'closeDropdown',
                $handler,
                'A blur is now genuinely an interaction elsewhere, so it closes the dropdown at once.'
            );
        }
    }

    /**
     * Every dropdown exposes the combobox/listbox relationship a screen reader needs.
     *
     * The relationships are expressed entirely in attributes, so nothing here fails visibly: a
     * missing `aria-activedescendant` leaves the keyboard highlight silent, a missing `role`
     * leaves the popup unannounced, and both look perfect on screen. Counted per dropdown rather
     * than merely "present somewhere", because the four variants are near-identical markup and a
     * change applied to three of them is the likely mistake.
     *
     * @return void
     */
    public function testDropdownsCarryTheComboboxAriaContract(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $dropdownCount = substr_count($group, 'class="ufe-expr__autocomplete-list"');

        foreach ([
            'role="listbox"' => $dropdownCount,
            'listAttrs(row)' => $dropdownCount,
            'role="combobox"' => $dropdownCount,
            'aria-autocomplete="list"' => $dropdownCount,
            'comboboxAttrs(row' => $dropdownCount,
        ] as $needle => $expected) {
            self::assertSame(
                $expected,
                substr_count($group, $needle),
                sprintf('Each of the %d dropdowns must carry %s exactly once.', $dropdownCount, $needle)
            );
        }

        self::assertSame(
            substr_count($group, '<li '),
            substr_count($group, 'role="option"'),
            'Every list item inside a listbox is an option — the advisory ones as disabled options.'
        );
        self::assertSame(
            substr_count($group, 'class="ufe-expr__tree-node"'),
            substr_count($group, 'treeNodeAttrs(row'),
            'Tree entries need their hierarchy attributes (level, expanded) on top of the flat ones.'
        );
        self::assertSame(
            substr_count($group, 'class="ufe-expr__autocomplete-option"'),
            substr_count($group, 'optionAttrs(row'),
            'Flat entries need their id and selection state, or the highlight cannot be announced.'
        );
    }

    /**
     * A tree row is a two-way toggle whose caret is a separate target.
     *
     * The row used to select on click and then go inert: a value already chosen could only be
     * undone by finding its pill above the list, which on a deep hierarchy meant scrolling away
     * from the branch being worked on. So the row toggles, and everything that makes that safe is
     * pinned here — the caret stops its click from reaching the row (otherwise expanding a branch
     * would also select it), the selection state is drawn as a checkbox that is explicitly NOT a
     * control (the row is the option, and its aria-selected is what announces the state, so a
     * nested checkbox role would be invalid inside a listbox and would say the same thing twice),
     * and the keyboard gets the toggle too.
     *
     * The third checkbox state is pinned at its source: it is derived by climbing from the stored
     * values to their ancestors ONCE per render, not by asking each rendered node whether anything
     * below it is selected — that question walks a subtree per row, which on a multi-thousand-entry
     * list is the whole list per top-level node.
     *
     * @return void
     */
    public function testTreeRowsAreTwoWayTogglesWithTheirOwnChevron(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');
        $options = $this->asset('js/form/element/expression-options.js');
        $rows = substr_count($group, 'class="ufe-expr__tree-node"');

        self::assertGreaterThan(0, $rows, 'The template renders no tree rows at all.');
        self::assertMatchesRegularExpression(
            '/toggleTreeNode:\s*function\s*\(/',
            $js,
            'Selecting a tree node must go through one method that also deselects.'
        );

        foreach ([$js, $group] as $contents) {
            self::assertStringNotContainsString(
                'selectTreeNode',
                $contents,
                'The one-way select path is gone: a selected row has to be clickable back off.'
            );
        }

        foreach ([
            'toggleTreeNode(row' => 'Every tree row must bind the toggle.',
            'class="ufe-expr__tree-check"' => 'Every tree row must draw its selection state.',
            'treeCountTitle(' => 'Every tree row must name what its count badge counts.',
        ] as $needle => $message) {
            self::assertSame($rows, substr_count($group, $needle), $message);
        }

        self::assertSame(
            substr_count($group, 'class="ufe-expr__tree-toggle"'),
            substr_count($group, 'e.stopPropagation()'),
            'Each caret must stop its click, or expanding a branch would select it as well.'
        );

        foreach (['role="checkbox"', 'type="checkbox"'] as $forbidden) {
            self::assertStringNotContainsString(
                $forbidden,
                $group,
                'The checkbox is a drawing: a real one inside an option would be invalid and redundant.'
            );
        }

        self::assertStringContainsString(
            'descendantCountByValue',
            $options,
            'The subtree sizes belong to the pure option index, built with the breadcrumbs.'
        );
        self::assertStringContainsString(
            'index.descendantCountByValue[',
            $js,
            'The component must read the counts from the index rather than count per render.'
        );
        self::assertSame(
            1,
            substr_count($js, 'this._selectedAncestorCounts('),
            'The partial-selection state is derived once per render, from the stored value upward.'
        );
        self::assertStringContainsString(
            "key === ' '",
            $js,
            'The keyboard needs the toggle too: Enter on a collapsed branch is spoken for by expansion.'
        );
    }

    /**
     * Expanding a whole hierarchy at once is guarded by a configured size, collapsing is not.
     *
     * Expand-all renders every node in one synchronous pass, which on a catalogue-sized list is
     * thousands of rows and a form that stops responding — so the control is withdrawn above a
     * `defaults` limit a form's XML can retune, read through the same guard every other tunable
     * uses. Collapsing has no limit to respect: it only ever removes rows. A withdrawn control
     * explains nothing by itself, so the surviving sibling carries the reason, and both actions are
     * real buttons in the panel BESIDE the listbox — inside it they would have to pose as options.
     *
     * @return void
     */
    public function testTreeExpandAllIsGuardedByAConfiguredLimit(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');
        $trees = substr_count($group, 'class="ufe-expr__tree-actions"');

        self::assertGreaterThan(0, $trees, 'No dropdown offers the whole-tree actions at all.');
        self::assertMatchesRegularExpression(
            '/treeExpandAllLimit:\s*\d+/',
            $js,
            'The limit must be a `defaults` entry a form\'s XML can retune.'
        );
        self::assertStringContainsString(
            "this._tunable('treeExpandAllLimit')",
            $js,
            'The limit must be read through the tunable guard, so a nonsense XML value cannot hide the action.'
        );
        self::assertStringContainsString(
            '<= this.treeExpandAllLimit',
            $js,
            'The guard must compare the option count against the configured limit.'
        );
        self::assertStringContainsString(
            'this.treeExpandAllLimit)',
            $js,
            'The explanation must name the same limit the guard compares against.'
        );

        foreach ([
            'canExpandAllTreeNodes(row)',
            'expandAllTreeNodes(row)',
            'collapseAllTreeNodes(row)',
            'collapseAllTreeTitle(row)',
        ] as $needle) {
            self::assertSame(
                $trees,
                substr_count($group, $needle),
                sprintf('Each tree dropdown must wire %s exactly once.', $needle)
            );
        }

        self::assertSame(
            $trees * 2,
            substr_count($group, 'class="ufe-expr__tree-action"'),
            'Two actions per tree dropdown, and both of them buttons.'
        );

        preg_match_all(
            '/class="ufe-expr__dropdown"(.*?)<ul class="ufe-expr__autocomplete-list"/s',
            $group,
            $panels
        );
        self::assertCount($trees, $panels[1], 'Every tree dropdown must be a panel wrapping its list.');

        foreach ($panels[1] as $head) {
            self::assertStringContainsString(
                'mousedown',
                $head,
                'The panel holds the focus guard, or a press on the header blurs the input and closes it.'
            );
            self::assertStringContainsString(
                'class="ufe-expr__tree-actions"',
                $head,
                'The header belongs between the panel and the listbox, never inside the listbox.'
            );
        }
    }

    /**
     * A long single-choice option list is a searchable combobox that shows each option's code, and a
     * short one is still a plain `<select>`.
     *
     * Two failures made this control necessary and both are pinned here. A native `<select>` over the
     * catalogue's whole attribute set renders hundreds of options with no search of its own, and —
     * the part search alone cannot fix — several of those options carry the SAME label, differing
     * only in the prefix of their code, which a native option cannot show at all: picking the right
     * one was guesswork. So the control searches label AND code, and it renders the code beside the
     * chosen option and beneath every entry.
     *
     * The escalation is a threshold, not a list of field types, because the plain control is the
     * better one wherever it still works: it opens in one keystroke and the browser owns its
     * keyboard behaviour. Both branches therefore have to exist, and the one that renders is decided
     * by a `defaults` tunable a form's XML can retune.
     *
     * @return void
     */
    public function testLongOptionListsRenderASearchableComboboxShowingCodes(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');
        $combos = substr_count($group, 'class="ufe-expr__combo"');

        self::assertSame(
            3,
            $combos,
            'Three searchable single-selects: the picker\'s Attribute control, a large select field\'s '
            . 'value and a large optioned attribute\'s value.'
        );
        self::assertMatchesRegularExpression(
            '/searchableSelectThreshold:\s*\d+/',
            $js,
            'The escalation threshold must be a `defaults` entry a form\'s XML can retune.'
        );
        self::assertStringContainsString(
            "this._tunable('searchableSelectThreshold')",
            $js,
            'The threshold must be read through the tunable guard, so a nonsense XML value cannot blank a control.'
        );
        self::assertStringContainsString(
            '> this.searchableSelectThreshold',
            $js,
            'The guard must compare the option count against the configured threshold.'
        );

        foreach ([
            'rowUsesPlainValueSelect(row)' => 'A short list must keep its plain select — nothing regresses for it.',
            'rowUsesSearchableValueSelect(row)' => 'A long list must escalate to the searchable control.',
        ] as $needle => $message) {
            self::assertSame(1, substr_count($group, $needle), $message);
        }

        // The ranking lives in the pure module and is reached from ONE place, so both controls order
        // their matches identically and the order is node-testable without a browser.
        self::assertStringContainsString(
            'optionSearch: optionSearch',
            $this->asset('js/form/element/expression-options.js'),
            'The label-and-code search belongs to the pure option module.'
        );
        self::assertSame(
            1,
            substr_count($js, 'expressionOptions.optionSearch('),
            'One search call site, so the two controls cannot rank their matches differently.'
        );

        foreach ([
            'class="ufe-expr__combo-input"' => 'Each control is one input carrying the chosen label.',
            'class="ufe-expr__combo-code"' => 'Each control shows the chosen option\'s code beside the label.',
            'comboCodeDomId(' => 'The code element is the input\'s description, so it needs its id.',
            'class="ufe-expr__option-label"' => 'Each dropdown entry renders its label.',
            'class="ufe-expr__option-code"' => 'Each dropdown entry renders its code — the disambiguator.',
            'commitSearchableSelect(row' => 'Each control commits through the registry, never by writing directly.',
        ] as $needle => $message) {
            self::assertSame($combos, substr_count($group, $needle), $message);
        }

        self::assertStringContainsString(
            'comboQuery: ko.observable',
            $js,
            'The control needs a query of its own — see the per-block assertions below.'
        );
        self::assertStringContainsString(
            "row.comboQuery('')",
            $js,
            'Closing must drop that query: it described a list that is going away.'
        );

        // The marker deliberately stops before the closing `>`: the combo's opening tag carries a
        // click binding (the whole control face focuses the input, like the `<select>` it
        // replaces), and a marker demanding a bare tag would silently match nothing. The count is
        // asserted for the same reason — a vacuous sweep here once passed unnoticed.
        $comboBlocks = $this->markupOf($group, '<div class="ufe-expr__combo"');
        self::assertCount($combos, $comboBlocks, 'Every searchable select must be reached by the per-block sweep.');

        foreach ($comboBlocks as $index => $markup) {
            $control = sprintf('Searchable select %d', $index + 1);

            self::assertStringContainsString(
                'focusComboInput(',
                substr($markup, 0, (int)strpos($markup, '>')),
                sprintf('%s must make its whole face clickable — the code half is most of the control.', $control)
            );

            // Single-select: the pills are the multi-value editors' and must not turn up here.
            self::assertStringNotContainsString(
                'ufe-expr__pill',
                $markup,
                sprintf('%s renders pills: it settles ONE option.', $control)
            );
            self::assertStringNotContainsString(
                'aria-hidden',
                $markup,
                sprintf(
                    '%s hides part of itself from assistive technology: the code is what tells '
                    . 'identically-labelled options apart, for every reader.',
                    $control
                )
            );

            // Its own query observable, at every one of the three places a query is read. The value
            // editors' searchText is bound TWO-WAY into their own visible input, so a shared
            // observable showed this control's typing over there.
            self::assertSame(
                3,
                substr_count($markup, 'row.comboQuery()'),
                sprintf('%s must read its own query in its attrs, its render condition and its keydown.', $control)
            );
            self::assertStringNotContainsString(
                'row.searchText',
                $markup,
                sprintf('%s must not share the value editors\' query — it would appear in their input.', $control)
            );

            // One-way display plus an input handler, never textInput: the input renders the CHOSEN
            // LABEL while the list is closed and the query while it is open, which a two-way binding
            // cannot express — it would write the label back over the query on every re-render.
            self::assertStringNotContainsString(
                'textInput:',
                $markup,
                sprintf('%s must bind its input one-way; the closed state is not the query.', $control)
            );
            self::assertStringContainsString(
                'updateSearchableQuery(row',
                $markup,
                sprintf('%s needs the input handler that is its single write path for typing.', $control)
            );
        }
    }

    /**
     * The searchable control is wired to option lists that are actually long, and to nothing else.
     *
     * Field and Operator are single-choice lists too, and both are deliberately left as plain
     * `<select>`s: they hold a handful of entries, so a combobox would add a dropdown to manage and
     * take away the browser's own type-to-select for no gain. The pin is on the registry — the one
     * place a control's option source is declared — plus the surviving selects in the markup, since
     * "we simply did not convert them" is not a property anything else would notice breaking.
     *
     * @return void
     */
    public function testFieldAndOperatorStayPlainSelects(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');
        $registry = $this->markupOf($js, 'var SEARCHABLE_SELECTS = {')[0] ?? '';

        self::assertNotSame('', $registry, 'The searchable-select registry is gone — the sweep would be vacuous.');

        foreach (['availableFieldsFor', 'operatorsFor'] as $source) {
            self::assertStringNotContainsString(
                $source,
                $registry,
                sprintf('%s must not feed a searchable select: those lists hold a handful of entries.', $source)
            );
        }

        self::assertSame(
            4,
            substr_count($group, 'class="ufe-expr__select"'),
            'Four plain selects survive: Field, Operator, a short select field\'s value, an optioned '
            . 'attribute\'s value.'
        );

        foreach ([
            'options: $parent.builder.availableFieldsFor(row),' => 'Field is a plain select over the field list.',
            'options: $parent.builder.operatorsFor(row),' => 'Operator is a plain select over the operator list.',
        ] as $needle => $message) {
            self::assertSame(1, substr_count($group, $needle), $message);
        }
    }

    /**
     * Every dropdown names the combobox it belongs to, and only the names the component knows.
     *
     * A row hosts more than one combobox now — the Attribute picker beside a value editor that may
     * itself be one — and they share the row's search text, open flag and highlight. Without a name
     * on each dropdown, focusing one input opens BOTH lists, the keyboard's Enter commits into
     * whichever branch answers first, and the two hand each other's queries around. None of that
     * fails visibly: two open lists look like a rendering glitch and the wrong commit looks like a
     * mis-click. So the naming is asserted per call site rather than merely somewhere.
     *
     * @return void
     */
    public function testEveryDropdownNamesTheComboboxItBelongsTo(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');
        $dropdowns = substr_count($group, 'class="ufe-expr__autocomplete-list"');

        self::assertStringContainsString(
            'dropdownControl: ko.observable',
            $js,
            'The open dropdown\'s owner is row state, or nothing can tell the row\'s comboboxes apart.'
        );

        $names = [];

        foreach ([
            // Two openers, one contract: the value editors open the dropdown directly, a searchable
            // select goes through its own opener (which also drops the previous query) — both name
            // the control they are opening.
            '/open(?:Dropdown|SearchableSelect)\(row(?:,\s*\'([a-z-]+)\')?\)/' => 'an opener',
            // The intervening arguments are themselves calls, so the scan is bounded by the line
            // rather than by the next closing parenthesis.
            '/dropdownListVisible\(row,[^\n]*?\'([a-z-]*)\'\)/' => 'dropdownListVisible',
            '/comboboxAttrs\(row,[^\n]*?\'([a-z-]*)\'\)/' => 'comboboxAttrs',
        ] as $pattern => $method) {
            preg_match_all($pattern, $group, $matches);
            self::assertCount(
                $dropdowns,
                $matches[0],
                sprintf('Each of the %d dropdowns must pass its control name to %s.', $dropdowns, $method)
            );

            foreach ($matches[1] as $name) {
                self::assertNotSame(
                    '',
                    $name,
                    sprintf('A %s call in the template names no control.', $method)
                );
                $names[$name] = true;
            }
        }

        $used = array_keys($names);
        sort($used, SORT_STRING);

        self::assertSame(
            ['attribute', 'attribute-value', 'value', 'value-select'],
            $used,
            'The template uses exactly the four control names, no more and no fewer.'
        );

        // Every name that is not the shared value-editor one has to be a registry entry, or its
        // dropdown resolves to no option source and renders an empty list.
        foreach (array_keys($names) as $name) {
            if ($name === 'value') {
                continue;
            }
            self::assertMatchesRegularExpression(
                "/'" . preg_quote($name, '/') . "':\s*\{/",
                $js,
                sprintf('The template opens a "%s" dropdown, but the registry has no such entry.', $name)
            );
        }
    }

    /**
     * Every occurrence of one opening marker, each taken up to the end of the block it opens.
     *
     * Brace/tag counting rather than a regex, because both the markup blocks and the JS object this
     * is used on nest — a non-greedy match would stop at the first inner close.
     *
     * @param string $contents File contents.
     * @param string $marker Opening line to find, e.g. `<div class="…">` or `var X = {`.
     * @return array<int, string> One block per occurrence, marker included.
     */
    private function markupOf(string $contents, string $marker): array
    {
        $blocks = [];
        $isMarkup = str_starts_with($marker, '<');
        $open = $isMarkup ? '<div' : '{';
        $close = $isMarkup ? '</div>' : '}';

        foreach ($this->offsetsOf($contents, $marker) as $start) {
            $depth = 0;
            $offset = $start;

            while ($offset < strlen($contents)) {
                $nextOpen = strpos($contents, $open, $offset);
                $nextClose = strpos($contents, $close, $offset);

                if ($nextClose === false) {
                    break;
                }

                if ($nextOpen !== false && $nextOpen < $nextClose) {
                    $depth++;
                    $offset = $nextOpen + strlen($open);

                    continue;
                }
                $depth--;
                $offset = $nextClose + strlen($close);

                if ($depth <= 0) {
                    break;
                }
            }
            $blocks[] = substr($contents, $start, $offset - $start);
        }

        return $blocks;
    }

    /**
     * Every button in the templates has an accessible name.
     *
     * A name comes from one of two places: text a sighted user can also read, or an aria-label
     * where the button is an icon. A `title` is not a third option — content wins over it, so an
     * icon button whose glyph is hidden from assistive technology and whose name lives only in a
     * title announces nothing at all, which is how the builder's remove and caret buttons started
     * out. This walks the markup rather than naming individual controls, so a button added later
     * cannot skip the sweep.
     *
     * @return void
     */
    public function testEveryTemplateButtonHasAnAccessibleName(): void
    {
        foreach ([
            'template/form/element/expression-builder.html',
            'template/form/element/expression-group.html',
            'template/form/element/expression-preview.html',
        ] as $relativePath) {
            $contents = $this->asset($relativePath);
            $chunks = explode('<button', $contents);
            array_shift($chunks);

            foreach ($chunks as $index => $chunk) {
                $element = strstr($chunk, '</button>', true);
                self::assertIsString(
                    $element,
                    sprintf('Button %d in %s is never closed.', $index + 1, $relativePath)
                );
                self::assertTrue(
                    str_contains((string)$element, 'aria-label')
                        || $this->hasVisibleLabel((string)$element),
                    sprintf(
                        'Button %d in %s has no accessible name: it renders no visible text, so it '
                        . 'needs an aria-label.',
                        $index + 1,
                        $relativePath
                    )
                );
            }
        }
    }

    /**
     * True when an element's markup renders text that assistive technology can read — any span
     * that is not hidden from it. A button built only from `aria-hidden` glyph spans has no
     * readable text and must name itself.
     *
     * @param string $element Markup of one element including its content.
     * @return bool
     */
    private function hasVisibleLabel(string $element): bool
    {
        preg_match_all('/<span([^>]*)>/', $element, $spans);

        foreach ($spans[1] as $attributes) {
            if (!str_contains($attributes, 'aria-hidden')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Neither the assets nor the PHP carries a consumer's domain vocabulary.
     *
     * It previously hardcoded one consumer's attribute codes and wording, which meant a second consumer got
     * warnings that made no sense for it and — worse — had its own fields gated behind a field it never
     * declared. Wording and semantic rules must arrive through the config contract. The retired coherence
     * sub-keys `pageTypeAttribute` and `categoryAttribute` are consumer-shaped vocabulary too: the config
     * names one generic context attribute and per-key requirements, so neither may resurface in the JS.
     * The match-count wording is the same kind of vocabulary — what is being counted is the consumer's
     * knowledge, so its template must not appear here either; the component contributes the number.
     *
     * Two things widen the sweep beyond the JS, both because a leak had slipped through each gap:
     * the consumers' bare NAMES count as vocabulary (naming one in a comment describes the shared
     * component in terms of who happens to use it, and the module-name form `Hryvinskyi_BannerZone`
     * is only the most obvious spelling), and the PHP is swept alongside the assets (an `Api/`
     * docblock quoting a consumer's phrase publishes that phrase just as loudly as the JS would).
     *
     * @return void
     */
    public function testComponentCarriesNoDomainVocabulary(): void
    {
        $sources = [];

        foreach ([
            'js/form/element/expression-builder.js',
            'js/form/element/expression-tree.js',
            'js/form/element/expression-value.js',
            'js/form/element/expression-options.js',
            'template/form/element/expression-group.html',
            'template/form/element/expression-preview.html',
        ] as $relativePath) {
            $sources[$relativePath] = $this->asset($relativePath);
        }

        foreach ($this->sweepablePhpFiles() as $relativePath => $contents) {
            $sources[$relativePath] = $contents;
        }

        foreach ($sources as $relativePath => $contents) {
            foreach (self::CONSUMER_VOCABULARY as $needle) {
                self::assertStringNotContainsString(
                    $needle,
                    $contents,
                    sprintf(
                        'The shared module must not hardcode "%s" — it belongs in a consumer\'s config (%s).',
                        $needle,
                        $relativePath
                    )
                );
            }
        }
    }

    /**
     * Every PHP file of this module except the two guards that have to spell the forbidden names out
     * in order to search for them, keyed by module-relative path.
     *
     * Both exclusions are asserted to be IN the scan before they are dropped, so neither can quietly
     * become an exclusion of nothing after a rename.
     *
     * @return array<string, string> Relative path → contents
     */
    private function sweepablePhpFiles(): array
    {
        $moduleDir = $this->moduleDir();
        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($moduleDir, \FilesystemIterator::SKIP_DOTS)
        );

        /** @var \SplFileInfo $file */
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $files[substr($file->getPathname(), strlen($moduleDir) + 1)] = (string)file_get_contents(
                $file->getPathname()
            );
        }
        ksort($files);

        self::assertNotEmpty($files, 'No PHP was scanned — the sweep would be vacuous.');

        foreach (['Test/Unit/' . basename(__FILE__), 'Test/Unit/ModuleBoundaryTest.php'] as $guard) {
            self::assertArrayHasKey($guard, $files, sprintf('The sweep does not reach %s — its scope is wrong.', $guard));
            unset($files[$guard]);
        }

        return $files;
    }

    /**
     * Wording and semantic rules are read from the injected config, not from literals.
     *
     * @return void
     */
    public function testWordingAndRulesComeFromConfig(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertStringContainsString('this.emptyStateMessage', $js, 'Empty-state text must be configurable.');
        self::assertStringContainsString('this.coherence', $js, 'Semantic rules must be configurable.');
        self::assertStringContainsString(
            'this.coherence.requirements || {}',
            $js,
            'With no coherence config, no field may be gated.'
        );
    }

    /**
     * The dictionary lists exactly the phrases this module renders — no missing rows, no dead ones.
     *
     * A missing row is invisible in English and silently untranslated everywhere else; a dead row is
     * a phrase a translator is asked to translate for nothing, which is how this file accumulated
     * rows for raw template attributes that no Magento mechanism ever looked at. Both directions are
     * asserted, against the three places this module actually produces text:
     *
     *  - `$t('…')` in every JS file under view/adminhtml/web/js (the pure modules are scanned too:
     *    they are meant to carry no phrases at all, so a phrase appearing there fails loudly here
     *    instead of quietly making a pure module presentational),
     *  - `i18n: '…'` in every template under view/adminhtml/web/template,
     *  - `__('…')` in the module's shipped PHP — the operator labels are this module's own wording
     *    and belong in this module's dictionary.
     *
     * The row count and the ordering are pinned as well, so the file stays exactly what regenerating
     * it produces: one row per phrase, key equal to value, byte-alphabetical.
     *
     * @return void
     */
    public function testEveryUiStringIsInTheTranslationDictionary(): void
    {
        $rendered = $this->renderedPhrases();
        $dictionary = $this->dictionaryKeys();
        $sorted = $dictionary;
        sort($sorted, SORT_STRING);

        foreach ($rendered as $phrase) {
            self::assertContains(
                $phrase,
                $dictionary,
                sprintf('"%s" is rendered by this module but has no row in i18n/en_US.csv.', $phrase)
            );
        }

        foreach ($dictionary as $key) {
            self::assertContains(
                $key,
                $rendered,
                sprintf(
                    '"%s" has a row in i18n/en_US.csv but nothing renders it — a dead row asks for a '
                    . 'translation that can never be shown.',
                    $key
                )
            );
        }

        self::assertCount(
            count($dictionary),
            array_unique($dictionary),
            'i18n/en_US.csv lists the same phrase twice.'
        );
        self::assertSame($sorted, $dictionary, 'i18n/en_US.csv must stay in alphabetical order.');
    }

    /**
     * Every translation call is shaped so the dictionary can be extracted from it.
     *
     * Extraction is textual — Magento scans the deployed JS for this exact call shape, and so does
     * the assertion above — which makes the shape a hard rule rather than a style preference: a
     * phrase assembled from pieces (`$t('Group ' + n)`), read from a variable (`$t(message)`) or
     * broken across lines matches no pattern and ships untranslatable, with nothing failing. So a
     * `$t(` call must hold exactly ONE single-line quoted literal and close on the same line;
     * parameterised phrases carry their placeholders inside the literal and substitute afterwards.
     *
     * @return void
     */
    public function testTranslationCallsAreExtractable(): void
    {
        $calls = 0;

        foreach ($this->moduleFiles('view/adminhtml/web/js', 'js') as $path => $contents) {
            foreach ($this->offsetsOf($contents, '$t(') as $offset) {
                $tail = substr($contents, $offset + 3);
                $calls++;

                self::assertSame(
                    1,
                    preg_match('/^[ \t]*([\'"])((?:(?!\1).)*)\1[ \t]*\)/', $tail, $match),
                    sprintf(
                        'A $t() call in %s does not hold one single-line quoted literal that closes '
                        . 'on the same line: %s',
                        $path,
                        substr($tail, 0, 60)
                    )
                );
                self::assertStringNotContainsString(
                    '\\',
                    $match[2],
                    sprintf('A $t() literal in %s escapes a character; the extraction reads it raw.', $path)
                );
            }
        }

        self::assertGreaterThan(0, $calls, 'The component translates nothing at all — the sweep is broken.');
    }

    /**
     * Every phrase this module renders, from all three sources, unique and sorted.
     *
     * @return array<int, string>
     */
    private function renderedPhrases(): array
    {
        $phrases = array_merge(
            $this->matchedPhrases(
                $this->moduleFiles('view/adminhtml/web/js', 'js'),
                '/\$t\(\s*([\'"])(.+?)(?<!\\\\)\1\s*\)/'
            ),
            $this->matchedPhrases(
                $this->moduleFiles('view/adminhtml/web/template', 'html'),
                '/i18n:\s*([\'"])(.+?)(?<!\\\\)\1/'
            ),
            $this->phpPhrases()
        );

        $unique = array_values(array_unique($phrases));
        sort($unique, SORT_STRING);

        return $unique;
    }

    /**
     * The keys of i18n/en_US.csv, in file order. Each row must be a `key,value` pair whose two
     * fields are identical: the source dictionary translates English to itself, and a row whose
     * value drifted from its key would silently ship that drift as the English wording.
     *
     * @return array<int, string>
     */
    private function dictionaryKeys(): array
    {
        $path = $this->moduleDir() . '/i18n/en_US.csv';
        self::assertFileExists($path, 'The module ships no en_US dictionary.');

        $keys = [];
        $handle = fopen($path, 'rb');
        self::assertIsResource($handle, 'The en_US dictionary cannot be read.');

        // Read exactly the way Magento's own CSV reader does, so what this test sees is what the
        // translation layer will see.
        while (($row = fgetcsv($handle, 0, ',', '"')) !== false) {
            if ($row === [null] || $row === ['']) {
                continue;
            }
            self::assertCount(2, $row, 'Every dictionary row is a key/value pair.');
            self::assertSame($row[0], $row[1], sprintf('Row "%s" translates to different text.', (string)$row[0]));
            $keys[] = (string)$row[0];
        }
        fclose($handle);
        self::assertNotEmpty($keys, 'The en_US dictionary is empty.');

        return $keys;
    }

    /**
     * Files of one extension below a module directory, keyed by their module-relative path.
     *
     * @param string $relativeDir Directory below the module root.
     * @param string $extension File extension without the dot.
     * @return array<string, string> Relative path → contents.
     */
    private function moduleFiles(string $relativeDir, string $extension): array
    {
        $root = $this->moduleDir() . '/' . $relativeDir;
        self::assertDirectoryExists($root, sprintf('%s is missing.', $relativeDir));

        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );

        /** @var \SplFileInfo $file */
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === $extension) {
                $relative = substr($file->getPathname(), strlen($this->moduleDir()) + 1);
                $files[$relative] = (string)file_get_contents($file->getPathname());
            }
        }
        self::assertNotEmpty($files, sprintf('%s holds no .%s file — the sweep would be vacuous.', $relativeDir, $extension));
        ksort($files);

        return $files;
    }

    /**
     * Phrases one pattern matches across a set of files, in capture group 2.
     *
     * @param array<string, string> $files Relative path → contents.
     * @param string $pattern
     * @return array<int, string>
     */
    private function matchedPhrases(array $files, string $pattern): array
    {
        $phrases = [];

        foreach ($files as $contents) {
            preg_match_all($pattern, $contents, $matches);

            foreach ($matches[2] as $phrase) {
                $phrases[] = $phrase;
            }
        }

        return $phrases;
    }

    /**
     * Phrases passed to `__()` in the module's shipped PHP.
     *
     * Read from the token stream rather than by regex so comments are skipped: the config interface
     * documents the contract with `__('…')` examples in its docblock, and a documented example is
     * not a shipped phrase. Test code is out of scope for the same reason — a fixture phrase is not
     * something an admin ever sees.
     *
     * @return array<int, string>
     */
    private function phpPhrases(): array
    {
        $phrases = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->moduleDir(), \FilesystemIterator::SKIP_DOTS)
        );
        $testDir = $this->moduleDir() . '/Test/';
        $scanned = 0;

        /** @var \SplFileInfo $file */
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php' || str_starts_with($file->getPathname(), $testDir)) {
                continue;
            }
            $scanned++;
            $tokens = array_values(array_filter(
                token_get_all((string)file_get_contents($file->getPathname())),
                static fn ($token) => !is_array($token)
                    || !in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)
            ));

            foreach ($tokens as $index => $token) {
                if (!is_array($token) || $token[0] !== T_STRING || $token[1] !== '__') {
                    continue;
                }

                if (($tokens[$index + 1] ?? null) !== '(') {
                    continue;
                }
                $argument = $tokens[$index + 2] ?? null;

                if (is_array($argument) && $argument[0] === T_CONSTANT_ENCAPSED_STRING) {
                    $phrases[] = substr((string)$argument[1], 1, -1);
                }
            }
        }

        self::assertGreaterThan(0, $scanned, 'No shipped PHP was scanned — the sweep would be vacuous.');
        self::assertNotEmpty($phrases, 'The module\'s PHP translates nothing at all — the sweep is broken.');

        return $phrases;
    }

    /**
     * Every byte offset a needle occurs at.
     *
     * @param string $haystack
     * @param string $needle
     * @return array<int, int>
     */
    private function offsetsOf(string $haystack, string $needle): array
    {
        $offsets = [];
        $offset = 0;

        while (($found = strpos($haystack, $needle, $offset)) !== false) {
            $offsets[] = $found;
            $offset = $found + 1;
        }

        return $offsets;
    }

    /**
     * The match count is entirely consumer-configured: the endpoint, the wording and the scope.
     *
     * The badge is opt-in, exactly like the empty-state message: a consumer that cannot count what
     * a tree selects omits the key and gets no badge and — the part that actually matters — no
     * request. That guarantee lives in one guard, so it is asserted directly; without it a consumer
     * with no endpoint would POST to an empty URL on every edit. The wording is the consumer's too,
     * carrying a `%1` the component substitutes the number into.
     *
     * @return void
     */
    public function testMatchCountEndpointAndWordingComeFromConfig(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        foreach (['countUrl', 'countLabel', 'countStoreId'] as $key) {
            self::assertStringContainsString(
                'this.builderConfig.' . $key,
                $js,
                sprintf('The match count must read %s from the injected config.', $key)
            );
        }

        self::assertStringContainsString(
            "this.countUrl === ''",
            $js,
            'A consumer that configures no counting endpoint must be short-circuited, never requested.'
        );
        self::assertStringContainsString(
            "this.countLabel.indexOf('%1')",
            $js,
            'The consumer owns the wording; the component only substitutes the number into its placeholder.'
        );
    }

    /**
     * Every write to the count state goes through the one setter that drops stale answers.
     *
     * Counting is debounced and overlapping: a broad tree's answer can arrive after the answer to
     * the narrower tree the admin typed next, and rendering it would show a number for a rule that
     * no longer exists — silently, since both are plausible numbers. The defence is that all three
     * observables are written in exactly one place, behind a sequence check. Counted per observable
     * rather than merely asserting the setter exists, because the regression is an extra write
     * added elsewhere, not a deleted guard.
     *
     * @return void
     */
    public function testMatchCountWritesGoThroughOneStaleGuardedSetter(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        foreach (['matchCount', 'countCapped', 'countState'] as $observable) {
            preg_match_all('/this\.' . $observable . '\(\s*[^)\s]/', $js, $writes);

            self::assertCount(
                1,
                $writes[0],
                sprintf(
                    'this.%s must be written in exactly one place, so a late response cannot '
                    . 'overwrite newer state.',
                    $observable
                )
            );
        }

        self::assertStringContainsString(
            'seq !== this._countSeq',
            $js,
            'The single write path must drop answers a newer request has superseded.'
        );
    }

    /**
     * The count badge is one live region that exists from the first paint and is toggled, not
     * inserted.
     *
     * A live region added to the DOM together with its first message is announced only by chance —
     * assistive technology has to have seen the region before the text changes. So the badge is
     * always rendered and merely hidden, its text bound to the component's state rather than
     * assembled in the markup, and it is announced politely because the number lands while the
     * admin is still editing.
     *
     * @return void
     */
    public function testMatchCountBadgeIsAStableLiveRegion(): void
    {
        $template = $this->asset('template/form/element/expression-builder.html');
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertSame(
            1,
            substr_count($template, 'class="ufe-expr__count"'),
            'The badge is one element in the preview heading row.'
        );

        $badge = strstr((string)strstr($template, '<span class="ufe-expr__count"'), '</span>', true);
        self::assertIsString($badge, 'The badge span is never closed.');

        foreach ([
            'aria-live="polite"',
            'visible: countBadgeVisible()',
            'text: countBadgeText()',
        ] as $needle) {
            self::assertStringContainsString(
                $needle,
                (string)$badge,
                sprintf('The badge must carry %s.', $needle)
            );
        }

        foreach (['countBadgeVisible', 'countBadgeText'] as $method) {
            self::assertMatchesRegularExpression(
                '/\b' . $method . ':\s*function\s*\(/',
                $js,
                sprintf('The template binds %s(), but the component never defines it.', $method)
            );
        }
    }

    /**
     * Reordering is driven by pointer events, and by nothing else.
     *
     * Three interaction models could plausibly implement a drag here and only one of them is
     * allowed: pointer events with capture (what this does), the HTML5 drag-and-drop API (which
     * cannot express a drop indicator between rows and drags a ghost image nobody asked for), and
     * mouse events plus a document-level listener (which loses the drag the moment the pointer
     * outruns the element, and whose `mousedown` would collide with the dropdown focus guard this
     * suite already pins). Counted per handle, because the four events are one indivisible
     * lifecycle: capture without a release handler leaves a drag running forever, and a release
     * without `lostpointercapture` leaves one running whenever the capture lapses instead.
     *
     * jQuery UI's sortable is the other tempting shortcut and is repo-forbidden, so the whole
     * jQuery surface is excluded here rather than in a code review.
     *
     * @return void
     */
    public function testReorderIsDrivenByPointerEventsOnly(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $js = $this->asset('js/form/element/expression-builder.js');
        $handleCount = substr_count($group, 'class="ufe-expr__drag"');

        self::assertSame(2, $handleCount, 'One drag handle per node kind: rows and non-root groups.');

        foreach (['pointerdown', 'pointermove', 'pointerup', 'lostpointercapture'] as $event) {
            self::assertSame(
                $handleCount,
                substr_count($group, $event . ':'),
                sprintf('Every drag handle must bind %s — the four are one lifecycle.', $event)
            );
        }

        foreach (['draggable=', 'dragstart', 'dragover', 'dragend', 'ondrop'] as $needle) {
            self::assertStringNotContainsString(
                $needle,
                $group,
                sprintf('The HTML5 drag API (%s) is not how this builder reorders.', $needle)
            );
        }

        foreach (['jquery', 'jQuery', 'sortable'] as $needle) {
            self::assertStringNotContainsString(
                $needle,
                $group,
                sprintf('Reordering is vanilla: the template must not reach for %s.', $needle)
            );
        }

        self::assertStringNotContainsString(
            "'jquery'",
            $js,
            'The component declares no jQuery dependency — its drag is pointer events and nothing else.'
        );
        self::assertStringNotContainsString('sortable', $js, 'No sortable widget: the move is the pure model\'s.');
        self::assertDoesNotMatchRegularExpression(
            '/(?<![A-Za-z0-9_$.])(?:jQuery|\$)\s*\(/',
            $js,
            'The component calls no jQuery: prose about how Knockout binds events is fine, calls are not.'
        );
    }

    /**
     * Every reorder — pointer drop and keystroke alike — is applied in exactly one place, and that
     * place asks the pure model first.
     *
     * The move has to happen twice over: once in the plain model (which owns the legality rules and
     * the same-parent shift compensation) and once in the observable arrays the template renders
     * from. Those two are the drift risk of this whole feature: a second application path that
     * splices without consulting the model would reorder the UI into a shape the model would have
     * refused — most visibly by moving a group inside itself. So the call site is counted, not
     * merely found.
     *
     * @return void
     */
    public function testEveryReorderGoesThroughThePureMoveNode(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertSame(
            1,
            substr_count($js, 'expressionTree.moveNode('),
            'All reordering must funnel through one call to the pure move, so no path can skip it.'
        );

        foreach (['expressionTree.slotList(', 'expressionTree.excludeSubtree('] as $needle) {
            self::assertStringContainsString(
                $needle,
                $js,
                sprintf('The destinations a node may reach come from the pure model (%s).', $needle)
            );
        }

        foreach (['sourceGroup.children.splice(', 'targetGroup.children.splice('] as $write) {
            self::assertSame(
                1,
                substr_count($js, $write),
                sprintf(
                    'The view-model side of a move is one splice out of the source and one into the '
                    . 'target: %s must appear exactly once.',
                    $write
                )
            );
        }
    }

    /**
     * The drag handles are real buttons the keyboard can operate.
     *
     * A drag handle that only answers to a pointer excludes every admin who cannot use one, so the
     * arrow-key move is not an enhancement here — it is the handle's second half. Both halves live
     * on the same element, which is also what keeps them from drifting into two different notions
     * of where a node may go.
     *
     * @return void
     */
    public function testDragHandlesAreFocusableAndKeyboardOperable(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $js = $this->asset('js/form/element/expression-builder.js');
        $handleCount = substr_count($group, 'class="ufe-expr__drag"');

        self::assertSame(
            $handleCount,
            substr_count($group, 'handleDragKeydown('),
            'Every drag handle must answer the arrow keys, not just the pointer.'
        );
        self::assertSame(
            $handleCount,
            preg_match_all('/class="ufe-expr__drag"[^>]*?\btype="button"|\btype="button"[^>]*?class="ufe-expr__drag"/s', $group),
            'A handle is a button element, so it is focusable and reachable by keyboard by default.'
        );

        foreach (['ArrowUp', 'ArrowDown'] as $key) {
            self::assertStringContainsString(
                "'" . $key . "'",
                $js,
                sprintf('The keyboard move must handle %s.', $key)
            );
        }

        self::assertStringContainsString(
            'tabindex="-1"',
            $group,
            'Sanity check on the regex above: the template does still take controls out of the tab order.'
        );
        self::assertSame(
            0,
            preg_match_all('/class="ufe-expr__drag"[^>]*tabindex/s', $group),
            'A drag handle must never be taken out of the tab order — the keyboard move needs it.'
        );
    }

    /**
     * The drop indicator covers every insertion gap and costs no layout.
     *
     * A gap is identified by the node below it, plus one per group for the gap no node sits below —
     * three renderings, which together address every slot exactly once. The positioning is not
     * cosmetic: the drop target is resolved by measuring the rendered boxes, so an indicator that
     * took part in the flow would move the very layout that decided where it belongs, and dragging
     * across a gap would oscillate between two slots.
     *
     * @return void
     */
    public function testDropIndicatorsCoverEveryGapWithoutDisturbingTheLayout(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $js = $this->asset('js/form/element/expression-builder.js');
        $css = $this->asset('css/expression-builder.css');

        self::assertSame(
            3,
            substr_count($group, 'class="ufe-expr__drop-indicator"'),
            'One indicator above a row, one above a nested group, one for a group\'s last gap.'
        );
        self::assertSame(
            2,
            substr_count($group, 'isDropSlotBefore('),
            'The gap above a node is asked of the node — rows and nested groups alike.'
        );
        self::assertSame(
            1,
            substr_count($group, 'isDropSlotAtEnd('),
            'The trailing gap has no node below it, so the group answers for it.'
        );

        foreach (['isDropSlotBefore', 'isDropSlotAtEnd'] as $method) {
            self::assertMatchesRegularExpression(
                '/\b' . $method . ':\s*function\s*\(/',
                $js,
                sprintf('The template binds %s(), but the component never defines it.', $method)
            );
        }

        $indicatorRule = $this->cssRule($css, '.ufe-expr__drop-indicator');

        self::assertStringContainsString(
            'position: absolute',
            $indicatorRule,
            'The indicator must be out of the flow, or showing it reflows what the drop maths measured.'
        );

        self::assertStringContainsString(
            'touch-action: none',
            $this->cssRule($css, '.ufe-expr__drag'),
            'Without this a touch drag scrolls the page and the handle never sees the pointer stream.'
        );
    }

    /**
     * The reorder announcement is one hidden live region, rendered once and always present.
     *
     * A move changes only the rendered order, which is nothing at all to a screen reader, so the
     * announcement is the entire feedback that a keystroke did something. It has to exist before it
     * speaks (a region inserted with its first message is announced only by chance), it has to
     * exist ONCE — the group template renders per group, so an unguarded region would announce
     * every move as many times as the rule has groups — and it must be hidden by clipping: display
     * or visibility hiding takes it out of the accessibility tree along with the text.
     *
     * @return void
     */
    public function testReorderAnnouncementIsOneHiddenLiveRegion(): void
    {
        $group = $this->asset('template/form/element/expression-group.html');
        $js = $this->asset('js/form/element/expression-builder.js');
        $rule = $this->cssRule($this->asset('css/expression-builder.css'), '.ufe-expr__move-status');

        self::assertSame(
            1,
            substr_count($group, 'class="ufe-expr__move-status"'),
            'One announcement region for the whole builder.'
        );
        self::assertStringContainsString(
            'depth === 1',
            $group,
            'The region is the root group\'s to render, or every group renders its own.'
        );

        $region = strstr((string)strstr($group, '<div class="ufe-expr__move-status"'), '</div>', true);
        self::assertIsString($region, 'The announcement region is never closed.');

        foreach (['aria-live="polite"', 'text: builder.moveAnnouncement'] as $needle) {
            self::assertStringContainsString(
                $needle,
                (string)$region,
                sprintf('The announcement region must carry %s.', $needle)
            );
        }

        self::assertStringContainsString(
            'this.moveAnnouncement = ko.observable',
            $js,
            'The announcement is component state, not markup.'
        );

        foreach (['display: none', 'visibility: hidden'] as $forbidden) {
            self::assertStringNotContainsString(
                $forbidden,
                $rule,
                sprintf('%s would hide the announcement from assistive technology too.', $forbidden)
            );
        }
        self::assertStringContainsString('clip-path', $rule, 'A hidden live region is clipped, not removed.');
    }

    /**
     * The authoring depth cap is one configured value, and no template compares depth against a
     * literal.
     *
     * The cap used to live only as a `depth < 5` guard on the add-group button, which made
     * reordering — a path that never consulted it — able to nest deeper than authoring ever could,
     * until a save failed server-side with nothing to show inside the builder. So the number is a
     * tunable, the template asks the component instead of comparing, and the reorder paths read the
     * same value. The only depth comparisons a template may still make are against 1: root group
     * versus nested group is structure, not a limit.
     *
     * @return void
     */
    public function testAuthoringDepthCapIsOneConfiguredValue(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $group = $this->asset('template/form/element/expression-group.html');

        self::assertMatchesRegularExpression(
            '/maxGroupDepth:\s*\d+/',
            $js,
            'The depth cap must be a `defaults` entry a form\'s XML can retune.'
        );
        self::assertStringContainsString(
            "this._tunable('maxGroupDepth')",
            $js,
            'The cap must be read through the tunable guard, so a nonsense XML value cannot disable nesting.'
        );
        self::assertStringContainsString(
            'builder.canAddGroupAt(depth)',
            $group,
            'The add-group guard must ask the component for the cap rather than compare against a number.'
        );

        preg_match_all('/\bdepth\s*(?:<=|>=|===|!==|==|!=|<|>)\s*(\d+)/', $group, $comparisons);

        foreach ($comparisons[1] as $literal) {
            self::assertSame(
                '1',
                $literal,
                'A template may only compare depth against 1 (root vs nested); a cap comes from config.'
            );
        }

        foreach (['_slotFits(', '_heightOf('] as $needle) {
            self::assertStringContainsString(
                $needle,
                $js,
                sprintf('The reorder paths must screen slots against the cap (%s).', $needle)
            );
        }
        self::assertSame(
            3,
            substr_count($js, 'this._slotFits('),
            'Three screens: the drag candidates, the keyboard step, and the single application path '
            . 'that both of them end in.'
        );
    }

    /**
     * Everything the component holds outside its own object graph is released on destroy.
     *
     * A ui_component field can be destroyed and rebuilt (a modal closing, a dynamic-rows entry
     * being removed) and none of these clean themselves up: an undisposed computed keeps walking
     * the authored tree and writing into a dead data scope, a pending timer fires into a discarded
     * view-model, and a drag interrupted by the destroy leaves a document-level key listener and a
     * pointer capture behind — neither of which is bound to any element's lifetime. Asserted
     * structurally, because the leak is silent: nothing fails, the page just gets slower and the
     * form dirtier.
     *
     * @return void
     */
    public function testDestroyReleasesEveryComputedTimerAndListener(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertMatchesRegularExpression(
            '/destroy:\s*function\s*\(/',
            $js,
            'The component must override destroy() — its own state is not the framework\'s to release.'
        );

        preg_match_all('/ko\.computed\(/', $js, $computeds);
        self::assertNotEmpty($computeds[0], 'The component creates no computeds at all — the sweep is broken.');
        self::assertSame(
            count($computeds[0]),
            substr_count($js, '_disposable('),
            'Every ko.computed must be registered for disposal at its creation site.'
        );

        foreach (['dispose()', 'this._clearRowTimers(', 'this._releaseDrag()'] as $needle) {
            self::assertStringContainsString(
                $needle,
                $js,
                sprintf('destroy() must reach %s.', $needle)
            );
        }

        foreach (['_suggestTimer', '_pasteTimer'] as $timer) {
            self::assertStringContainsString(
                'clearTimeout(child.' . $timer . ')',
                $js,
                sprintf('The row sweep must clear %s on every row it walks.', $timer)
            );
        }

        preg_match_all('/setTimeout\(/', $js, $timeouts);
        self::assertSame(
            count($timeouts[0]),
            substr_count($js, 'Timer = setTimeout('),
            'Every setTimeout must be stored in a named timer field, or destroy() cannot cancel it.'
        );
    }

    /**
     * A consumer's field label is rendered by the builder, and the framework's label surface stays
     * empty.
     *
     * The element replaces the standard field template, so the label/control wrap that would render
     * `label` never exists here — which is why the value is cleared, and why a label set in a
     * consumer's form XML has to be picked up by this template instead of being silently dropped.
     *
     * @return void
     */
    public function testConsumerLabelIsRenderedAsTheBuildersOwnHeading(): void
    {
        $js = $this->asset('js/form/element/expression-builder.js');
        $template = $this->asset('template/form/element/expression-builder.html');

        self::assertMatchesRegularExpression(
            '/label:\s*\'\'/',
            $js,
            'The framework label surface must stay empty, or the standard field wrap reappears.'
        );
        self::assertStringContainsString(
            'this.builderLabel = ',
            $js,
            'A configured label must be taken over by the component before `label` is cleared.'
        );
        self::assertStringContainsString(
            "this.label = ''",
            $js,
            'Clearing `label` in `defaults` alone cannot suppress the wrap: instance config outranks it.'
        );
        self::assertStringContainsString(
            'text: builderLabel',
            $template,
            'The heading must render the configured label as text — it arrives already translated.'
        );
        self::assertStringContainsString(
            'class="ufe-expr__heading"',
            $template,
            'The heading is the builder\'s own element, styled with the module\'s prefix.'
        );
    }

    /**
     * The widget's root re-binds `visible`, which the replaced field wrap was the only provider of.
     *
     * The element overrides `template`, not just `elementTmpl`, so `Magento_Ui`'s `form/field.html` never
     * renders — and that file is the only place `visible` is ever bound. Without the binding nothing
     * errors and nothing logs: the observable still flips, the widget simply ignores it, so a form's
     * `switcherConfig` and the field's own `visible` setting are both dead, on first paint as much as on
     * a change. That silence is why this is a contract worth pinning rather than a style choice.
     *
     * @return void
     */
    public function testTheWidgetRootRebindsVisible(): void
    {
        $template = $this->asset('template/form/element/expression-builder.html');

        self::assertSame(
            1,
            preg_match_all('/<div class="ufe-expression-builder"[^>]*>/', $template, $roots),
            'The widget must have exactly one root element, or hiding it cannot hide all of the widget.'
        );
        self::assertMatchesRegularExpression(
            '/data-bind="[^"]*\bvisible:\s*visible\b/',
            $roots[0][0],
            'The root must bind `visible`, or the widget cannot be hidden by the form that hosts it.'
        );
    }

    /**
     * The declaration block of one CSS rule, selected by an exact selector.
     *
     * @param string $css Stylesheet contents.
     * @param string $selector Selector to find, without the module scope prefix.
     * @return string Declarations between the braces.
     */
    private function cssRule(string $css, string $selector): string
    {
        self::assertSame(
            1,
            preg_match('/' . preg_quote($selector, '/') . '\s*\{([^}]*)\}/', $css, $match),
            sprintf('The stylesheet defines no single rule for %s.', $selector)
        );

        return $match[1];
    }

    /**
     * The serialiser emits a nested Magento condition tree, which is what loadArray() consumes.
     *
     * A regression here would silently break every consumer's saved rules, because loadPost() accepts the
     * flat form-POST shape instead and would mangle the tree. The Combine node shape itself lives in the
     * tree model; the component stringifies what that module produces.
     *
     * @return void
     */
    public function testSerialiserEmitsANestedConditionTree(): void
    {
        $treeModel = $this->asset('js/form/element/expression-tree.js');
        $js = $this->asset('js/form/element/expression-builder.js');

        self::assertStringContainsString('conditions: children', $treeModel, 'Combine nodes must nest their children.');
        self::assertStringContainsString('aggregator: aggregator', $treeModel, 'Combine nodes must carry an aggregator.');
        self::assertStringContainsString('JSON.stringify(tree)', $js, 'The field value must be a JSON string.');
    }
}
