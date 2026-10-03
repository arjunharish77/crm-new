"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { MODULE_COVERAGE_NOTES, type PlatformModuleOption } from "@/lib/tenant-provisioning";
import { dependencyViolations, requiredModules } from "@/lib/module-dependencies";

interface CreateTenantDialogProps {
    onSuccess: () => void;
}

export function CreateTenantDialog({ onSuccess }: CreateTenantDialogProps) {
    const [open, setOpen] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [loading, setLoading] = useState(false);
    const [catalog, setCatalog] = useState<PlatformModuleOption[] | null>(null);
    const [catalogError, setCatalogError] = useState("");
    const [catalogAttempt, setCatalogAttempt] = useState(0);
    const [moduleSearch, setModuleSearch] = useState("");
    // Optional usage limits (Module 21); empty = unlimited, which is also the default.
    const [limits, setLimits] = useState({ maxActiveUsers: "", maxPartnerLogins: "", maxStorageMb: "", maxMonthlyMessages: "" });
    const [bundles, setBundles] = useState<{ key: string; name: string; description: string | null; modules: string[] }[]>([]);

    const [form, setForm] = useState({
        name: "",
        plan: "Pro",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        modules: {} as Record<string, boolean>,
        features: { apiAccessEnabled: false, salesGroupsEnabled: true },
    });

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setCatalog(null);setCatalogError("");
        apiFetch<PlatformModuleOption[]>("/platform-admin/modules",{signal:controller.signal}).then(rows=>{
            if(controller.signal.aborted)return;
            if(!rows.length)throw new Error("The module catalog is empty. Apply database migrations first.");
            setCatalog(rows);
            setForm(previous=>({...previous,modules:Object.fromEntries(rows.map(row=>[row.key,row.isCore || previous.modules[row.key] !== false]))}));
        }).catch(error=>{if(!controller.signal.aborted)setCatalogError(error.originalMessage || error.message || "Unable to load modules");});
        // Bundles are a convenience; if they fail to load the per-module switches still work.
        apiFetch<{ key: string; name: string; description: string | null; modules: string[] }[]>("/platform-admin/module-bundles",{signal:controller.signal})
            .then(rows=>{ if(!controller.signal.aborted) setBundles(Array.isArray(rows)?rows:[]); })
            .catch(()=>{ if(!controller.signal.aborted) setBundles([]); });
        return ()=>controller.abort();
    },[open,catalogAttempt]);

    // The bundle whose module set exactly matches the current switches, if any ("Custom" otherwise).
    const matchingBundle = catalog ? bundles.find(bundle=>catalog.every(module=>!!form.modules[module.key] === (module.isCore || bundle.modules.includes(module.key))))?.key ?? "" : "";
    const applyBundle = (key:string) => {
        const bundle = bundles.find(entry=>entry.key===key);
        if(!bundle || !catalog) return;
        setForm(previous=>({...previous,modules:Object.fromEntries(catalog.map(module=>[module.key,module.isCore || bundle.modules.includes(module.key)]))}));
    };

    // Same rule the server enforces on provisioning (src/lib/module-dependencies.ts); shown live
    // so an invalid combination is explained before submitting rather than after.
    const catalogNames = Object.fromEntries((catalog ?? []).map(module=>[module.key,module.name]));
    const catalogName = (key:string)=>catalogNames[key]??key;
    const dependencyProblems = catalog ? dependencyViolations(Object.fromEntries(catalog.map(module=>[module.key,!!form.modules[module.key]])),catalogName) : [];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading || !catalog?.length) return;
        setSubmitError("");
        setLoading(true);

        try {
            await apiFetch("/platform-admin/tenants", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    ...(Object.values(limits).some((value) => value.trim() !== "")
                        ? { limits: Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, value.trim() === "" ? null : Number(value)])) }
                        : {}),
                }),
            });
            toast.success("Tenant provisioned successfully");
            setOpen(false);
            setForm({
                name: "",
                plan: "Pro",
                adminName: "",
                adminEmail: "",
                adminPassword: "",
                modules: {},
                features: { apiAccessEnabled: false, salesGroupsEnabled: true },
            });
            setLimits({ maxActiveUsers: "", maxPartnerLogins: "", maxStorageMb: "", maxMonthlyMessages: "" });
            onSuccess();
        } catch (error: any) {
            setSubmitError(error.originalMessage || error.message || "Failed to provision tenant");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!loading) setOpen(next); }}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Tenant
                </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={!loading} className="p-4 sm:max-w-2xl sm:p-6">
                <DialogHeader>
                    <DialogTitle>Provision New Tenant</DialogTitle>
                    <DialogDescription>
                        Create a new tenant workspace and its first admin user.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="min-w-0">
                    <fieldset disabled={loading} className="min-w-0 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Tenant Name</Label>
                        <Input
                            id="name"
                            required
                            placeholder="Acme Corp"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="plan">Plan</Label>
                        <Select
                            disabled={loading}
                            value={form.plan}
                            onValueChange={(value) => setForm({ ...form, plan: value })}
                        >
                            <SelectTrigger id="plan">
                                <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Basic">Basic</SelectItem>
                                <SelectItem value="Pro">Pro</SelectItem>
                                <SelectItem value="Enterprise">Enterprise</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <section className="min-w-0 space-y-3" aria-label="Tenant access">
                        <h3 className="text-sm font-semibold">Module access</h3>
                        {catalog && bundles.length > 0 && (
                            <div className="space-y-1">
                                <Label htmlFor="tenant-bundle">Start from a bundle</Label>
                                <select id="tenant-bundle" className="h-10 w-full rounded-md border bg-background px-2 text-sm" disabled={loading} value={matchingBundle} onChange={event=>applyBundle(event.target.value)}>
                                    <option value="" disabled>Custom selection</option>
                                    {bundles.map(bundle=><option key={bundle.key} value={bundle.key}>{bundle.name} ({catalog.filter(module=>module.isCore || bundle.modules.includes(module.key)).length} modules)</option>)}
                                </select>
                                {bundles.find(bundle=>bundle.key===matchingBundle)?.description && <p className="text-xs text-muted-foreground">{bundles.find(bundle=>bundle.key===matchingBundle)?.description}</p>}
                                <p className="text-xs text-muted-foreground">A bundle only fills in the switches below; adjust any module before provisioning.</p>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Core modules remain enabled. Choose optional modules here; these choices and the admin account are saved together. The plan label does not choose modules automatically.</p>
                        {!catalog && !catalogError && <p role="status" className="text-sm">Loading module catalog…</p>}
                        {catalogError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{catalogError}</p><Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" type="button" variant="outline" onClick={()=>setCatalogAttempt(value=>value+1)}>Retry module catalog</Button></div>}
                        {catalog && <details className="min-w-0 rounded-md border p-2">
                            <summary className="cursor-pointer text-sm font-medium">{catalog.filter(module=>form.modules[module.key]).length} of {catalog.length} modules enabled — review selection</summary>
                            <Input aria-label="Find modules" placeholder="Find a module…" className="mt-3" value={moduleSearch} onChange={event=>setModuleSearch(event.target.value)}/>
                            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                                {catalog.filter(module=>`${module.name} ${module.category} ${module.description??''}`.toLowerCase().includes(moduleSearch.toLowerCase())).map(module=><div key={module.key} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-md border p-2">
                                    <div className="min-w-0 flex-1 basis-40 break-words"><Label htmlFor={`module-${module.key}`} className="block break-words text-sm">{module.name}</Label><p className="mt-1 text-xs text-muted-foreground">{module.isCore?'Core · always enabled':module.category}</p>{module.description && <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>}{requiredModules(module.key).length>0 && <p className="mt-1 text-xs text-muted-foreground">Requires {requiredModules(module.key).map(catalogName).join(' and ')}.</p>}{MODULE_COVERAGE_NOTES[module.key] && <p className="mt-2 text-xs font-medium">{MODULE_COVERAGE_NOTES[module.key]}</p>}</div>
                                    <Switch id={`module-${module.key}`} disabled={loading||module.isCore} checked={!!form.modules[module.key]} onCheckedChange={checked=>setForm(previous=>({...previous,modules:{...previous.modules,[module.key]:checked}}))}/>
                                </div>)}
                            </div>
                            {!catalog.some(module=>`${module.name} ${module.category} ${module.description??''}`.toLowerCase().includes(moduleSearch.toLowerCase())) && <p className="mt-3 text-sm text-muted-foreground">No modules match this search.</p>}
                        </details>}
                        {dependencyProblems.length>0 && <div role="alert" className="space-y-1 text-sm text-destructive">{dependencyProblems.map(problem=><p key={problem.moduleKey} className="break-words">{problem.message} Turn it off or enable what it requires.</p>)}</div>}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><Label htmlFor="tenant-api-access">API Access</Label><Switch id="tenant-api-access" disabled={loading} checked={form.features.apiAccessEnabled} onCheckedChange={checked=>setForm(previous=>({...previous,features:{...previous.features,apiAccessEnabled:checked}}))}/></div>
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><Label htmlFor="tenant-sales-groups">Sales Groups</Label><Switch id="tenant-sales-groups" disabled={loading} checked={form.features.salesGroupsEnabled} onCheckedChange={checked=>setForm(previous=>({...previous,features:{...previous.features,salesGroupsEnabled:checked}}))}/></div>
                        </div>
                        <details className="min-w-0 rounded-md border p-2">
                            <summary className="cursor-pointer text-sm font-medium">Usage limits (optional — unlimited unless set)</summary>
                            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                                {([["maxActiveUsers", "Active users"], ["maxPartnerLogins", "Partner logins"], ["maxStorageMb", "File storage (MB)"], ["maxMonthlyMessages", "Messages per month"]] as const).map(([key, label]) => (
                                    <div key={key} className="min-w-0 space-y-1">
                                        <Label htmlFor={`tenant-limit-${key}`}>{label}</Label>
                                        <Input id={`tenant-limit-${key}`} inputMode="numeric" placeholder="Unlimited" disabled={loading} value={limits[key]} onChange={event=>setLimits(previous=>({...previous,[key]:event.target.value.replace(/[^0-9]/g,"")}))}/>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </section>

                    <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium mb-3">Tenant Admin Account</h4>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="adminName">Admin Name</Label>
                                <Input
                                    id="adminName"
                                    required
                                    placeholder="John Doe"
                                    value={form.adminName}
                                    onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="adminEmail">Admin Email</Label>
                                <Input
                                    id="adminEmail"
                                    required
                                    type="email"
                                    placeholder="john@acme.com"
                                    value={form.adminEmail}
                                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="adminPassword">Password</Label>
                                <Input
                                    id="adminPassword"
                                    required
                                    autoComplete="new-password"
                                    type="password"
                                    placeholder="*******"
                                    value={form.adminPassword}
                                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {submitError && <p role="alert" className="break-words text-sm text-destructive">{submitError}</p>}
                    <DialogFooter>
                        <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" type="button" variant="outline" disabled={loading} onClick={() => setOpen(false)}>Cancel</Button>
                        <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" type="submit" disabled={loading || !catalog?.length || dependencyProblems.length > 0}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? "Provisioning…" : "Provision Tenant"}
                        </Button>
                    </DialogFooter>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
