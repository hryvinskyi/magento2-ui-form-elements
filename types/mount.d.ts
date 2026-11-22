/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * Types of the expression builder's public mount, declared under the RequireJS id the admin serves it
 * by. A TypeScript consumer adds this file to its compilation (`files`/`include` in its tsconfig, or a
 * triple-slash reference) and imports the types with `import type`, which leaves nothing behind at
 * runtime; the module itself is loaded through the page's RequireJS.
 */
declare module 'Hryvinskyi_UiFormElements/js/expression-builder/mount' {
    /**
     * The builder config a consumer's PHP publishes (`ExpressionBuilderConfigInterface`): fields,
     * the combine type, endpoints and wording. The component reads and checks it itself, so it is
     * passed through as it arrived.
     */
    export type ExpressionBuilderConfig = Readonly<Record<string, unknown>>;

    /**
     * The component's tunables a mount may set. Each one the component cannot use degrades to its
     * shipped value.
     */
    export interface ExpressionBuilderTunables {
        /** The builder's heading, already translated. */
        readonly label?: string;
        readonly maxGroupDepth?: number;
        readonly optionMatchCap?: number;
        readonly treeExpandAllLimit?: number;
        readonly searchableSelectThreshold?: number;
        readonly pillCollapseLimit?: number;
        readonly pasteNoticeTimeout?: number;
        readonly suggestMinQuery?: number;
        readonly suggestDebounce?: number;
        readonly countDebounce?: number;
        readonly joinerStyle?: 'rail' | 'chip' | 'none';
        readonly density?: 'comfortable' | 'compact';
        readonly showPreview?: boolean;
    }

    export interface ExpressionBuilderMountOptions extends ExpressionBuilderTunables {
        /**
         * Registry name to create the builder under: a letter, then letters, digits, `_` or `-`.
         * Without it a free name is generated. A name already in use is refused.
         */
        readonly name?: string;
        /** The stored rule as JSON, or '' for no rule. */
        readonly value: string;
        readonly builderConfig: ExpressionBuilderConfig;
    }

    export interface ExpressionBuilderHandle {
        /**
         * Shows a stored rule (JSON, or '' for no rule). The value the builder already holds is
         * ignored; a different one rebuilds the rule and is not reported to the change callback.
         */
        setValue(value: string): void;
        /**
         * Disposes the builder, removes what it rendered from the host and frees its registry name.
         * Idempotent.
         */
        destroy(): void;
    }

    /**
     * Mounts one builder into the host. A host that already holds one returns the handle it has.
     *
     * @param onChange Called with each value an edit in the builder produces — never with the value
     *     the builder was given, nor with its own rewrite of that value.
     * @throws {TypeError} When the host is not an element, the callback is not a function, or the
     *     options hold an unknown key, a value that is not a string or a builder config that is not
     *     an object.
     * @throws {Error} When the requested name is in use.
     */
    export type MountExpressionBuilder = (
        host: HTMLElement,
        options: ExpressionBuilderMountOptions,
        onChange: (value: string) => void
    ) => ExpressionBuilderHandle;

    /** What the RequireJS module exports. */
    export interface ExpressionBuilderMountModule {
        readonly mount: MountExpressionBuilder;
    }

    export const mount: MountExpressionBuilder;
}
