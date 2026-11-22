/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * A consumer of types/mount.d.ts, compiled under the strictest settings a TypeScript island uses
 * (`npm run check-types`). It loads the module through the page's RequireJS the way an island does,
 * mounts a builder and keeps the handle, and pins what the declaration must refuse: the type checks
 * at the bottom fail to compile when the declaration lets through what it should not.
 */
import type {
    ExpressionBuilderHandle,
    ExpressionBuilderMountModule,
    ExpressionBuilderMountOptions
} from 'Hryvinskyi_UiFormElements/js/expression-builder/mount';

/**
 * The page's RequireJS, typed for the one module this consumer asks it for.
 */
type RequireMount = (
    dependencies: readonly ['Hryvinskyi_UiFormElements/js/expression-builder/mount'],
    loaded: (module: ExpressionBuilderMountModule) => void,
    failed: (error: Error) => void
) => void;

/**
 * Mounts a builder into a host and resolves with its handle once RequireJS has loaded the module.
 *
 * @param requireMount The page's RequireJS.
 * @param host Element the builder renders into.
 * @param conditions The stored rule, '' for none.
 * @param builderConfig The builder config the server published.
 * @param onChange Receives each edit.
 * @returns The handle.
 */
export function mountConditions(
    requireMount: RequireMount,
    host: HTMLElement,
    conditions: string,
    builderConfig: Readonly<Record<string, unknown>>,
    onChange: (value: string) => void
): Promise<ExpressionBuilderHandle> {
    const options: ExpressionBuilderMountOptions = {
        value: conditions,
        builderConfig,
        label: 'Only when',
        joinerStyle: 'rail',
        showPreview: true
    };

    return new Promise((resolve, reject) => {
        requireMount(
            ['Hryvinskyi_UiFormElements/js/expression-builder/mount'],
            (module) => {
                const handle = module.mount(host, options, onChange);

                handle.setValue(conditions);
                resolve(handle);
            },
            reject
        );
    });
}

/**
 * True when a value of type A may be used where B is expected.
 */
type Assignable<A, B> = [A] extends [B] ? true : false;

/**
 * Compiles only when the condition is exactly true.
 */
type Holds<Condition extends true> = Condition;

/**
 * What the declaration must refuse. Each line fails to compile when the declaration accepts it.
 */
export type DeclarationRefuses = [
    // A value that is not a string.
    Holds<Assignable<{value: number; builderConfig: {}}, ExpressionBuilderMountOptions> extends false ? true : false>,
    // Options without the builder config.
    Holds<Assignable<{value: string}, ExpressionBuilderMountOptions> extends false ? true : false>,
    // A joiner style the component does not draw.
    Holds<Assignable<{value: string; builderConfig: {}; joinerStyle: 'dots'}, ExpressionBuilderMountOptions> extends false ? true : false>,
    // A handle without destroy().
    Holds<Assignable<{setValue(value: string): void}, ExpressionBuilderHandle> extends false ? true : false>,
    // A change callback that expects anything but the stored value.
    Holds<Assignable<(value: number) => void, Parameters<ExpressionBuilderMountModule['mount']>[2]> extends false ? true : false>
];
