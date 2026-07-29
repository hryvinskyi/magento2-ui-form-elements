<?php
/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

declare(strict_types=1);

namespace Hryvinskyi\UiFormElements\Api;

/**
 * Supplies the category options the expression builder's category pickers render.
 *
 * Options are tree-shaped rather than dash-indented flat labels: each option carries the plain
 * category name plus `level` and `parent`, from which a client derives hierarchy, breadcrumb paths,
 * search and collapse state. Deliberately, no server-side id-to-breadcrumb map is emitted:
 * `level` + `parent` fully determine every path, while a precomputed map would add hundreds of
 * kilobytes to a ui_component payload that already carries the option list more than once per form
 * on a large catalog.
 *
 * @api
 */
interface CategoryTreeOptionsProviderInterface
{
    /**
     * Every category below the invisible global root, ordered by path so a parent always precedes
     * its children.
     *
     * `value` is the category id, `label` the plain category name with no indentation prefixes
     * (hierarchy is expressed by `level`/`parent`, never baked into the label), `level` the tree
     * depth as stored by the catalog (level 1 = a store root category), and `parent` the parent
     * category id — an empty string for level-1 roots, whose parent is the excluded global root.
     *
     * @return list<array{value: string, label: string, level: int, parent: string}> Tree-shaped
     *     category option descriptors
     */
    public function getOptions(): array;
}
