"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateInput, workspaceDayStart } from "@/lib/date-format";
import { storageGet, storageSet, userScopedKey } from "@/lib/storage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Round-2 plan wave 3, C9 (decisions 2026-10-26): one filter bar for the standard reports -- a date
// range, an owner and a team. It opens on "Everyone I can see, last 30 days", remembers each
// person's last choice per report, and keeps it in the address so a shared link opens the same
// view. The server still applies each person's record access underneath (report-scope.ts).

export type ReportFilterSupport = { dates: boolean; owner: boolean };

// Which reports take which filters. Anomaly detection and the forecast use fixed recent windows,
// so they take owner/team only; automation, form and split-test reports aren't owned by anyone.
export const REPORT_FILTER_SUPPORT: Record<string, ReportFilterSupport> = {
    funnel_conversion_by_stage: { dates: true, owner: true },
    funnel_conversion_by_source_campaign: { dates: true, owner: true },
    rep_performance: { dates: true, owner: true },
    sla_response_breaches: { dates: true, owner: true },
    lead_source_roi: { dates: true, owner: true },
    reassignment_impact: { dates: true, owner: true },
    activity_call_volume_trends: { dates: true, owner: true },
    case_analytics: { dates: true, owner: true },
    telephony_call_performance: { dates: true, owner: true },
    voice_bot_performance: { dates: true, owner: false },
    next_best_action_performance: { dates: true, owner: true },
    funnel_explorer: { dates: true, owner: true },
    cohort_funnel_progression: { dates: true, owner: true },
    executive_scorecard: { dates: true, owner: true },
    data_quality: { dates: true, owner: true },
    task_sla_performance: { dates: true, owner: true },
    anomaly_detection: { dates: false, owner: true },
    forecast: { dates: false, owner: true },
    automation_performance: { dates: true, owner: false },
    form_drop_off: { dates: true, owner: false },
    split_test_performance: { dates: true, owner: false },
};

const RANGES = [
    ["LAST_7_DAYS", "Last 7 days"],
    ["LAST_30_DAYS", "Last 30 days"],
    ["LAST_90_DAYS", "Last 90 days"],
    ["THIS_MONTH", "This month"],
    ["LAST_MONTH", "Last month"],
    ["THIS_YEAR", "This year"],
    ["ALL_TIME", "All time"],
    ["CUSTOM", "Custom dates"],
] as const;
type RangeKey = (typeof RANGES)[number][0];

export type ReportFilterState = { range: RangeKey; from: string; to: string; owner: string; team: string };
export const DEFAULT_REPORT_FILTERS: ReportFilterState = { range: "LAST_30_DAYS", from: "", to: "", owner: "", team: "" };

const URL_KEYS = ["range", "from", "to", "owner", "team"] as const;
const storageKey = (reportKey: string) => userScopedKey(`report-filters:${reportKey}`);

function isRange(value: unknown): value is RangeKey {
    return RANGES.some(([key]) => key === value);
}

// The dates a range stands for, as YYYY-MM-DD in the workspace's time zone (inclusive).
export function reportFilterDates(state: ReportFilterState): { from: string; to: string } {
    const today = formatWorkspaceDateInput(new Date());
    const daysAgo = (days: number) => formatWorkspaceDateInput(workspaceDayStart({ days: -days }));
    switch (state.range) {
        case "LAST_7_DAYS": return { from: daysAgo(6), to: today };
        case "LAST_30_DAYS": return { from: daysAgo(29), to: today };
        case "LAST_90_DAYS": return { from: daysAgo(89), to: today };
        case "THIS_MONTH": return { from: formatWorkspaceDateInput(workspaceDayStart({ months: 0 })), to: today };
        case "LAST_MONTH": return {
            from: formatWorkspaceDateInput(workspaceDayStart({ months: -1 })),
            to: formatWorkspaceDateInput(new Date(workspaceDayStart({ months: 0 }).getTime() - 1)),
        };
        case "THIS_YEAR": return { from: `${today.slice(0, 4)}-01-01`, to: today };
        case "CUSTOM": return { from: state.from, to: state.to };
        default: return { from: "", to: "" };
    }
}

// The query parameters the report endpoints read (from, to, owner, team), for what this report supports.
export function reportFilterParams(state: ReportFilterState, support: ReportFilterSupport | undefined) {
    const params: Record<string, string> = {};
    if (!support) return params;
    if (support.dates) {
        const { from, to } = reportFilterDates(state);
        if (from) params.from = from;
        if (to) params.to = to;
    }
    if (support.owner) {
        if (state.owner) params.owner = state.owner;
        if (state.team) params.team = state.team;
    }
    return params;
}

function readUrlState(): ReportFilterState | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (!URL_KEYS.some((key) => params.has(key))) return null;
    const range = params.get("range");
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    return {
        range: isRange(range) ? range : from || to ? "CUSTOM" : "ALL_TIME",
        from,
        to,
        owner: params.get("owner") ?? "",
        team: params.get("team") ?? "",
    };
}

