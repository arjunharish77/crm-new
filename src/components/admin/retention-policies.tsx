"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";

const FIELDS = [
    { key: "leadRetentionDays", label: "Closed leads", hint: "Lost, converted or disqualified (or deleted) leads not updated for this many days: name, email, phone and company are removed.", count: "leadsAnonymized", verb: "leads anonymized" },
    { key: "opportunityRetentionDays", label: "Closed opportunities", hint: "Opportunities in a closed stage (or deleted) not updated for this many days: the title is removed.", count: "opportunitiesAnonymized", verb: "opportunities anonymized" },
    { key: "activityRetentionDays", label: "Activity notes on closed records", hint: "Notes on activities not updated for this many days, when every linked lead/opportunity is closed.", count: "activitiesAnonymized", verb: "activity notes removed" },
    { key: "auditLogRetentionDays", label: "Audit logs", hint: "Audit entries older than this are deleted, except those on legal hold.", count: "auditLogsDeleted", verb: "audit entries deleted" },
    { key: "deletedRecordsRetentionDays", label: "Deleted custom fields", hint: "Custom fields deleted longer ago than this are removed permanently.", count: "fieldDefinitionsPurged", verb: "deleted fields purged" },
    { key: "marketplaceAppLogRetentionDays", label: "Logs of uninstalled apps", hint: "Delivery logs of marketplace apps uninstalled longer ago than this are deleted.", count: "marketplaceAppLogsPurged", verb: "app log entries deleted" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type CountKey = (typeof FIELDS)[number]["count"];
type Policy = { id: string; tenantId: string; tenantName: string; lastEnforcedAt: string | null } & Record<FieldKey, number | null>;
type Preview = { tenants: ({ tenantId: string; tenantName: string } & Record<CountKey, number>)[]; totals: Record<CountKey, number> };

const days = (value: number | null) => (value ? `${value.toLocaleString()} day${value === 1 ? "" : "s"}` : "Off");

// Platform admins (decisions confirmed 2026-10-01): nothing is anonymized or deleted unless a
// period is set; only closed records are anonymized; "Enforce now" shows what it will change
// and asks before doing it (the worker otherwise enforces each policy once a day).
export function RetentionPolicies() {
    const [policies, setPolicies] = useState<Policy[] | null>(null);
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [loadError, setLoadError] = useState("");
    const [editing, setEditing] = useState<{ tenantId: string; draft: Record<FieldKey, string> } | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [adding, setAdding] = useState("");
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewError, setPreviewError] = useState("");
    const [enforcing, setEnforcing] = useState(false);

    const load = useCallback(async () => {
        setLoadError("");
        try {
            const [rows, tenantRows] = await Promise.all([
                apiFetch<unknown>("/platform-admin/retention/policies"),
                apiFetch<unknown>("/platform-admin/tenants").catch(() => []),
            ]);
            if (!Array.isArray(rows)) throw new Error("Retention policies are not available right now.");
            setPolicies(rows as Policy[]);
            setTenants(Array.isArray(tenantRows) ? (tenantRows as { id: string; name: string }[]).map(({ id, name }) => ({ id, name })) : []);
        } catch (error: any) {
            setLoadError(error.originalMessage || error.message || "Unable to load retention policies");
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const startEdit = (policy: Policy) => {
        setSaveError("");
        setEditing({ tenantId: policy.tenantId, draft: Object.fromEntries(FIELDS.map((field) => [field.key, policy[field.key] ? String(policy[field.key]) : ""])) as Record<FieldKey, string> });
    };

    const save = async (tenantId: string, body: Partial<Record<FieldKey, number | null>>) => {
        setSaving(true);
        setSaveError("");
        try {
            await apiFetch(`/platform-admin/retention/policy/${tenantId}`, { method: "PATCH", body: JSON.stringify(body) });
            toast.success("Retention policy saved");
            setEditing(null);
            await load();
            return true;
        } catch (error: any) {
            setSaveError(error.message || "Unable to save the policy");
            return false;
        } finally {
            setSaving(false);
        }
    };

    const addTenant = async () => {
        if (!adding) return;
        // Creates the tenant's policy with lead/opportunity/activity anonymization off.
        if (await save(adding, {})) setAdding("");
    };

    const openPreview = async () => {
        setPreviewOpen(true);
        setPreview(null);
        setPreviewError("");
        try {
            const data = await apiFetch<Preview>("/platform-admin/retention/enforce");
            if (!data || !Array.isArray(data.tenants) || !data.totals) throw new Error("Preview is not available right now.");
            setPreview(data);
        } catch (error: any) {
            setPreviewError(error.message || "Unable to preview enforcement");
        }
    };

    const enforce = async () => {
        setEnforcing(true);
        try {
            const result = await apiFetch<Record<CountKey, number> & { tenantsProcessed: number; tenantsFailed: number }>("/platform-admin/retention/enforce", { method: "POST" });
            const changed = FIELDS.filter((field) => result[field.count]).map((field) => `${result[field.count].toLocaleString()} ${field.verb}`);
            toast.success(`Enforced for ${result.tenantsProcessed} tenant${result.tenantsProcessed === 1 ? "" : "s"}${changed.length ? `: ${changed.join(", ")}` : "; nothing to change"}${result.tenantsFailed ? ` (${result.tenantsFailed} failed — see server logs)` : ""}`);
            setPreviewOpen(false);
            await load();
        } catch (error: any) {
            setPreviewError(error.message || "Enforcement failed");
        } finally {
            setEnforcing(false);
        }
    };

    if (loadError) return <ErrorState title="Retention unavailable" description={loadError} onRetry={load} />;
    if (!policies) return <p role="status" className="p-4 text-sm">Loading retention policies…</p>;

    const withoutPolicy = tenants.filter((tenant) => !policies.some((policy) => policy.tenantId === tenant.id));
    const previewHasChanges = !!preview && FIELDS.some((field) => preview.totals[field.count] > 0);

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader
                title="Data retention"
                description="Nothing is anonymized or deleted unless a period is set for that tenant. Only closed records are anonymized; open leads and opportunities are never touched, however old. Policies are enforced once a day."
                actions={policies.length > 0 ? <Button className="h-auto min-h-9 max-w-full whitespace-normal" onClick={openPreview}>Enforce now…</Button> : undefined}
            />

            {withoutPolicy.length > 0 && (
                <section aria-label="Add a tenant policy" className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1 basis-56 space-y-1">
                        <Label htmlFor="retention-add-tenant">Add a policy for</Label>
                        <Select value={adding} onValueChange={setAdding}>
                            <SelectTrigger id="retention-add-tenant" className="w-full min-w-0 whitespace-normal text-left data-[size=default]:h-auto min-h-9 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:[overflow-wrap:anywhere]"><SelectValue placeholder="Choose a tenant" /></SelectTrigger>
                            <SelectContent>{withoutPolicy.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <Button variant="outline" disabled={!adding || saving} onClick={addTenant}>Add policy</Button>
                    <p className="w-full text-xs text-muted-foreground">A new policy starts with lead, opportunity and activity anonymization off, audit logs kept 90 days, deleted custom fields 30 days and uninstalled-app logs 90 days. Edit it to change any of these.</p>
                </section>
            )}
            {saveError && !editing && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}

            {policies.length === 0 ? (
                <p className="rounded-xl border p-4 text-sm text-muted-foreground">No tenant has a retention policy, so all data is kept.</p>
            ) : (
                <ul aria-label="Retention policies" className="min-w-0 space-y-3">
                    {policies.map((policy) => (
                        <li key={policy.id} className="min-w-0 rounded-xl border p-4">
                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h2 className="break-words font-semibold">{policy.tenantName}</h2>
                                    <p className="text-xs text-muted-foreground">{policy.lastEnforcedAt ? `Last enforced ${formatWorkspaceDateTime(policy.lastEnforcedAt)}` : "Not enforced yet"}</p>
                                </div>
                                {editing?.tenantId !== policy.tenantId && <Button size="sm" variant="outline" onClick={() => startEdit(policy)}>Edit</Button>}
                            </div>
                            {editing?.tenantId === policy.tenantId ? (
                                <form
                                    className="mt-3 min-w-0 space-y-3"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void save(policy.tenantId, Object.fromEntries(FIELDS.map((field) => [field.key, editing.draft[field.key].trim() ? Number(editing.draft[field.key]) : null])));
                                    }}
                                >
                                    <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
                                        <legend className="sr-only">Retention periods for {policy.tenantName}</legend>
                                        {FIELDS.map((field) => (
                                            <div key={field.key} className="min-w-0 space-y-1">
                                                <Label htmlFor={`${policy.id}-${field.key}`}>{field.label} (days)</Label>
                                                <Input id={`${policy.id}-${field.key}`} inputMode="numeric" placeholder="Off" value={editing.draft[field.key]}
                                                    onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, [field.key]: event.target.value.replace(/[^0-9]/g, "") } })} />
                                                <p className="text-xs text-muted-foreground">{field.hint} Empty = off.</p>
                                            </div>
                                        ))}
                                    </fieldset>
                                    {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                                        <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
                                    </div>
                                </form>
                            ) : (
                                <dl className="mt-3 grid min-w-0 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                                    {FIELDS.map((field) => (
                                        <div key={field.key} className="min-w-0">
                                            <dt className="text-xs text-muted-foreground">{field.label}</dt>
                                            <dd className="font-medium">{days(policy[field.key])}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <StandardDialog
                open={previewOpen}
                onClose={() => { if (!enforcing) setPreviewOpen(false); }}
                title="Enforce retention now?"
                maxWidth="md"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={enforcing}>Cancel</Button>
                        <Button variant={previewHasChanges ? "destructive" : "default"} className="h-auto min-h-9 max-w-full whitespace-normal break-words" onClick={enforce} disabled={!preview || enforcing}>
                            {enforcing ? "Enforcing…" : previewHasChanges ? "Anonymize and delete now" : "Run now"}
                        </Button>
                    </>
                }
            >
                <div className="min-w-0 space-y-3 text-sm">
                    {previewError && <p role="alert" className="break-words text-destructive">{previewError}</p>}
                    {!preview && !previewError && <p role="status">Counting what would change…</p>}
                    {preview && (
                        <>
                            <p>{previewHasChanges ? "This cannot be undone. It will change:" : "Nothing is due right now; running it only records the check."}</p>
                            {previewHasChanges && (
                                <ul className="list-disc space-y-1 pl-5">
                                    {FIELDS.filter((field) => preview.totals[field.count] > 0).map((field) => <li key={field.key}>{preview.totals[field.count].toLocaleString()} {field.verb}</li>)}
                                </ul>
                            )}
                            {previewHasChanges && (
                                <details>
                                    <summary className="cursor-pointer">By tenant</summary>
                                    <ul className="mt-2 space-y-1">
                                        {preview.tenants.filter((tenant) => FIELDS.some((field) => tenant[field.count] > 0)).map((tenant) => (
                                            <li key={tenant.tenantId} className="break-words">
                                                <span className="font-medium">{tenant.tenantName}:</span> {FIELDS.filter((field) => tenant[field.count] > 0).map((field) => `${tenant[field.count].toLocaleString()} ${field.verb}`).join(", ")}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </StandardDialog>
        </div>
    );
}
