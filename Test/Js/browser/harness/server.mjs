/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The static server behind the browser harness: it serves the expression builder exactly as an
 * admin page loads it — through Magento's own RequireJS, with the real Knockout, jQuery,
 * underscore, Magento_Ui template engine and bindings — without a store, a database or a static
 * content deploy.
 *
 * URL space, all on 127.0.0.1 and a port the OS picks:
 *
 * - `/`                         the harness page (harness/index.html)
 * - `/harness/<file>`           the harness's own scripts and fixtures
 * - `/static/requirejs-config.js`
 *                               the RequireJS configuration, assembled the way Magento assembles it
 *                               for a page: every served module's own requirejs-config.js, each in
 *                               its own function scope, in module order
 * - `/static/js-translation.json`
 *                               the translation dictionary of the harness locale (a fixture)
 * - `/static/<Vendor_Module>/…` a module's view file, adminhtml before base — Magento's area
 *                               fallback without a theme
 * - `/static/…`                 everything else from the installation's lib/web
 *
 * The module under test is served from this working copy, never from an installed copy elsewhere,
 * so the test always runs the sources beside it.
 */
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const harnessDir = dirname(fileURLToPath(import.meta.url));

/**
 * The module under test: four levels above this file (Test/Js/browser/harness).
 */
export const moduleDir = resolve(harnessDir, '..', '..', '..', '..');

/**
 * The module's own name, as RequireJS ids and template names spell it.
 */
const MODULE_NAME = 'Hryvinskyi_UiFormElements';

/**
 * The Magento modules whose view files the page loads, in the order Magento's module sequence
 * puts them — which is the order their requirejs-config.js files are applied in. Only base-area
 * configs are applied: the admin theme's own adminhtml config pulls the whole backend shell as
 * `deps`, which is the page around the builder, not the builder.
 */
const MAGENTO_MODULES = ['Magento_Theme', 'Magento_Translation', 'Magento_Ui'];

const AREAS = ['adminhtml', 'base'];

const CONTENT_TYPES = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * Finds the Magento installation the module is installed into: `MAGENTO_ROOT` when set, else the
 * nearest ancestor of the module that holds Magento's lib/web RequireJS.
 *
 * @returns {string}
 */
export function findMagentoRoot() {
    const marker = join('lib', 'web', 'requirejs', 'require.js');
    const fromEnv = process.env.MAGENTO_ROOT;

    if (fromEnv) {
        if (!existsSync(join(fromEnv, marker))) {
            throw new Error(`MAGENTO_ROOT=${fromEnv} holds no ${marker}`);
        }

        return resolve(fromEnv);
    }

    for (let dir = dirname(moduleDir); dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, marker))) {
            return dir;
        }
    }

    throw new Error(
        `No Magento installation above ${moduleDir}: no ancestor holds ${marker}. Set MAGENTO_ROOT.`
    );
}

/**
 * Magento_FooBar → foo-bar, the Composer package suffix of a core module.
 *
 * @param {string} name
 * @returns {string}
 */
function packageSuffix(name) {
    return name.split('_')[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * The directory a module's view files live under, for each module the page loads: the working
 * copy for the module under test, the Composer package or app/code for a core module.
 *
 * @param {string} magentoRoot
 * @returns {Record<string, string>}
 */
function moduleViewDirs(magentoRoot) {
    const dirs = {[MODULE_NAME]: join(moduleDir, 'view')};

    for (const name of MAGENTO_MODULES) {
        const candidates = [
            join(magentoRoot, 'vendor', 'magento', 'module-' + packageSuffix(name), 'view'),
            join(magentoRoot, 'app', 'code', 'Magento', name.split('_')[1], 'view')
        ];
        const found = candidates.find((dir) => existsSync(dir));

        if (!found) {
            throw new Error(`${name} has no view directory under ${magentoRoot}`);
        }
        dirs[name] = found;
    }

    return dirs;
}

/**
 * Resolves `relative` below `base`, or null when it would leave it.
 *
 * @param {string} base
 * @param {string} relative
 * @returns {string|null}
 */
function inside(base, relative) {
    const target = resolve(base, '.' + sep + relative);

    return target === base || target.startsWith(base + sep) ? target : null;
}

/**
 * A readable regular file at `path`, or null.
 *
 * @param {string|null} path
 * @returns {string|null}
 */
function fileAt(path) {
    return path !== null && existsSync(path) && statSync(path).isFile() ? path : null;
}

/**
 * Magento's requirejs-config.js for the served modules, assembled as the page head receives it.
 *
 * @param {Record<string, string>} viewDirs
 * @returns {string}
 */
function requireJsConfig(viewDirs) {
    const parts = [];

    for (const name of MAGENTO_MODULES) {
        const file = fileAt(join(viewDirs[name], 'base', 'requirejs-config.js'));

        if (file !== null) {
            parts.push('(function() {\n' + readFileSync(file, 'utf8') + '\nrequire.config(config);\n})();');
        }
    }

    return '(function(require){\n' + parts.join('\n') + '\n})(require);\n';
}

/**
 * Starts the harness server on 127.0.0.1 and a free port.
 *
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
export async function startHarnessServer() {
    const magentoRoot = findMagentoRoot();
    const libWeb = join(magentoRoot, 'lib', 'web');
    const viewDirs = moduleViewDirs(magentoRoot);
    const config = requireJsConfig(viewDirs);

    /**
     * The file a URL path names, or null.
     *
     * @param {string} path
     * @returns {string|null}
     */
    function resolvePath(path) {
        if (path === '/') {
            return join(harnessDir, 'index.html');
        }

        if (path.startsWith('/harness/')) {
            return fileAt(inside(harnessDir, path.slice('/harness/'.length)));
        }

        if (path === '/static/js-translation.json') {
            return join(harnessDir, 'js-translation.json');
        }

        if (!path.startsWith('/static/')) {
            return null;
        }

        const rest = path.slice('/static/'.length);
        const slash = rest.indexOf('/');
        const head = slash === -1 ? rest : rest.slice(0, slash);

        if (Object.hasOwn(viewDirs, head)) {
            for (const area of AREAS) {
                const file = fileAt(inside(join(viewDirs[head], area, 'web'), rest.slice(slash + 1)));

                if (file !== null) {
                    return file;
                }
            }

            return null;
        }

        return fileAt(inside(libWeb, rest));
    }

    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);

        if (path === '/static/requirejs-config.js') {
            response.writeHead(200, {'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store'});
            response.end(config);

            return;
        }

        const file = resolvePath(path);

        if (file === null) {
            response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
            response.end('Not found: ' + path);

            return;
        }

        response.writeHead(200, {
            'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        response.end(readFileSync(file));
    });

    await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', () => resolveListen(undefined));
    });

    const address = server.address();

    if (address === null || typeof address === 'string') {
        throw new Error('The harness server has no TCP address');
    }

    return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose) => {
            server.closeAllConnections();
            server.close(() => resolveClose());
        })
    };
}
