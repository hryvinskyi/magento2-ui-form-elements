<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Test\Integration\View;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Magento\Framework\App\Area;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\Page\Config\RendererFactory;
use Magento\Framework\View\Result\PageFactory;
use Magento\TestFramework\Fixture\AppArea;
use Magento\TestFramework\Fixture\AppIsolation;
use Magento\TestFramework\Helper\Bootstrap;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The expression builder's view files, as Magento resolves and links them in the admin
 *
 * The Knockout component asks for its templates and RequireJS for the component's modules by name at run time,
 * and a form's layout asks for the stylesheet, so a moved or renamed file fails in the browser and nowhere else.
 * Each file is resolved here through Magento's view-file fallback, the way the admin serves it. The layout handle
 * a consumer's form page asks for is rendered
 * into a page head, where the admin UI kit's stylesheet must come before the builder's: the builder reads the
 * kit's tokens, and a rule of the builder's overrides a kit rule of the same weight by that order.
 */
#[AppArea(Area::AREA_ADMINHTML)]
class AssetsTest extends TestCase
{
    private const HANDLE = 'hryvinskyi_ui_form_elements_expression_builder';
    private const KIT_STYLESHEET = 'Hryvinskyi_AdminUi/css/admin-ui.css';
    private const BUILDER_STYLESHEET = 'Hryvinskyi_UiFormElements/css/expression-builder.css';

    /**
     * The Knockout component and the modules it depends on, by the name RequireJS asks for them under
     */
    private const SCRIPTS = [
        'expression-builder',
        'expression-tree',
        'expression-value',
        'expression-options',
        'expression-config',
        'expression-fields',
        'expression-condition',
        'expression-coherence',
        'expression-reorder',
        'expression-listbox',
        'expression-option-tree',
        'expression-list-value',
        'expression-preview',
        'expression-count',
        'expression-remote-options',
        'expression-requests',
        'expression-drag',
    ];

    /**
     * The public mount and the modules it depends on, by the name RequireJS asks for them under
     */
    private const MOUNT_SCRIPTS = [
        'mount',
        'mount-options',
        'value-sync',
    ];

    /**
     * The builder's stylesheet, the three templates its component names, every script the component loads, and
     * the public mount's scripts
     *
     * @return array<string, array{string}>
     */
    public static function viewFiles(): array
    {
        $files = [
            'stylesheet' => ['Hryvinskyi_UiFormElements::css/expression-builder.css'],
            'builder template' => ['Hryvinskyi_UiFormElements::template/form/element/expression-builder.html'],
            'group template' => ['Hryvinskyi_UiFormElements::template/form/element/expression-group.html'],
            'preview template' => ['Hryvinskyi_UiFormElements::template/form/element/expression-preview.html'],
        ];
        foreach (self::SCRIPTS as $script) {
            $files[$script . ' script'] = ['Hryvinskyi_UiFormElements::js/form/element/' . $script . '.js'];
        }
        foreach (self::MOUNT_SCRIPTS as $script) {
            $files[$script . ' script'] = ['Hryvinskyi_UiFormElements::js/expression-builder/' . $script . '.js'];
        }

        return $files;
    }

    /**
     * Magento resolves the file through the admin's view-file fallback to a file that exists
     *
     * @param string $fileId
     * @return void
     */
    #[DataProvider('viewFiles')]
    public function testTheAdminResolvesTheViewFile(string $fileId): void
    {
        $assets = Bootstrap::getObjectManager()->get(AssetRepository::class);
        self::assertInstanceOf(AssetRepository::class, $assets);

        $source = $assets->createAsset($fileId, ['area' => Area::AREA_ADMINHTML])->getSourceFile();

        self::assertFileExists($source, $fileId . ' resolves to a file');
    }

    /**
     * A page that asks for the handle links the kit's stylesheet in its head, then the builder's
     *
     * The page's head configuration is one shared instance per application, so each head is built in an
     * application of its own.
     *
     * @return void
     */
    #[AppIsolation(true)]
    public function testTheHandleLinksTheKitStylesheetBeforeTheBuildersOwn(): void
    {
        $hrefs = $this->stylesheetsInTheHeadOf(self::HANDLE);

        $kit = $this->positionOf(self::KIT_STYLESHEET, $hrefs);
        $builder = $this->positionOf(self::BUILDER_STYLESHEET, $hrefs);
        self::assertIsInt($kit, 'The kit stylesheet is linked in the head');
        self::assertIsInt($builder, 'The builder stylesheet is linked in the head');
        self::assertLessThan($builder, $kit, 'The kit comes first, so the builder overrides it by order');
    }

    /**
     * A page that does not ask for the handle links neither stylesheet, so the handle is what brings them
     *
     * @return void
     */
    #[AppIsolation(true)]
    public function testAPageWithoutTheHandleLinksNeitherStylesheet(): void
    {
        $hrefs = $this->stylesheetsInTheHeadOf(null);

        self::assertNull($this->positionOf(self::KIT_STYLESHEET, $hrefs));
        self::assertNull($this->positionOf(self::BUILDER_STYLESHEET, $hrefs));
    }

    /**
     * The addresses of the stylesheets an admin page result renders into its head, in their order
     *
     * @param string|null $handle the layout handle the page asks for, or none
     * @return list<string>
     */
    private function stylesheetsInTheHeadOf(?string $handle): array
    {
        $objectManager = Bootstrap::getObjectManager();
        $pages = $objectManager->get(PageFactory::class);
        self::assertInstanceOf(PageFactory::class, $pages);
        $renderers = $objectManager->get(RendererFactory::class);
        self::assertInstanceOf(RendererFactory::class, $renderers);

        $page = $pages->create();
        if ($handle !== null) {
            $page->addHandle($handle);
        }
        $config = $page->getConfig();
        $config->publicBuild();
        $head = $renderers->create(['pageConfig' => $config])->renderHeadAssets();

        $document = new DOMDocument();
        self::assertTrue($document->loadHTML('<html><head>' . $head . '</head></html>', LIBXML_NOERROR));
        $links = (new DOMXPath($document))->query('//head/link[@rel="stylesheet"]');
        self::assertNotFalse($links);
        $hrefs = [];
        foreach ($links as $link) {
            self::assertInstanceOf(DOMElement::class, $link);
            $hrefs[] = $link->getAttribute('href');
        }

        return $hrefs;
    }

    /**
     * The position of the first address that names this file, or null when none does
     *
     * @param string $file
     * @param list<string> $hrefs
     * @return int|null
     */
    private function positionOf(string $file, array $hrefs): ?int
    {
        foreach ($hrefs as $position => $href) {
            if (str_contains($href, $file)) {
                return $position;
            }
        }

        return null;
    }
}
