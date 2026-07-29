/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Minimal AMD environment for evaluating this module's browser AMD sources under plain Node —
 * a `define` shim plus a local underscore stub, so the behavioural tests need no npm install and
 * no build step.
 */

/**
 * The subset of underscore the expression-tree module relies on. Semantics mirror underscore's:
 * iteratees receive (value, indexOrKey, collection) and an optional context binds `this`.
 */
export const underscoreStub = {
    isArray: Array.isArray,

    /**
     * Iterates an array or a plain object's own keys. Returns the collection, like underscore.
     *
     * @param {Array|Object} collection
     * @param {Function} iteratee
     * @param {Object} [context]
     * @returns {Array|Object}
     */
    each(collection, iteratee, context) {
        if (Array.isArray(collection)) {
            for (let i = 0; i < collection.length; i++) {
                iteratee.call(context, collection[i], i, collection);
            }
        } else if (collection && typeof collection === 'object') {
            for (const key of Object.keys(collection)) {
                iteratee.call(context, collection[key], key, collection);
            }
        }

        return collection;
    },

    /**
     * Maps a collection through an iteratee into a fresh array.
     *
     * @param {Array|Object} collection
     * @param {Function} iteratee
     * @param {Object} [context]
     * @returns {Array}
     */
    map(collection, iteratee, context) {
        const result = [];
        underscoreStub.each(collection, (value, key, coll) => {
            result.push(iteratee.call(context, value, key, coll));
        });

        return result;
    },

    /**
     * Keeps the values the predicate accepts.
     *
     * @param {Array|Object} collection
     * @param {Function} predicate
     * @param {Object} [context]
     * @returns {Array}
     */
    filter(collection, predicate, context) {
        const result = [];
        underscoreStub.each(collection, (value, key, coll) => {
            if (predicate.call(context, value, key, coll)) {
                result.push(value);
            }
        });

        return result;
    },

    /**
     * True when the predicate accepts every value.
     *
     * @param {Array|Object} collection
     * @param {Function} predicate
     * @param {Object} [context]
     * @returns {Boolean}
     */
    every(collection, predicate, context) {
        let result = true;
        underscoreStub.each(collection, (value, key, coll) => {
            if (!predicate.call(context, value, key, coll)) {
                result = false;
            }
        });

        return result;
    },

    /**
     * True when the predicate accepts at least one value.
     *
     * @param {Array|Object} collection
     * @param {Function} predicate
     * @param {Object} [context]
     * @returns {Boolean}
     */
    some(collection, predicate, context) {
        let result = false;
        underscoreStub.each(collection, (value, key, coll) => {
            if (predicate.call(context, value, key, coll)) {
                result = true;
            }
        });

        return result;
    },

    /**
     * The first value the predicate accepts, or undefined.
     *
     * @param {Array|Object} collection
     * @param {Function} predicate
     * @param {Object} [context]
     * @returns {*}
     */
    find(collection, predicate, context) {
        let found;
        let hit = false;
        underscoreStub.each(collection, (value, key, coll) => {
            if (!hit && predicate.call(context, value, key, coll)) {
                hit = true;
                found = value;
            }
        });

        return found;
    },

    /**
     * Own enumerable keys of an object; [] for anything else.
     *
     * @param {*} object
     * @returns {Array.<String>}
     */
    keys(object) {
        return object && typeof object === 'object' ? Object.keys(object) : [];
    },

    /**
     * The truthy values of a collection.
     *
     * @param {Array|Object} collection
     * @returns {Array}
     */
    compact(collection) {
        return underscoreStub.filter(collection, (value) => !!value);
    }
};

/**
 * Evaluates one AMD source string against a dependency registry and returns whatever its factory
 * exported. Only the single `define(deps, factory)` call form is supported — exactly what the
 * module under test uses.
 *
 * @param {String} source AMD module source code.
 * @param {Object.<String, *>} registry Dependency name → stub to hand the factory.
 * @returns {*} The factory's return value.
 * @throws {Error} When a dependency is not in the registry or the source never calls define().
 */
export function loadAmdModule(source, registry) {
    let exported;
    let defined = false;

    const define = (dependencies, factory) => {
        const resolved = dependencies.map((name) => {
            if (!Object.prototype.hasOwnProperty.call(registry, name)) {
                throw new Error(`Unresolved AMD dependency "${name}" — add it to the registry.`);
            }

            return registry[name];
        });

        exported = factory(...resolved);
        defined = true;
    };

    new Function('define', `'use strict';\n${source}`)(define);

    if (!defined) {
        throw new Error('The evaluated source never called define().');
    }

    return exported;
}
