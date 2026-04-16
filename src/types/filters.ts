export type FilterOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'less_than'
    | 'greater_than_or_equal'
    | 'less_than_or_equal'
    | 'in'
    | 'not_in'
    | 'is_empty'
    | 'is_not_empty'
    | 'before'
    | 'after'
    | 'between'
    | 'includes'
    | 'includes_all'
    | 'includes_any';

export type FilterFieldType = 'text' | 'number' | 'date' | 'select' | 'tags' | 'boolean';

export interface FilterField {
    key: string;
    label: string;
    type: FilterFieldType;
    options?: { label: string; value: string }[]; // For select fields
}

export interface FilterCondition {
    id: string;
    field: string;
    operator: FilterOperator;
    value: any;
}

export interface FilterConfig {
    conditions: FilterCondition[];
    logic: 'AND' | 'OR';
}

export interface SortConfig {
    field: string;
    order: 'asc' | 'desc';
}

// Operators available for each field type
export const OPERATORS_BY_TYPE: Record<FilterFieldType, { value: FilterOperator; label: string }[]> = {
    text: [
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Does not contain' },
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Does not equal' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
    ],
    number: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Does not equal' },
        { value: 'greater_than', label: 'Greater than' },
        { value: 'less_than', label: 'Less than' },
        { value: 'greater_than_or_equal', label: 'Greater than or equal' },
        { value: 'less_than_or_equal', label: 'Less than or equal' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
    ],
    date: [
        { value: 'equals', label: 'On date' },
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
    ],
    select: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Does not equal' },
        { value: 'in', label: 'Is one of' },
        { value: 'not_in', label: 'Is not one of' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
    ],
    tags: [
        { value: 'includes', label: 'Includes' },
        { value: 'includes_all', label: 'Includes all of' },
        { value: 'includes_any', label: 'Includes any of' },
        { value: 'is_empty', label: 'Is empty' },
        { value: 'is_not_empty', label: 'Is not empty' },
    ],
    boolean: [
        { value: 'equals', label: 'Is' },
    ],
};
