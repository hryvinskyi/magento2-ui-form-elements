/**
 * Copyright (c) 2026. Volodymyr Hryvinskyi. All rights reserved.
 * Author: Volodymyr Hryvinskyi <volodymyr@hryvinskyi.com>
 * GitHub: https://github.com/hryvinskyi
 */

/**
 * The element config the browser tests mount: a neutral consumer with one field per value editor the
 * templates branch on — a short select (the plain `<select>`), a multiselect (pills and a listbox), a
 * hierarchical select (the option tree), a long select (the searchable combobox), free text and the
 * attribute picker (its attribute combobox and the chosen attribute's own value editor: an attribute
 * with its options inline, one that suggests values from the server as the admin types, and two whose
 * option lists are fetched once the attribute is picked) — and a stored rule with a nested group, so the recursive templates render more than one level.
 */

/**
 * @param {string} value
 * @param {string} label
 * @returns {{value: string, label: string}}
 */
const option = (value, label) => ({value, label});

/**
 * @param {string} type
 * @param {string} operator
 * @param {string} value
 * @param {string} [attribute] Defaults to the type, as for every field but the attribute picker.
 * @returns {Object} One stored condition.
 */
const leaf = (type, operator, value, attribute = type) => ({type, attribute, operator, value, is_value_processed: null});

/**
 * @param {string} aggregator
 * @param {Object[]} conditions
 * @returns {Object} One stored group.
 */
const combine = (aggregator, conditions) => ({
    type: 'test/combine',
    attribute: null,
    operator: null,
    value: '1',
    is_value_processed: null,
    aggregator,
    conditions
});

const IS = option('==', 'is');
const IS_ONE_OF = option('()', 'is one of');
const IS_NOT_ONE_OF = option('!()', 'is not one of');

export const FIELDS = [
    {
        type: 'colour',
        label: 'Colour',
        attribute: 'colour',
        valueType: 'select',
        options: [option('red', 'Red'), option('blue', 'Blue'), option('green', 'Green')],
        operators: [IS]
    },
    {
        type: 'size',
        label: 'Size',
        attribute: 'size',
        valueType: 'multiselect',
        options: [option('s', 'Small'), option('m', 'Medium'), option('l', 'Large'), option('xl', 'Extra large')],
        operators: [IS_ONE_OF, IS_NOT_ONE_OF]
    },
    {
        type: 'section',
        label: 'Section',
        attribute: 'section',
        valueType: 'select',
        options: [
            {value: '1', label: 'Home', level: 1, parent: ''},
            {value: '11', label: 'Kitchen', level: 2, parent: '1'},
            {value: '12', label: 'Garden', level: 2, parent: '1'},
            {value: '2', label: 'Office', level: 1, parent: ''}
        ],
        operators: [IS_ONE_OF, IS_NOT_ONE_OF]
    },
    {
        type: 'code',
        label: 'Code',
        attribute: 'code',
        valueType: 'select',
        options: Array.from({length: 20}, (unused, index) => option('c' + index, 'Code ' + index)),
        operators: [IS]
    },
    {
        type: 'name',
        label: 'Name',
        attribute: 'name',
        valueType: 'text',
        operators: [IS]
    },
    {
        type: 'product_attribute_picker',
        label: 'Attribute',
        childType: 'test/attribute',
        valueType: 'product-attribute',
        operators: [IS, IS_ONE_OF],
        attributes: [
            {value: 'material', label: 'Material', options: [option('wood', 'Wood'), option('metal', 'Metal')]},
            {value: 'reference', label: 'Reference', suggest: true},
            {value: 'finish', label: 'Finish', hasOptions: true},
            {value: 'season', label: 'Season', hasOptions: true}
        ]
    }
];

/**
 * A stored rule of attribute-picker rows alone, one per given row: the attribute code, the operator
 * and the stored value.
 *
 * @param {Array<[string, string, string]>} rows
 * @returns {Object}
 */
export const pickerRule = (rows) => combine('all', rows.map(
    ([attribute, operator, value]) => leaf('test/attribute', operator, value, attribute)
));

/**
 * The stored rule: Colour, Size, Code and an attribute-picker row at the root, Name and Section in a
 * nested ANY group between Size and Code.
 */
export const STORED_RULE = combine('all', [
    leaf('colour', '==', 'red'),
    leaf('size', '()', 'm,l'),
    combine('any', [
        leaf('name', '==', 'chair'),
        leaf('section', '()', '12')
    ]),
    leaf('code', '==', 'c3'),
    leaf('test/attribute', '==', 'wood', 'material')
]);

/**
 * A coherence rule for the stored rule: Colour is the context field, and a Size condition needs a
 * red Colour condition in its scope or the rule carries the warning.
 */
export const COHERENCE = {
    contextAttribute: 'colour',
    requirements: {
        size: {contexts: ['red'], warning: 'Sizes are only sold in red'}
    }
};

/**
 * The element config, as a ui_component form passes it.
 *
 * @param {Object} [overrides] Tunables or builderConfig keys to change.
 * @returns {Object}
 */
export function builderElementConfig(overrides = {}) {
    const {builderConfig = {}, ...tunables} = overrides;

    return {
        value: JSON.stringify(STORED_RULE),
        countDebounce: 1,
        builderConfig: {
            combineType: 'test/combine',
            emptyStateMessage: 'No conditions yet',
            countUrl: '/count',
            optionsUrl: '/options',
            suggestUrl: '/suggest',
            suggestMinQuery: 3,
            countLabel: '%1 matches',
            fields: FIELDS,
            ...builderConfig
        },
        ...tunables
    };
}