function readStoredState(reportKey: string): ReportFilterState | null {
    try {
        const parsed = JSON.parse(storageGet(storageKey(reportKey)) ?? "null");
        if (!parsed || !isRange(parsed.range)) return null;
        return { ...DEFAULT_REPORT_FILTERS, ...parsed };
    } catch {
        return null;
    }
}

// What a report opens with when it isn't the one on screen (its remembered choice, or the default).
export function storedReportFilters(reportKey: string): ReportFilterState {
    return readStoredState(reportKey) ?? DEFAULT_REPORT_FILTERS;
}

// The filter state for one report: from the link if it carries filters, else what this person
// chose last time for this report, else the default. Changes are remembered and put in the link.
export function useReportFilters(reportKey: string) {
    const [state, setState] = useState<ReportFilterState>(() => readUrlState() ?? readStoredState(reportKey) ?? DEFAULT_REPORT_FILTERS);
    const [loadedKey, setLoadedKey] = useState(reportKey);
    if (loadedKey !== reportKey) {
        setLoadedKey(reportKey);
        setState(readStoredState(reportKey) ?? DEFAULT_REPORT_FILTERS);
    }
    useEffect(() => {
        storageSet(storageKey(reportKey), JSON.stringify(state));
        const url = new URL(window.location.href);
        for (const key of URL_KEYS) url.searchParams.delete(key);
        if (REPORT_FILTER_SUPPORT[reportKey]) {
            url.searchParams.set("range", state.range);
            const { from, to } = reportFilterDates(state);
            if (state.range === "CUSTOM") {
                if (from) url.searchParams.set("from", from);
                if (to) url.searchParams.set("to", to);
            }
            if (state.owner) url.searchParams.set("owner", state.owner);
            if (state.team) url.searchParams.set("team", state.team);
        }
        window.history.replaceState(window.history.state, "", url);
    }, [reportKey, state]);
    return [state, setState] as const;
}

type Option = { id: string; name: string };
const listOf = (response: any): any[] => (Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []);

export function ReportFilterBar({ support, value, onChange }: { support: ReportFilterSupport; value: ReportFilterState; onChange: (next: ReportFilterState) => void }) {
    const [users, setUsers] = useState<Option[]>([]);
    const [teams, setTeams] = useState<Option[]>([]);
    useEffect(() => {
        if (!support.owner) return;
        // A person without access to the user or team list still gets "Everyone I can see" and "My records".
        apiFetch("/users").then((response) => setUsers(listOf(response).map((user) => ({ id: String(user.id), name: String(user.name || user.email || user.id) })))).catch(() => setUsers([]));
        apiFetch("/teams").then((response) => setTeams(listOf(response).map((team) => ({ id: String(team.id), name: String(team.name || team.id) })))).catch(() => setTeams([]));
    }, [support.owner]);

    const set = (patch: Partial<ReportFilterState>) => onChange({ ...value, ...patch });
    const dates = reportFilterDates(value);
    return (
        <div className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border bg-muted/30 px-3 py-2" role="group" aria-label="Report filters">
            {support.dates ? (
                <div className="grid gap-1">
                    <Label htmlFor="report-filter-range" className="text-xs text-muted-foreground">Dates</Label>
                    <Select
                        value={value.range}
                        onValueChange={(range) => set(range === "CUSTOM" ? { range: range as RangeKey, from: dates.from, to: dates.to } : { range: range as RangeKey })}
                    >
                        <SelectTrigger id="report-filter-range" className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{RANGES.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            ) : null}
            {support.dates && value.range === "CUSTOM" ? (
                <>
                    <div className="grid gap-1">
                        <Label htmlFor="report-filter-from" className="text-xs text-muted-foreground">From</Label>
                        <Input id="report-filter-from" type="date" className="h-8 w-[150px]" value={value.from} max={value.to || undefined} onChange={(event) => set({ from: event.target.value })} />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="report-filter-to" className="text-xs text-muted-foreground">To</Label>
                        <Input id="report-filter-to" type="date" className="h-8 w-[150px]" value={value.to} min={value.from || undefined} onChange={(event) => set({ to: event.target.value })} />
                    </div>
                </>
            ) : null}
            {support.owner ? (
                <>
                    <div className="grid gap-1">
                        <Label htmlFor="report-filter-owner" className="text-xs text-muted-foreground">Owner</Label>
                        <Select value={value.owner || "__all"} onValueChange={(owner) => set({ owner: owner === "__all" ? "" : owner })}>
                            <SelectTrigger id="report-filter-owner" className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all">Everyone I can see</SelectItem>
                                <SelectItem value="me">My records</SelectItem>
                                {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    {teams.length ? (
                        <div className="grid gap-1">
                            <Label htmlFor="report-filter-team" className="text-xs text-muted-foreground">Team</Label>
                            <Select value={value.team || "__all"} onValueChange={(team) => set({ team: team === "__all" ? "" : team })}>
                                <SelectTrigger id="report-filter-team" className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all">All teams</SelectItem>
                                    {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
                </>
            ) : null}
            {support.dates && dates.from ? (
                <p className="pb-1.5 text-xs text-muted-foreground" aria-live="polite">
                    {dates.from} to {dates.to || "today"}
                </p>
            ) : null}
        </div>
    );
}
