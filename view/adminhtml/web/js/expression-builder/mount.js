/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The expression builder's public mount: renders the builder into any element of an admin page,
 * outside a ui_component form, and hands back a handle to feed it values and tear it down.
 *
 *     mount(host, {value, builderConfig, ...tunables}, onChange) → {setValue(value), destroy()}
 *
 * It creates the builder the way a form does — Magento's layout processor instantiates the component
 * under a registry name, and Magento's `scope` binding renders it through `getTemplate()` — into an
 * element of its own appended to the host, so the host's own attributes and children stay the
 * caller's. Importing this module does nothing; the work starts at the call, which is safe at any
 * time after the host exists, before or after DOMContentLoaded.
 *
 * The contract a caller can rely on:
 *
 * - one builder per host: mounting into a host that already holds one returns the handle it has, and
 *   the first call's options and callback stay in force until that handle is destroyed;
 * - `onChange` hears each value an edit in the builder produces, and never the value the builder was
 *   mounted with or handed through `setValue`, nor the builder's rewrite of that value into its own
 *   serialisation;
 * - `setValue` loads a different value into the builder and ignores the one it already holds; a call
 *   made before the builder is created is applied once it is;
 * - `destroy` disposes the builder, cleans and removes the element it rendered into, and frees the
 *   registry name; it is idempotent, and safe before the builder is created.
 *
 * Options and names are checked by mount-options.js, the echo rules decided by value-sync.js; this
 * module only binds them to Knockout, the layout processor and the registry.
 */
define([
    'ko',
    'uiLayout',
    'uiRegistry',
    'Hryvinskyi_UiFormElements/js/expression-builder/mount-options',
    'Hryvinskyi_UiFormElements/js/expression-builder/value-sync',
    'Magento_Ui/js/lib/knockout/bootstrap'
], function (ko, layout, registry, mountOptions, valueSync) {
    'use strict';

    /**
     * The component every mount creates.
     */
    var COMPONENT = 'Hryvinskyi_UiFormElements/js/form/element/expression-builder';

    /**
     * The handle of the builder each host holds.
     */
    var handles = new WeakMap();

    /**
     * Registry names held by mounts, from the call until the builder is gone. A name is held before
     * the builder reaches the registry, so two mounts in one tick cannot pick the same one.
     */
    var reserved = new Set();

    /**
     * @param {String} name
     * @returns {Boolean} Whether a mount holds the name or the registry already has an entry under it.
     */
    function isTaken(name) {
        return reserved.has(name) || registry.has(name);
    }

    /**
     * @param {*} host
     * @returns {Boolean} Whether the host is an element a builder can render into.
     */
    function isElement(host) {
        return typeof host === 'object' && host !== null && host.nodeType === 1;
    }

    /**
     * Mounts one expression builder into a host element.
     *
     * @param {HTMLElement} host Element the builder renders into.
     * @param {Object} options `value` (stored value, '' for no rule), `builderConfig`, an optional
     *     registry `name`, and any of the component's tunables.
     * @param {function(String): void} onChange Called with each value an edit produces.
     * @returns {{setValue: function(String): void, destroy: function(): void}}
     * @throws {TypeError} When the host is not an element, the callback is not a function, or the
     *     options are refused by mount-options.js.
     * @throws {Error} When the requested registry name is taken.
     */
    function mount(host, options, onChange) {
        var config;
        var name;
        var root;
        var sync;
        var builder = null;
        var subscription = null;
        var destroyed = false;
        var pending = null;
        var handle;

        if (!isElement(host)) {
            throw new TypeError('The expression builder host must be an element');
        }

        if (handles.has(host)) {
            return handles.get(host);
        }

        if (typeof onChange !== 'function') {
            throw new TypeError('The expression builder onChange callback must be a function');
        }

        config = mountOptions.componentConfig(options);
        name = mountOptions.componentName(options.name, isTaken);
        sync = valueSync.createValueSync(config.value);

        /**
         * Loads a value the caller handed in, unless the builder already holds it.
         *
         * @param {String} value
         * @returns {void}
         */
        function load(value) {
            if (sync.wants(value)) {
                builder.loadStoredValue(value);
                sync.loaded(builder.serialise());
            }
        }

        /**
         * Binds the created builder to the element and to the caller, or disposes it when the
         * handle was destroyed while it was being created.
         *
         * @param {Object} created The component instance.
         * @returns {void}
         */
        function ready(created) {
            if (destroyed) {
                created.destroy();
                registry.remove(name);
                reserved.delete(name);

                return;
            }

            builder = created;
            sync.loaded(builder.serialise());
            subscription = builder.value.subscribe(function (value) {
                if (sync.changed(value)) {
                    onChange(value);
                }
            });
            ko.applyBindingsToNode(root, {scope: name}, {});

            if (pending !== null) {
                load(pending.value);
                pending = null;
            }
        }

        handle = Object.freeze({
            /**
             * @param {String} value Stored value to show: a JSON string, or '' for no rule.
             * @returns {void}
             */
            setValue: function (value) {
                if (typeof value !== 'string') {
                    throw new TypeError('The expression builder value must be a string');
                }

                if (destroyed) {
                    return;
                }

                if (builder === null) {
                    pending = {value: value};

                    return;
                }

                load(value);
            },

            /**
             * @returns {void}
             */
            destroy: function () {
                if (destroyed) {
                    return;
                }

                destroyed = true;
                pending = null;
                handles.delete(host);
                ko.cleanNode(root);

                if (root.parentNode) {
                    root.parentNode.removeChild(root);
                }

                if (builder === null) {
                    // The name stays reserved until the builder being created arrives and is disposed.
                    return;
                }

                subscription.dispose();
                builder.destroy();
                registry.remove(name);
                reserved.delete(name);
            }
        });

        reserved.add(name);
        root = host.ownerDocument.createElement('div');
        root.appendChild(host.ownerDocument.createComment(' ko template: getTemplate() '));
        root.appendChild(host.ownerDocument.createComment(' /ko '));
        host.appendChild(root);
        handles.set(host, handle);

        layout([{name: name, component: COMPONENT, config: config}]);
        registry.get(name, ready);

        return handle;
    }

    return {
        mount: mount
    };
});
