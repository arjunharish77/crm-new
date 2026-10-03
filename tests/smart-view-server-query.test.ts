import { describe, expect, it } from "vitest";
import { serverListUrl, toServerQuery } from "@/components/views/smart-view-server-query";
import { applyFilterCondition, assertFilterGroupsSupported, resolveRelativeDateRange, UnsupportedFilterError, type FilterColumnEntry } from "@/lib/query-filters";

describe("Smart View filters on the server", () => {
    it("passes server-filterable conditions through, keeping the tab's AND/OR", () => {
        const query = toServerQuery("LEADS", { logic: "OR", conditions: [
            { id: "1", field: "status", operator: "equals", value: "HOT" },
            { id: "2", field: "createdAt", operator: "equals", value: "__DATE_LAST_7_DAYS__" },
        ] });
        expect(query).toEqual({ ok: true, group: { logic: "OR", conditions: [
            { field: "status", operator: "equals", value: "HOT" },
            { field: "createdAt", operator: "equals", value: "@last_7_days" },
        ] } });
    });

    it("turns owner and team segments into owner conditions; 'someone else' includes unowned records", () => {
        const owner = (operator: any, value: string, module: any = "LEADS") =>
            toServerQuery(module, { logic: "AND", conditions: [{ id: "1", field: "ownerSegment", operator, value }] });
        expect(owner("equals", "CURRENT_USER")).toMatchObject({ group: { conditions: [{ field: "ownerId", operator: "equals", value: "@me" }] } });
        expect(owner("equals", "OTHER")).toMatchObject({ group: { conditions: [{ field: "ownerId", operator: "not_equals_or_empty", value: "@me" }] } });
        expect(owner("not_equals", "CURRENT_USER")).toMatchObject({ group: { conditions: [{ operator: "not_equals_or_empty" }] } });
        expect(owner("equals", "CURRENT_USER", "ACTIVITIES")).toMatchObject({ group: { conditions: [{ field: "createdBy" }] } });
        const team = toServerQuery("OPPORTUNITIES", { logic: "AND", conditions: [{ id: "1", field: "teamSegment", operator: "equals", value: "CURRENT_TEAM" }] });
        expect(team).toMatchObject({ group: { conditions: [{ field: "ownerId", operator: "equals", value: "@myteam" }] } });
        expect(owner("is_empty", "")).toEqual({ ok: false, field: "ownerSegment" });
    });

    it("reports a field the server can't filter on, so the tab filters in the browser", () => {
        expect(toServerQuery("LEADS", { logic: "AND", conditions: [{ id: "1", field: "pendingNbaCount", operator: "greater_than", value: "0" }] })).toEqual({ ok: false, field: "pendingNbaCount" });
        expect(toServerQuery("PARTNERS", { logic: "AND", conditions: [] }).ok).toBe(false);
        // Tasks filter on the server (Section 8 #4), except the "Due segment", which stays in the browser.
        expect(toServerQuery("TASKS", { logic: "AND", conditions: [] })).toEqual({ ok: true, group: null });
        expect(toServerQuery("TASKS", { logic: "AND", conditions: [{ id: "1", field: "due", operator: "equals", value: "overdue" }] })).toEqual({ ok: false, field: "due" });
        expect(toServerQuery("TASKS", { logic: "AND", conditions: [{ id: "1", field: "ownerSegment", operator: "equals", value: "CURRENT_USER" }] }))
            .toMatchObject({ group: { conditions: [{ field: "ownerId", operator: "equals", value: "@me" }] } });
        expect(toServerQuery("LEADS", { logic: "AND", conditions: [] })).toEqual({ ok: true, group: null });
    });

    it("builds a strict list URL with search and a mapped sort", () => {
        const url = serverListUrl("OPPORTUNITIES", [{ logic: "AND", conditions: [{ field: "amount", operator: "greater_than", value: 10 }] }, null], {
            page: 2, limit: 50, search: " acme ", sort: { id: "stageId", desc: false },
        });
        const params = new URLSearchParams(url.split("?")[1]);
        expect(url.startsWith("/opportunities?")).toBe(true);
        expect(Object.fromEntries(params)).toMatchObject({ page: "2", limit: "50", strict: "1", q: "acme", sort: "stage", dir: "asc" });
        expect(JSON.parse(params.get("filters")!)).toHaveLength(1);
        expect(new URLSearchParams(serverListUrl("LEADS", [], { page: 1, limit: 1, sort: { id: "email", desc: true } }).split("?")[1]).get("sort")).toBeNull();
    });
});

