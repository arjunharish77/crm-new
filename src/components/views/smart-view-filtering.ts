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

    if (condition.operator === "equals" && typeof expected === "string" && expected.startsWith("__DATE_")) return inRelativeDateWindow(actual, expected);
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
    if (condition.operator === "between" && Array.isArray(expected)) {
        const actualTime = actual ? new Date(String(actual)).getTime() : Number.NaN;
        const [start, end] = expected.map((value) => new Date(String(value)).getTime());
        return !Number.isNaN(actualTime) && actualTime >= start && actualTime <= end;
    }
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

function inRelativeDateWindow(actual: unknown, token: string) {
    const actualTime = actual ? new Date(String(actual)).getTime() : Number.NaN;
    if (Number.isNaN(actualTime)) return false;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (token === "__DATE_TODAY__") end.setDate(end.getDate() + 1);
    else if (token === "__DATE_TOMORROW__") {
        start.setDate(start.getDate() + 1);
        end.setDate(end.getDate() + 2);
    } else if (token === "__DATE_THIS_WEEK__") {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 7);
    } else if (token === "__DATE_LAST_7_DAYS__") {
        start.setDate(start.getDate() - 7);
        end.setTime(now.getTime());
    } else if (token === "__DATE_NEXT_7_DAYS__") {
        end.setDate(end.getDate() + 7);
    } else {
        return false;
    }
    return actualTime >= start.getTime() && actualTime < end.getTime();
}
