/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The harness page's entry point. It publishes one object, `window.expressionBuilderHarness`, which is
 * the whole surface the browser tests drive the page through:
 *
 * - `mount(config)` creates the element the way a ui_component form does — Magento's layout
 *   processor instantiates the component under a registry name, and Magento's own `scope` binding
 *   renders it through `getTemplate()` with Magento's template engine — and resolves once the
 *   component exists;
 * - `builder()` is the mounted component;
 * - `mountPublic(hostId, options)` mounts a builder through the module's public mount function
 *   instead, the way a page outside a form does; `handle(hostId)` is the handle it returned and
 *   `reported(hostId)` every value it passed to the change callback;
 * - `requests()` lists the requests the component sent, and `answer(index, status, body)` delivers
 *   the response to one of them.
 *
 * Everything the element runs on is the real thing: RequireJS, Knockout, jQuery, underscore, Magento's
 * Knockout bootstrap with its template engine and bindings, mage/translate with a translation
 * dictionary, uiLayout, uiRegistry, and Magento_Ui's abstract form element the component extends.
 *
 * The one stand-in is the network. `fetch` is replaced by a recorder whose responses the test
 * hands out by hand, so a test decides when an answer lands — before or after a teardown. The
 * recorder deliberately ignores the abort signal it is given, the way a response already on its
 * way does: whether a late answer reaches the view model is then decided by the component alone.
 * The signal is still recorded, so a test can see that the component did abort it. A test can opt
 * in to the other behaviour with `honourAbort()`: a request then fails with an AbortError the moment
 * its signal aborts, the way a real `fetch` does, which is what a request that outlives its
 * deadline needs in order to show its failure state.
 */
