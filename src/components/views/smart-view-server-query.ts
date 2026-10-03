import type { FilterConfig } from "@/types/filters";
import type { SmartViewModule } from "@/types/smart-views";

// Smart View filters for leads, opportunities, activities and tasks run on the server (UI/UX plan
// deferred item; the lasting fix for the 5,000-record cap): the tab asks the list API for one page
// of matches and the exact total. A tab whose filters the server can't apply (for example "pending
// next best actions" or "activity touch state") keeps filtering in the browser and says how much
// it checked. The API is called with ?strict=1, so a condition it can't apply is refused rather
// than skipped -- a skipped condition would widen the result without saying so.

export const SERVER_FILTERED_PATHS: Partial<Record<SmartViewModule, string>> = {
    LEADS: "/leads",
    OPPORTUNITIES: "/opportunities",
    ACTIVITIES: "/activities",
    TASKS: "/tasks",
};

// The fields each list API filters on (LEAD_FILTER_COLUMNS, OPPORTUNITY_FILTER_COLUMNS,
// ACTIVITY_FILTER_COLUMNS and TASK_FILTER_COLUMNS on the server), limited to what Smart Views
// offer. A task tab using "Due segment" filters in the browser.
const SERVER_FIELDS: Partial<Record<SmartViewModule, Set<string>>> = {
    LEADS: new Set([
        "name", "email", "company", "status", "source", "score", "ownerId", "createdAt",
        "predictiveScoreBand", "predictiveConversionProbability", "predictiveConfidence", "predictiveStallRisk",
        "predictiveExpectedResponseLikelihood", "predictiveDuplicateRisk", "predictiveStaleRisk",
    ]),
    OPPORTUNITIES: new Set([
        "title", "amount", "stageId", "priority", "ownerId", "expectedCloseDate", "createdAt",
        "predictiveScoreBand", "predictiveWinProbability", "predictiveConfidence", "predictiveStallRisk", "predictiveExpectedCloseRisk",
    ]),
    ACTIVITIES: new Set(["typeId", "outcome", "notes", "dueAt", "slaStatus", "createdBy"]),
    TASKS: new Set(["title", "status", "priority", "ownerId", "leadId", "opportunityId", "dueAt"]),
};

// "Owner segment" and "team segment" are about the record's owner (activities: who logged it).
const OWNER_FIELD: Partial<Record<SmartViewModule, string>> = { LEADS: "ownerId", OPPORTUNITIES: "ownerId", ACTIVITIES: "createdBy", TASKS: "ownerId" };

// Older relative-date values, as the server's tokens.
const DATE_TOKENS: Record<string, string> = {
    __DATE_TODAY__: "@today",
    __DATE_TOMORROW__: "@tomorrow",
    __DATE_THIS_WEEK__: "@this_week",
    __DATE_LAST_7_DAYS__: "@last_7_days",
    __DATE_NEXT_7_DAYS__: "@next_7_days",
};

// Column -> the list API's sort key.
const SERVER_SORTS: Partial<Record<SmartViewModule, Record<string, string>>> = {
    LEADS: { name: "name", status: "status", source: "source", score: "score", createdAt: "createdAt", ownerId: "owner" },
    OPPORTUNITIES: { title: "title", amount: "amount", stageId: "stage", priority: "priority", expectedCloseDate: "expectedCloseDate", ownerId: "owner", createdAt: "createdAt" },
    ACTIVITIES: { typeId: "type", outcome: "outcome", dueAt: "dueAt", slaStatus: "slaStatus", createdAt: "createdAt" },
    TASKS: { title: "title", dueAt: "dueAt", priority: "priority", status: "status", ownerId: "owner", createdAt: "createdAt" },
};

export type ServerCondition = { field: string; operator: string; value: unknown };
export type ServerGroup = { logic: "AND" | "OR"; conditions: ServerCondition[] };
export type ServerQuery = { ok: true; group: ServerGroup | null } | { ok: false; field: string };

function mapValue(value: unknown): unknown {
    if (typeof value === "string") return DATE_TOKENS[value] ?? value;
    if (Array.isArray(value)) return value.map(mapValue);
    return value;
}

// The tab's filters as one server filter group, or the first field the server can't filter on.
export function toServerQuery(module: SmartViewModule, filters: FilterConfig | null | undefined): ServerQuery {
    const fields = SERVER_FIELDS[module];
    const ownerField = OWNER_FIELD[module];
    if (!fields || !ownerField) return { ok: false, field: module };
    const conditions: ServerCondition[] = [];
    for (const condition of filters?.conditions ?? []) {
        if (!condition?.field) continue;
        const operator = condition.operator ?? "equals";
        if (condition.field === "ownerSegment" || condition.field === "teamSegment") {
            if (operator !== "equals" && operator !== "not_equals") return { ok: false, field: condition.field };
            const target = condition.field === "ownerSegment" ? "CURRENT_USER" : "CURRENT_TEAM";
            const token = condition.field === "ownerSegment" ? "@me" : "@myteam";
            const mine = (condition.value === target) !== (operator === "not_equals");
            // "Someone else" includes records with no owner.
            conditions.push({ field: ownerField, operator: mine ? "equals" : "not_equals_or_empty", value: token });
            continue;
        }
        if (!fields.has(condition.field)) return { ok: false, field: condition.field };
        conditions.push({ field: condition.field, operator, value: mapValue(condition.value) });
    }
    return { ok: true, group: conditions.length ? { logic: filters?.logic === "OR" ? "OR" : "AND", conditions } : null };
}

export function serverSortKey(module: SmartViewModule, column: string) {
    return SERVER_SORTS[module]?.[column] ?? null;
}

// The list API URL for one page of a tab (plus extra groups, e.g. a count chip's condition).
export function serverListUrl(
    module: SmartViewModule,
    groups: Array<ServerGroup | null>,
    page: { page: number; limit: number; search?: string; sort?: { id: string; desc: boolean } | null },
) {
    const path = SERVER_FILTERED_PATHS[module];
    if (!path) throw new Error(`No server list for ${module}`);
    const params = new URLSearchParams({ page: String(page.page), limit: String(page.limit), strict: "1" });
    const filterGroups = groups.filter((group): group is ServerGroup => !!group);
    if (filterGroups.length) params.set("filters", JSON.stringify(filterGroups));
    if (page.search?.trim()) params.set("q", page.search.trim());
    const sortKey = page.sort ? serverSortKey(module, page.sort.id) : null;
    if (page.sort && sortKey) {
        params.set("sort", sortKey);
        params.set("dir", page.sort.desc ? "desc" : "asc");
    }
    return `${path}?${params.toString()}`;
}
