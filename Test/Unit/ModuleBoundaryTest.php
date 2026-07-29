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
 * Guards the direction of this module's dependencies.
 *
 * This module is the shared one: consumers depend on its `Api/` contracts and wire its services in
 * their own di.xml, and it must know nothing about them in return. A single reference the other way
 * — an import, a fully-qualified class name, a class-string in a whitelist, a module name in the
 * package metadata — turns the shared module into something that cannot be installed without its
 * consumers, and it fails at the worst possible moment: a class-not-found at runtime on a site that
 * installed only this package.
 *
 * The counterpart for the front-end assets is {@see AssetIntegrityTest}, whose vocabulary sweep
 * keeps consumer domain wording and attribute codes out of the JS, templates and stylesheet.
 */
class ModuleBoundaryTest extends TestCase
{
    /**
     * Namespaces of the modules that consume this one. Substrings, so a match catches an import, a
     * fully-qualified reference, a `::class` constant and a plain string alike.
     *
     * @var list<string>
     */
    private const CONSUMER_NAMESPACES = [
        'Hryvinskyi\BannerZone',
        'Hryvinskyi\ProductShowcase',
    ];

    /**
     * Composer package names of the same modules.
     *
     * @var list<string>
     */
    private const CONSUMER_PACKAGES = [
        'hryvinskyi/magento2-banner-zone',
        'hryvinskyi/magento2-product-showcase',
    ];

    /**
     * Magento module names of the same modules.
     *
     * @var list<string>
     */
    private const CONSUMER_MODULES = [
        'Hryvinskyi_BannerZone',
        'Hryvinskyi_ProductShowcase',
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
     * No PHP file in this module names a consumer's namespace — tests included, since a fixture
     * referencing a consumer class needs that consumer installed just as much as production code
     * does.
     *
     * This file is the one exception, and unavoidably so: it has to spell the forbidden names out to
     * search for them. Its presence in the sweep is asserted before it is skipped, so the exclusion
     * cannot quietly become an exclusion of nothing.
     *
     * @return void
     */
    public function testNoPhpFileReferencesAConsumerNamespace(): void
    {
        $files = $this->moduleFiles('php');
        $ownPath = 'Test/Unit/' . basename(__FILE__);
        self::assertNotEmpty($files, 'No PHP was scanned — the sweep would be vacuous.');
        self::assertArrayHasKey($ownPath, $files, 'The sweep does not reach this test — its scope is wrong.');
        unset($files[$ownPath]);

        foreach ($files as $relativePath => $contents) {
            foreach (self::CONSUMER_NAMESPACES as $namespace) {
                self::assertStringNotContainsString(
                    $namespace,
                    $contents,
                    sprintf(
                        '%s references %s: the shared module must never learn a consumer symbol.',
                        $relativePath,
                        $namespace
                    )
                );
            }
        }
    }

    /**
     * Every class this module declares lives in its own namespace.
     *
     * The inverse of the sweep above, and the reason it can be a plain substring search: a file
     * declaring a namespace outside `Hryvinskyi\UiFormElements` would be autoloaded from here while
     * pretending to belong elsewhere, which is the one way a boundary breach could hide from a
     * search for consumer names.
     *
     * @return void
     */
    public function testEveryDeclaredNamespaceBelongsToThisModule(): void
    {
        $declarations = 0;

        foreach ($this->moduleFiles('php') as $relativePath => $contents) {
            if (preg_match('/^\s*namespace\s+([^;]+);/m', $contents, $match) !== 1) {
                continue;
            }
            $declarations++;
            self::assertStringStartsWith(
                'Hryvinskyi\UiFormElements',
                trim($match[1]),
                sprintf('%s declares a namespace outside this module.', $relativePath)
            );
        }

        self::assertGreaterThan(0, $declarations, 'No namespace declaration was found — the sweep is broken.');
    }

    /**
     * The XML wiring names no consumer either.
     *
     * di.xml is where a dependency would be easiest to add and hardest to notice: a preference or a
     * virtual type pointing at a consumer class compiles fine here and explodes during di:compile
     * on a site that installed only this module. The documented wiring example in di.xml uses a
     * deliberately fictional vendor for exactly this reason.
     *
     * @return void
     */
    public function testNoXmlWiringReferencesAConsumer(): void
    {
        $files = $this->moduleFiles('xml');
        self::assertNotEmpty($files, 'No XML was scanned — the sweep would be vacuous.');

        foreach ($files as $relativePath => $contents) {
            foreach (array_merge(self::CONSUMER_NAMESPACES, self::CONSUMER_MODULES) as $needle) {
                self::assertStringNotContainsString(
                    $needle,
                    $contents,
                    sprintf('%s wires %s: the shared module must not depend on a consumer.', $relativePath, $needle)
                );
            }
        }
    }

    /**
     * The package metadata declares no consumer as a dependency, and the module sequence does not
     * order this module after one.
     *
     * A `require` entry or a `<sequence>` module here would make the shared package uninstallable on
     * its own — the strongest form of the same breach, and the one a code search for class names
     * would miss entirely.
     *
     * @return void
     */
    public function testPackageMetadataDeclaresNoConsumerDependency(): void
    {
        foreach (['composer.json', 'etc/module.xml'] as $relativePath) {
            $path = $this->moduleDir() . '/' . $relativePath;
            self::assertFileExists($path, sprintf('%s is missing.', $relativePath));
            $contents = (string)file_get_contents($path);

            foreach (array_merge(self::CONSUMER_PACKAGES, self::CONSUMER_MODULES) as $needle) {
                self::assertStringNotContainsString(
                    $needle,
                    $contents,
                    sprintf('%s declares a dependency on %s.', $relativePath, $needle)
                );
            }
        }
    }

    /**
     * Every file of one extension below the module root, keyed by its module-relative path.
     *
     * @param string $extension File extension without the dot.
     * @return array<string, string> Relative path → contents.
     */
    private function moduleFiles(string $extension): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->moduleDir(), \FilesystemIterator::SKIP_DOTS)
        );

        /** @var \SplFileInfo $file */
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== $extension) {
                continue;
            }
            $files[substr($file->getPathname(), strlen($this->moduleDir()) + 1)] = (string)file_get_contents(
                $file->getPathname()
            );
        }
        ksort($files);

        return $files;
    }
}
