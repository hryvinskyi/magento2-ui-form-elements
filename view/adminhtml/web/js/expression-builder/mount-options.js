/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * What a call to the public mount function may hand the expression builder, and the registry name
 * the builder is created under. Pure: no Knockout, no registry, no DOM — the mount adapter asks the
 * registry whether a name is taken and passes the answer in as a predicate.
 *
 * The options are a closed set on purpose. The builder is a ui_component form element, and its
 * config also reaches framework keys (`template`, `provider`, `links`, `dataScope`, …) that would
 * wire it into a form that does not exist on a page that mounts it by hand. So only the stored
 * value, the builder config and the component's documented tunables pass; any other key is refused
 * by name instead of being dropped, so a misspelt tunable fails where it is written.
 */
define([], function () {
    'use strict';

    /**
     * A registry name a caller may choose: a letter, then letters, digits, `_` or `-`. The registry
     * reads a dot as a path separator and ` = ` as a property query, so a name holding either would
     * address something other than the one builder it was meant to name.
     */
    var NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

    /**
     * Prefix of the names given to builders mounted without one.
     */
    var GENERATED_PREFIX = 'ufe_expression_builder_';

    /**
     * The component's tunables a mount may set, and the label the builder renders as its heading.
     * The component sanitises each one itself, so a nonsense value degrades to the shipped one.
     */
    var TUNABLES = Object.freeze([
        'label',
        'maxGroupDepth',
        'optionMatchCap',
        'treeExpandAllLimit',
        'searchableSelectThreshold',
        'pillCollapseLimit',
        'pasteNoticeTimeout',
        'suggestMinQuery',
        'suggestDebounce',
        'countDebounce',
        'joinerStyle',
        'density',
        'showPreview'
    ]);

    /**
     * Option keys the mount reads itself rather than passing through as tunables.
     */
    var OWN_KEYS = Object.freeze(['name', 'value', 'builderConfig']);

    /**
     * @param {*} candidate
     * @returns {Boolean} True for an object that is neither null nor an array.
     */
    function isRecord(candidate) {
        return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
    }

    /**
     * The registry name to create the builder under.
     *
     * A requested name must have the allowed shape and be free; a taken one is refused rather than
     * shared, because the registry would hand the other holder's lookups the new builder. Without a
     * request, the first free generated name is used.
     *
     * @param {*} requested The `name` option, or undefined.
     * @param {function(String): Boolean} isTaken Whether a name is already in use.
     * @returns {String}
     * @throws {TypeError} When the requested name does not have the allowed shape.
     * @throws {Error} When the requested name is taken.
     */
    function componentName(requested, isTaken) {
        var sequence = 1;

        if (requested !== undefined) {
            if (typeof requested !== 'string' || !NAME_PATTERN.test(requested)) {
                throw new TypeError(
                    'An expression builder name starts with a letter and holds only letters, digits, "_" and "-"'
                );
            }

            if (isTaken(requested)) {
                throw new Error('The expression builder name "' + requested + '" is already in use');
            }

            return requested;
        }

        while (isTaken(GENERATED_PREFIX + sequence)) {
            sequence++;
        }

        return GENERATED_PREFIX + sequence;
    }

    /**
     * The component config a mount's options become: the stored value, the builder config and each
     * tunable the caller set, copied into a fresh object so a later change to the caller's options
     * object cannot reach the builder.
     *
     * @param {*} options The options handed to mount().
     * @returns {Object} Config for the component.
     * @throws {TypeError} When the options are not an object, the value is not a string, the builder
     *     config is not an object, or a key is neither one of the mount's own keys nor a tunable.
     */
    function componentConfig(options) {
        var config;

        if (!isRecord(options)) {
            throw new TypeError('The expression builder options must be an object');
        }

        if (typeof options.value !== 'string') {
            throw new TypeError('The expression builder option "value" must be a string');
        }

        if (!isRecord(options.builderConfig)) {
            throw new TypeError('The expression builder option "builderConfig" must be an object');
        }

        config = {value: options.value, builderConfig: options.builderConfig};

        Object.keys(options).forEach(function (key) {
            if (OWN_KEYS.indexOf(key) !== -1) {
                return;
            }

            if (TUNABLES.indexOf(key) === -1) {
                throw new TypeError('Unknown expression builder option "' + key + '"');
            }

            config[key] = options[key];
        });

        return config;
    }

    return {
        TUNABLES: TUNABLES,
        componentName: componentName,
        componentConfig: componentConfig
    };
});