(function () {
    'use strict';

    // The page's own timer, taken before a test can replace the global ones with a fake clock: how long
    // the harness waits for an answer to be processed must not depend on the clock a test controls.
    var realSetTimeout = window.setTimeout.bind(window);
    var BUILDER_NAME = 'harness_builder';
    var BUILDER_COMPONENT = 'Hryvinskyi_UiFormElements/js/form/element/expression-builder';
    var PUBLIC_MOUNT = 'Hryvinskyi_UiFormElements/js/expression-builder/mount';
    var sent = [];
    var mounted = null;
    var handles = {};
    var reports = {};
    var abortHonoured = false;

    window.fetch = function (url, init) {
        return new Promise(function (resolve, reject) {
            var signal = init && init.signal ? init.signal : null;

            sent.push({
                url: String(url),
                body: init && init.body !== undefined ? String(init.body) : '',
                signal: signal,
                resolve: resolve
            });

            if (abortHonoured && signal !== null) {
                signal.addEventListener('abort', function () {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                });
            }
        });
    };

    /**
     * Mounts one expression builder into a fresh host element.
     *
     * @param {Object} config The element's ui_component config (value, builderConfig, tunables).
     * @returns {Promise<void>}
     */
    function mount(config) {
        return new Promise(function (resolve, reject) {
            require([
                'ko',
                'uiLayout',
                'uiRegistry',
                'Magento_Ui/js/lib/knockout/bootstrap'
            ], function (ko, layout, registry) {
                var host = document.createElement('div');

                host.id = 'harness-host';
                host.setAttribute('data-bind', 'scope: \'' + BUILDER_NAME + '\'');
                host.appendChild(document.createComment(' ko template: getTemplate() '));
                host.appendChild(document.createComment(' /ko '));
                document.body.appendChild(host);

                layout([{
                    name: BUILDER_NAME,
                    component: BUILDER_COMPONENT,
                    config: config
                }]);
                ko.applyBindings({}, host);
                registry.get(BUILDER_NAME, function (builder) {
                    mounted = builder;
                    resolve();
                });
            }, reject);
        });
    }

    /**
     * Mounts one expression builder through the module's public mount function into the element
     * with the given id, creating it when the page has none. The handle mount() returns and every
     * value it reports are kept under that id.
     *
     * @param {string} hostId
     * @param {Object} options The options mount() takes.
     * @returns {Promise<void>} Resolves once mount() has returned.
     */
    function mountPublic(hostId, options) {
        return publicMount().then(function (api) {
            reports[hostId] = [];
            handles[hostId] = api.mount(hostFor(hostId), options, function (value) {
                reports[hostId].push(value);
            });
        });
    }

    /**
     * @returns {Promise<Object>} The public mount module.
     */
    function publicMount() {
        return new Promise(function (resolve, reject) {
            require([PUBLIC_MOUNT], resolve, reject);
        });
    }

    /**
     * @param {string} hostId
     * @returns {HTMLElement} The element with the id, appended to the page when it has none.
     */
    function hostFor(hostId) {
        var host = document.getElementById(hostId);

        if (host === null) {
            host = document.createElement('section');
            host.id = hostId;
            document.body.appendChild(host);
        }

        return host;
    }

    window.expressionBuilderHarness = {
        mount: mount,
        mountPublic: mountPublic,

        /**
         * Calls the public mount() again on a host that holds a builder.
         *
         * @param {string} hostId
         * @param {Object} options
         * @returns {Promise<boolean>} Whether it returned the handle the host already had.
         */
        mountPublicAgain: function (hostId, options) {
            return publicMount().then(function (api) {
                return api.mount(hostFor(hostId), options, function () {}) === handles[hostId];
            });
        },

        /**
         * Calls the public mount() and gives back the message of what it throws.
         *
         * @param {string} hostId
         * @param {*} options
         * @param {*} onChange
         * @returns {Promise<string>} `<error name>: <message>`, or '' when it threw nothing.
         */
        mountPublicError: function (hostId, options, onChange) {
            return publicMount().then(function (api) {
                try {
                    api.mount(hostFor(hostId), options, onChange);
                } catch (error) {
                    return error.name + ': ' + error.message;
                }

                return '';
            });
        },

        /**
         * @param {string} hostId
         * @returns {{setValue: function(string): void, destroy: function(): void}} The handle mount() returned.
         */
        handle: function (hostId) {
            return handles[hostId];
        },

        /**
         * @param {string} hostId
         * @returns {string[]} Every value the builder in that host reported, in order.
         */
        reported: function (hostId) {
            return reports[hostId].slice();
        },

        /**
         * @param {string} name
         * @returns {Promise<boolean>} Whether the registry holds an entry under the name.
         */
        registryHas: function (name) {
            return new Promise(function (resolve, reject) {
                require(['uiRegistry'], function (registry) {
                    resolve(registry.has(name));
                }, reject);
            });
        },

        /**
         * @returns {Object} The mounted component.
         */
        builder: function () {
            if (mounted === null) {
                throw new Error('No expression builder is mounted');
            }

            return mounted;
        },

        /**
         * @returns {Array<{url: string, body: string, aborted: boolean}>} Every request sent so far.
         */
        requests: function () {
            return sent.map(function (request) {
                return {
                    url: request.url,
                    body: request.body,
                    aborted: request.signal !== null && request.signal.aborted
                };
            });
        },

        /**
         * Makes every request sent from now on fail with an AbortError once its signal aborts.
         *
         * @returns {void}
         */
        honourAbort: function () {
            abortHonoured = true;
        },

        /**
         * Resolves after the given real time, whatever fake clock a test has installed.
         *
         * @param {number} milliseconds
         * @returns {Promise<void>}
         */
        settled: function (milliseconds) {
            return new Promise(function (resolve) {
                realSetTimeout(resolve, milliseconds);
            });
        },

        /**
         * Delivers the response to one recorded request.
         *
         * @param {number} index Position in requests().
         * @param {number} status HTTP status.
         * @param {*} body JSON body.
         * @returns {void}
         */
        answer: function (index, status, body) {
            sent[index].resolve(new Response(JSON.stringify(body), {
                status: status,
                headers: {'Content-Type': 'application/json'}
            }));
        }
    };
})();