describe("strict server filters", () => {
    const columns = new Map<string, FilterColumnEntry>([["name", { column: "name", kind: "text" }], ["createdAt", { column: "createdAt", kind: "date" }]]);

    it("refuses an unknown field or a condition it can't apply, naming it", () => {
        expect(() => assertFilterGroupsSupported([{ logic: "AND", conditions: [{ field: "name", operator: "contains", value: "a" }] }], columns)).not.toThrow();
        expect(() => assertFilterGroupsSupported([{ logic: "AND", conditions: [{ field: "nope", operator: "equals", value: "a" }] }], columns)).toThrow(UnsupportedFilterError);
        expect(() => assertFilterGroupsSupported([{ field: "createdAt", operator: "equals", value: "@someday" }], columns)).toThrow(UnsupportedFilterError);
        expect(() => assertFilterGroupsSupported([{ field: "name", operator: "sounds_like", value: "a" }], columns)).toThrow(/FILTER_UNSUPPORTED/);
    });

    it("'not equal or empty' keeps records with no value", () => {
        const clauses: string[] = [];
        const values: unknown[] = [];
        applyFilterCondition(clauses, values, "ownerId", "not_equals_or_empty", ["u1", "u2"], "user");
        expect(clauses[0]).toBe('("ownerId" is null or "ownerId"::text <> all($1::text[]))');
        expect(values).toEqual([["u1", "u2"]]);
    });

    it("resolves tomorrow, this week (Monday to Sunday) and the next 7 days", () => {
        const now = new Date("2026-10-07T10:00:00Z"); // a Wednesday
        expect(resolveRelativeDateRange("@tomorrow", "UTC", now)).toEqual({ start: "2026-10-08T00:00:00.000Z", end: "2026-10-09T00:00:00.000Z" });
        expect(resolveRelativeDateRange("@this_week", "UTC", now)).toEqual({ start: "2026-10-05T00:00:00.000Z", end: "2026-10-12T00:00:00.000Z" });
        expect(resolveRelativeDateRange("@next_7_days", "UTC", now)).toEqual({ start: "2026-10-07T00:00:00.000Z", end: "2026-10-15T00:00:00.000Z" });
        expect(resolveRelativeDateRange("@this_week", "UTC", new Date("2026-10-11T23:00:00Z"))?.start).toBe("2026-10-05T00:00:00.000Z"); // Sunday
    });
});

describe("filter text matching", () => {
    it("treats % and _ in contains, starts with and ends with as literal characters", () => {
        const run = (operator: string, value: string) => {
            const clauses: string[] = [];
            const values: unknown[] = [];
            applyFilterCondition(clauses, values, "name", operator, value, "text");
            return { sql: clauses[0], value: values[0] };
        };
        expect(run("contains", "50%")).toEqual({ sql: '"name" ilike $1', value: "%50\\%%" });
        expect(run("not_contains", "a_b")).toEqual({ sql: '"name" not ilike $1', value: "%a\\_b%" });
        expect(run("starts_with", "x\\y")).toEqual({ sql: '"name" ilike $1', value: "x\\\\y%" });
        expect(run("ends_with", "_")).toEqual({ sql: '"name" ilike $1', value: "%\\_" });
    });
});
