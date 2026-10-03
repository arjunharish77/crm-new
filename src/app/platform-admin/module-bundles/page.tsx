"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { dependencyViolations, requiredModules } from "@/lib/module-dependencies";
import type { PlatformModuleOption } from "@/lib/tenant-provisioning";

type Bundle = { key: string; name: string; description: string | null; modules: string[]; sortOrder: number };
type Draft = Bundle & { isNew?: boolean };

// Platform-wide Create Tenant presets (Module 21). Editing a bundle never changes existing
// tenants; it only changes what the bundle pre-selects for tenants created afterwards.
export default function ModuleBundlesPage() {
    const [catalog, setCatalog] = useState<PlatformModuleOption[] | null>(null);
    const [bundles, setBundles] = useState<Bundle[] | null>(null);
    const [loadError, setLoadError] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const load = useCallback(async () => {
        setLoadError("");
        try {
            const [catalogRows, bundleRows] = await Promise.all([
                apiFetch<PlatformModuleOption[]>("/platform-admin/modules"),
                apiFetch<Bundle[]>("/platform-admin/module-bundles"),
            ]);
            setCatalog(catalogRows);
            setBundles(bundleRows);
        } catch (error: any) {
            setLoadError(error.originalMessage || error.message || "Unable to load module bundles");
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const names = Object.fromEntries((catalog ?? []).map((module) => [module.key, module.name]));
    const name = (key: string) => names[key] ?? key;
    const draftProblems = draft && catalog
        ? dependencyViolations(Object.fromEntries(catalog.map((module) => [module.key, module.isCore || draft.modules.includes(module.key)])), name)
        : [];

    const edit = (bundle: Bundle) => { setDraft({ ...bundle, modules: [...bundle.modules] }); setSaveError(""); };
    const create = () => {
        setDraft({ key: "", name: "", description: "", modules: (catalog ?? []).filter((module) => module.isCore).map((module) => module.key), sortOrder: (bundles?.length ?? 0) + 1, isNew: true });
        setSaveError("");
    };
    const toggle = (key: string, on: boolean) => setDraft((current) => current && ({ ...current, modules: on ? [...new Set([...current.modules, key])] : current.modules.filter((entry) => entry !== key) }));

    const save = async () => {
        if (!draft || !catalog) return;
        setSaving(true);
        setSaveError("");
        try {
            const modules = catalog.filter((module) => module.isCore || draft.modules.includes(module.key)).map((module) => module.key);
            await apiFetch(`/platform-admin/module-bundles/${encodeURIComponent(draft.key)}`, {
                method: "PUT",
                body: JSON.stringify({ name: draft.name, description: draft.description, modules, sortOrder: draft.sortOrder }),
            });
            toast.success(`${draft.name} saved`);
            setDraft(null);
            await load();
        } catch (error: any) {
            setSaveError(error.message || "Unable to save the bundle");
        } finally {
            setSaving(false);
        }
    };

    if (loadError) return <ErrorState title="Module bundles unavailable" description={loadError} onRetry={load} />;
    if (!catalog || !bundles) return <p role="status" className="p-4 text-sm">Loading module bundles…</p>;

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Module bundles" description="Presets offered when creating a tenant. Editing a bundle changes only tenants created afterwards." />
            {!draft && <Button variant="outline" onClick={create}>New bundle</Button>}
            {!draft && (
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    {bundles.map((bundle) => (
                        <section key={bundle.key} aria-label={bundle.name} className="min-w-0 space-y-2 rounded-xl border p-4">
                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 basis-40 break-words">
                                    <h2 className="font-semibold">{bundle.name}</h2>
                                    {bundle.description && <p className="text-sm text-muted-foreground">{bundle.description}</p>}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => edit(bundle)}>Edit {bundle.name}</Button>
                            </div>
                            <p className="break-words text-xs text-muted-foreground">{catalog.filter((module) => bundle.modules.includes(module.key)).length} modules: {catalog.filter((module) => bundle.modules.includes(module.key)).map((module) => module.name).join(", ")}</p>
                        </section>
                    ))}
                </div>
            )}
            {draft && (
                <form className="min-w-0 space-y-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <fieldset disabled={saving} className="min-w-0 space-y-4">
                        <legend className="font-semibold">{draft.isNew ? "New bundle" : `Edit ${draft.name}`}</legend>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            {draft.isNew && (
                                <div className="space-y-1">
                                    <Label htmlFor="bundle-key">Key</Label>
                                    <Input id="bundle-key" value={draft.key} maxLength={41} placeholder="E.G. PARTNER_NETWORK" onChange={(event) => setDraft({ ...draft, key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} required />
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label htmlFor="bundle-name">Name</Label>
                                <Input id="bundle-name" value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label htmlFor="bundle-description">Description</Label>
                                <Input id="bundle-description" value={draft.description ?? ""} maxLength={300} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                            </div>
                        </div>
                        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                            {catalog.map((module) => (
                                <div key={module.key} className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border p-2">
                                    <div className="min-w-0 flex-1 basis-40 break-words">
                                        <Label htmlFor={`bundle-module-${module.key}`} className="block break-words text-sm">{module.name}</Label>
                                        <p className="text-xs text-muted-foreground">{module.isCore ? "Core · always included" : module.category}</p>
                                        {requiredModules(module.key).length > 0 && <p className="text-xs text-muted-foreground">Requires {requiredModules(module.key).map(name).join(" and ")}.</p>}
                                    </div>
                                    <Switch id={`bundle-module-${module.key}`} disabled={module.isCore} checked={module.isCore || draft.modules.includes(module.key)} onCheckedChange={(checked) => toggle(module.key, checked)} />
                                </div>
                            ))}
                        </div>
                        {draftProblems.length > 0 && <div role="alert" className="space-y-1 text-sm text-destructive">{draftProblems.map((problem) => <p key={problem.moduleKey}>{problem.message}</p>)}</div>}
                        {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                            <Button type="submit" disabled={saving || draftProblems.length > 0 || !draft.name.trim() || (draft.isNew && !/^[A-Z][A-Z0-9_]{1,40}$/.test(draft.key))}>{saving ? "Saving…" : "Save bundle"}</Button>
                        </div>
                    </fieldset>
                </form>
            )}
        </div>
    );
}
