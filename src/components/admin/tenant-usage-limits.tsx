"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

type Metric = "ACTIVE_USERS" | "PARTNER_LOGINS" | "STORAGE" | "MONTHLY_MESSAGES";
type Limits = { maxActiveUsers: number | null; maxPartnerLogins: number | null; maxStorageMb: number | null; maxMonthlyMessages: number | null };
type Usage = { limits: Limits; period: string; used: Record<Metric, number> };

const ROWS: { metric: Metric; label: string; limitKey: keyof Limits; unit: string }[] = [
    { metric: "ACTIVE_USERS", label: "Active users", limitKey: "maxActiveUsers", unit: "users" },
    { metric: "PARTNER_LOGINS", label: "Partner logins", limitKey: "maxPartnerLogins", unit: "logins" },
    { metric: "STORAGE", label: "File storage", limitKey: "maxStorageMb", unit: "MB" },
    { metric: "MONTHLY_MESSAGES", label: "Messages this month", limitKey: "maxMonthlyMessages", unit: "messages" },
];

const shownUsed = (metric: Metric, used: number) => (metric === "STORAGE" ? Math.ceil(used / 1024 / 1024) : used);

// Refuse anything that is not a usage payload rather than rendering a raw TypeError to the user.
const asUsage = (data: unknown): Usage => {
    const value = data as Partial<Usage> | null;
    if (!value || typeof value !== "object" || !value.limits || typeof value.limits !== "object" || !value.used || typeof value.used !== "object") {
        throw new Error("Usage information is not available right now.");
    }
    const limitOf = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw) ? raw : null);
    return { period: String(value.period ?? ""), limits: Object.fromEntries(ROWS.map((row) => [row.limitKey, limitOf(value.limits?.[row.limitKey])])) as Limits, used: Object.fromEntries(ROWS.map((row) => [row.metric, Number(value.used?.[row.metric]) || 0])) as Record<Metric, number> };
};

/**
 * Usage against per-tenant limits (Module 21). `editable` (platform admins) shows the limit form;
 * tenant admins get the same numbers read-only. An empty limit means unlimited.
 */
export function TenantUsageLimits({ endpoint, editable }: { endpoint: string; editable: boolean }) {
    const [usage, setUsage] = useState<Usage | null>(null);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState<Record<keyof Limits, string>>({ maxActiveUsers: "", maxPartnerLogins: "", maxStorageMb: "", maxMonthlyMessages: "" });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const apply = (data: Usage) => {
        setUsage(data);
        setDraft(Object.fromEntries(ROWS.map((row) => [row.limitKey, data.limits[row.limitKey] === null ? "" : String(data.limits[row.limitKey])])) as Record<keyof Limits, string>);
    };
    const load = useCallback(async () => {
        setError("");
        try { apply(asUsage(await apiFetch<unknown>(endpoint))); } catch (e: any) { setError(e.originalMessage || e.message || "Unable to load usage"); }
    }, [endpoint]);
    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        setSaving(true);
        setSaveError("");
        try {
            const body = Object.fromEntries(ROWS.map((row) => [row.limitKey, draft[row.limitKey].trim() === "" ? null : Number(draft[row.limitKey])]));
            apply(asUsage(await apiFetch<unknown>(endpoint, { method: "PUT", body: JSON.stringify(body) })));
            toast.success("Limits saved");
        } catch (e: any) {
            setSaveError(e.message || "Unable to save limits");
        } finally {
            setSaving(false);
        }
    };

    if (error) return <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={load}>Retry</Button></div>;
    if (!usage) return <p role="status" className="text-sm">Loading usage…</p>;

    return (
        <div className="min-w-0 space-y-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {ROWS.map((row) => {
                    const limit = usage.limits[row.limitKey];
                    const used = shownUsed(row.metric, usage.used[row.metric]);
                    const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
                    return (
                        <div key={row.metric} className="min-w-0 rounded-xl border p-3">
                            <p className="text-sm font-medium">{row.label}</p>
                            <p className="break-words text-lg font-semibold">
                                {used.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {limit === null ? "Unlimited" : `${limit.toLocaleString()} ${row.unit}`}</span>
                            </p>
                            {percent !== null && (
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${row.label} used`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                                    <div className={percent >= 100 ? "h-full bg-destructive" : percent >= 80 ? "h-full bg-amber-500" : "h-full bg-primary"} style={{ width: `${percent}%` }} />
                                </div>
                            )}
                            {percent !== null && percent >= 100 && <p className="mt-1 text-xs text-destructive">Limit reached: new {row.metric === "MONTHLY_MESSAGES" ? "messages are not sent" : row.metric === "STORAGE" ? "uploads are refused" : "activations are refused"}.</p>}
                            {row.metric === "MONTHLY_MESSAGES" && <p className="mt-1 text-xs text-muted-foreground">Month {usage.period}. Password resets and other system messages never count.</p>}
                        </div>
                    );
                })}
            </div>
            {editable && (
                <form className="min-w-0 space-y-3 rounded-xl border p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <fieldset disabled={saving} className="min-w-0 space-y-3">
                        <legend className="text-sm font-medium">Limits (leave empty for unlimited)</legend>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            {ROWS.map((row) => (
                                <div key={row.limitKey} className="min-w-0 space-y-1">
                                    <Label htmlFor={`limit-${row.limitKey}`}>{row.label} ({row.unit})</Label>
                                    <Input id={`limit-${row.limitKey}`} inputMode="numeric" value={draft[row.limitKey]} placeholder="Unlimited" onChange={(event) => setDraft({ ...draft, [row.limitKey]: event.target.value.replace(/[^0-9]/g, "") })} />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">Tenant and platform admins are notified at 80% and 100%. At 100% only new usage is refused; lowering a limit never removes users, files or data.</p>
                        {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
                        <Button type="submit" className="h-auto min-h-9 max-w-full whitespace-normal break-words">{saving ? "Saving…" : "Save limits"}</Button>
                    </fieldset>
                </form>
            )}
        </div>
    );
}
