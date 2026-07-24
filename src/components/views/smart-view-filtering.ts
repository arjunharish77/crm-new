import { FilterCondition, FilterConfig } from "@/types/filters";

export function applySmartViewFilters<T extends Record<string, any>>(records: T[], filters: FilterConfig): T[] {
    if (!filters.conditions.length) return records;

    return records.filter((record) => {
        const results = filters.conditions.map((condition) => conditionMatches(record, condition));
        return filters.logic === "OR" ? results.some(Boolean) : results.every(Boolean);
    });
}

function conditionMatches(record: Record<string, any>, condition: FilterCondition) {
    const actual = readValue(record, condition.field);
    const expected = condition.value;

    if (condition.operator === "is_empty") return actual === null || actual === undefined || actual === "";
    if (condition.operator === "is_not_empty") return actual !== null && actual !== undefined && actual !== "";

    const actualString = String(actual ?? "").toLowerCase();
    const expectedString = String(expected ?? "").toLowerCase();
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);

    if (condition.operator === "equals") {
        if (typeof actual === "boolean") return actual === expected || String(actual) === String(expected);
        return actualString === expectedString;
    }
    if (condition.operator === "not_equals") return actualString !== expectedString;
    if (condition.operator === "contains") return actualString.includes(expectedString);
    if (condition.operator === "not_contains") return !actualString.includes(expectedString);
    if (condition.operator === "starts_with") return actualString.startsWith(expectedString);
    if (condition.operator === "ends_with") return actualString.endsWith(expectedString);
    if (condition.operator === "greater_than") return actualNumber > expectedNumber;
    if (condition.operator === "less_than") return actualNumber < expectedNumber;
    if (condition.operator === "greater_than_or_equal") return actualNumber >= expectedNumber;
    if (condition.operator === "less_than_or_equal") return actualNumber <= expectedNumber;
    if (condition.operator === "in") return Array.isArray(expected) ? expected.map(String).includes(String(actual)) : false;
    if (condition.operator === "not_in") return Array.isArray(expected) ? !expected.map(String).includes(String(actual)) : true;
    if (condition.operator === "before") return compareDate(actual, expected) < 0;
    if (condition.operator === "after") return compareDate(actual, expected) > 0;
    return true;
}

function compareDate(actual: unknown, expected: unknown) {
    const actualTime = actual ? new Date(String(actual)).getTime() : Number.NaN;
    const expectedTime = expected ? new Date(String(expected)).getTime() : Number.NaN;
    if (Number.isNaN(actualTime) || Number.isNaN(expectedTime)) return 0;
    return actualTime - expectedTime;
}

function readValue(record: Record<string, any>, path: string) {
    if (path in record) return record[path];
    return path.split(".").reduce((value, key) => value?.[key], record);
}
