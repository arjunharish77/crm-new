import type { FilterGroup } from "@/components/filters/advanced-filter-drawer";
import type { FilterConfig } from "@/types/filters";
import type { FilterChip } from "@/components/common/list-toolbar";

// Shared by the list pages (UI/UX plan Phase 2): the advanced filter drawer's groups, as the
// ?filters= query, back from a link, and as removable chips in the list toolbar.

export const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };

// Serializes the real, possibly multi-group FilterGroup[] (each group keeps its own AND/OR).
export function groupsToQuery(groups: FilterGroup[]) {
    const nonEmpty = groups
        .map((group) => ({ ...group, conditions: group.conditions.filter((condition) => condition.field) }))
        .filter((group) => group.conditions.length > 0);
    return nonEmpty.length > 0 ? JSON.stringify(nonEmpty) : "";
}

// Filter groups from a ?filters= link (Smart Views, reports), so they show as chips.
export function parseGroups(raw: string): FilterGroup[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        return list
            .filter((group: any) => group && Array.isArray(group.conditions))
            .map((group: any, index: number) => ({
                id: group.id ?? `group-${index}`,
                logic: group.logic === "OR" ? "OR" : "AND",
                conditions: group.conditions.map((condition: any, conditionIndex: number) => ({ id: condition.id ?? `c-${index}-${conditionIndex}`, ...condition })),
            }));
    } catch {
        return [];
    }
}

// The flat shape QueueExportButton's `filters` metadata expects.
export function groupsToFilterConfig(groups: FilterGroup[]): FilterConfig {
    const firstGroup = groups[0];
    if (!firstGroup) return EMPTY_FILTERS;
    return {
        logic: firstGroup.logic,
        conditions: groups.flatMap((group) =>
            group.conditions.filter((condition) => condition.field).map((condition) => ({ id: condition.id, field: condition.field, operator: condition.operator as any, value: condition.value })),
        ),
    };
}

const OPERATOR_TEXT: Record<string, string> = {
    equals: "is", not_equals: "is not", contains: "contains", not_contains: "doesn't contain", starts_with: "starts with", ends_with: "ends with",
    greater_than: ">", less_than: "<", gte: "≥", lte: "≤", is_empty: "is empty", is_not_empty: "is set", in: "is any of", not_in: "is none of",
    before: "before", after: "after", on: "on", between: "between", includes_any: "has any of", includes_all: "has all of",
};

// One chip per condition; removing a chip removes that condition (and an emptied group).
export function chipsFromGroups(
    groups: FilterGroup[],
    onChange: (groups: FilterGroup[]) => void,
    labels: { field: (field: string) => string; value: (field: string, value: unknown) => string },
): FilterChip[] {
    return groups.flatMap((group, groupIndex) =>
        group.conditions
            .map((condition, conditionIndex) => ({ condition, conditionIndex }))
            .filter(({ condition }) => condition.field)
            .map(({ condition, conditionIndex }) => {
                const hasValue = !["is_empty", "is_not_empty"].includes(condition.operator);
                const values = Array.isArray(condition.value) ? condition.value : [condition.value];
                return {
                    id: `${groupIndex}-${conditionIndex}-${condition.field}`,
                    label: `${labels.field(condition.field)} ${OPERATOR_TEXT[condition.operator] ?? condition.operator}${hasValue ? ` ${values.map((value) => labels.value(condition.field, value)).join(", ")}` : ""}`,
                    onRemove: () => onChange(
                        groups
                            .map((item, index) => (index === groupIndex ? { ...item, conditions: item.conditions.filter((_, i) => i !== conditionIndex) } : item))
                            .filter((item) => item.conditions.some((c) => c.field)),
                    ),
                };
            }),
    );
}
