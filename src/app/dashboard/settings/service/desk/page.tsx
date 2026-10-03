"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSections } from "@/components/layout/settings-sections";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { formatCount } from "@/lib/display/format";

const NO_CATEGORY = "__none__";

function SettingsRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2 break-words text-sm">{children}</div>
            <Button variant="ghost" size="icon-sm" aria-label="Delete item" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" />
            </Button>
        </div>
    );
}

function TypesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [types, setTypes] = useState<any[]>([]);
    const [name, setName] = useState("");

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-types").then((data) => setTypes(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load case types."));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!name.trim()) return;
        try {
            await apiFetch("/case-types", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
            setName("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create case type");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-types/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete case type");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            {types.map((type) => (
                <SettingsRow key={type.id} onDelete={() => remove(type.id)}>
                    <span className="font-semibold">{type.name}</span>
                    {type.description && <span className="text-muted-foreground">{type.description}</span>}
                </SettingsRow>
            ))}
            <div className="flex flex-wrap gap-2">
                <Input aria-label="New case type name" placeholder="New case type name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

const STATUS_CATEGORIES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];

function StatusesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [statuses, setStatuses] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [category, setCategory] = useState("OPEN");

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-statuses").then((data) => setStatuses(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load case statuses."));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!name.trim()) return;
        try {
            await apiFetch("/case-statuses", { method: "POST", body: JSON.stringify({ name: name.trim(), category, isClosedStatus: category === "RESOLVED" || category === "CLOSED" }) });
            setName("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create case status");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-statuses/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete case status");
        }
    };

    const setDefault = async (id: string) => {
        try {
            await apiFetch(`/case-statuses/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to set default status");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            {statuses.map((status) => (
                <SettingsRow key={status.id} onDelete={() => remove(status.id)}>
                    <span className="font-semibold">{status.name}</span>
                    <Badge variant="outline">{status.category}</Badge>
                    {status.isClosedStatus && <Badge variant="outline">Closed</Badge>}
                    {status.isDefault ? (
                        <Badge>Default</Badge>
                    ) : (
                        <button className="text-xs text-primary hover:underline" onClick={() => setDefault(status.id)}>Make default</button>
                    )}
                </SettingsRow>
            ))}
            <div className="flex flex-wrap gap-2">
                <Input aria-label="New status name" placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {STATUS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

function PrioritiesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [priorities, setPriorities] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [level, setLevel] = useState("1");

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-priorities").then((data) => setPriorities(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load case priorities."));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!name.trim()) return;
        try {
            await apiFetch("/case-priorities", { method: "POST", body: JSON.stringify({ name: name.trim(), level: Number(level) || 1 }) });
            setName("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create case priority");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-priorities/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete case priority");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            {priorities.map((priority) => (
                <SettingsRow key={priority.id} onDelete={() => remove(priority.id)}>
                    <span className="font-semibold">{priority.name}</span>
                    <span className="text-xs text-muted-foreground">Level {priority.level}</span>
                    {priority.isDefault && <Badge>Default</Badge>}
                </SettingsRow>
            ))}
            <div className="flex flex-wrap gap-2">
                <Input aria-label="New priority name" placeholder="New priority name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
                <Input type="number" min={1} placeholder="Level" value={level} onChange={(e) => setLevel(e.target.value)} className="w-[100px]" />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

function QueuesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [queues, setQueues] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [name, setName] = useState("");

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-queues").then((data) => setQueues(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load case queues."));
        apiFetch<any[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!name.trim()) return;
        try {
            await apiFetch("/case-queues", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
            setName("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create case queue");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-queues/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete case queue");
        }
    };

    const toggleMember = async (queue: any, userId: string, checked: boolean) => {
        const memberUserIds: string[] = checked
            ? [...(queue.memberUserIds ?? []), userId]
            : (queue.memberUserIds ?? []).filter((id: string) => id !== userId);
        try {
            await apiFetch(`/case-queues/${queue.id}/members`, { method: "PUT", body: JSON.stringify({ userIds: memberUserIds }) });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update queue members");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="min-w-0 space-y-4">
            {queues.map((queue) => (
                <Card key={queue.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between">
                        <span className="font-semibold">{queue.name}{queue.isDefault && <Badge className="ml-2">Default</Badge>}</span>
                        <Button variant="ghost" size="icon-sm" aria-label="Delete item" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(queue.id)}>
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">Members (round-robin assigns among these)</p>
                    <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                        {users.map((user) => (
                            <label key={user.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <Checkbox
                                    checked={(queue.memberUserIds ?? []).includes(user.id)}
                                    onCheckedChange={(checked) => toggleMember(queue, user.id, !!checked)}
                                />
                                {user.name || user.email}
                            </label>
                        ))}
                    </div>
                </Card>
            ))}
            <div className="flex flex-wrap gap-2">
                <Input aria-label="New queue name" placeholder="New queue name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
                <Button onClick={add}><Plus className="size-4" />Add Queue</Button>
            </div>
        </div>
    );
}

function SlaPoliciesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [policies, setPolicies] = useState<any[]>([]);
    const [types, setTypes] = useState<any[]>([]);
    const [priorities, setPriorities] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [typeId, setTypeId] = useState("");
    const [priorityId, setPriorityId] = useState("");
    const [firstResponseMinutes, setFirstResponseMinutes] = useState("60");
    const [resolutionMinutes, setResolutionMinutes] = useState("1440");

    const NONE = "__none__";

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-sla-policies").then((data) => setPolicies(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load SLA policies."));
        apiFetch<any[]>("/case-types").then((data) => setTypes(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>("/case-priorities").then((data) => setPriorities(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, []);
    useEffect(() => { load(); }, [load]);

    const typeById = new Map(types.map((t) => [t.id, t]));
    const priorityById = new Map(priorities.map((p) => [p.id, p]));

    const add = async () => {
        if (!name.trim()) return;
        try {
            await apiFetch("/case-sla-policies", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    caseTypeId: typeId === NONE || !typeId ? null : typeId,
                    casePriorityId: priorityId === NONE || !priorityId ? null : priorityId,
                    firstResponseMinutes: Number(firstResponseMinutes) || 60,
                    resolutionMinutes: Number(resolutionMinutes) || 1440,
                }),
            });
            setName("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create SLA policy");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-sla-policies/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete SLA policy");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                The most specific active policy wins: one scoped to both a type and priority beats one scoped to just one, which beats a tenant-wide default (no type/priority set). Business-hours-aware SLA timing is not yet supported -- due dates are a flat minute offset from case creation.
            </p>
            {policies.map((policy) => (
                <SettingsRow key={policy.id} onDelete={() => remove(policy.id)}>
                    <span className="font-semibold">{policy.name}</span>
                    <span className="text-xs text-muted-foreground">
                        {policy.caseTypeId ? typeById.get(policy.caseTypeId)?.name ?? "Unknown type" : "Any type"} · {policy.casePriorityId ? priorityById.get(policy.casePriorityId)?.name ?? "Unknown priority" : "Any priority"}
                    </span>
                    <Badge variant="outline">First response {policy.firstResponseMinutes}m</Badge>
                    <Badge variant="outline">Resolution {policy.resolutionMinutes}m</Badge>
                </SettingsRow>
            ))}
            <div className="grid gap-2 md:grid-cols-2">
                <Input aria-label="Policy name" placeholder="Policy name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={typeId || NONE} onValueChange={setTypeId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Any type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Any type</SelectItem>
                            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={priorityId || NONE} onValueChange={setPriorityId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Any priority" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Any priority</SelectItem>
                            {priorities.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">First response (minutes)</Label>
                    <Input type="number" min={1} value={firstResponseMinutes} onChange={(e) => setFirstResponseMinutes(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Resolution (minutes)</Label>
                    <Input type="number" min={1} value={resolutionMinutes} onChange={(e) => setResolutionMinutes(e.target.value)} />
                </div>
            </div>
            <Button onClick={add}><Plus className="size-4" />Add SLA Policy</Button>
        </div>
    );
}

function MacrosTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [macros, setMacros] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [channel, setChannel] = useState("__none__");
    const [bodyTemplate, setBodyTemplate] = useState("");
    const [requiresApproval, setRequiresApproval] = useState(false);

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-macros").then((data) => setMacros(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load macros."));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!name.trim() || !bodyTemplate.trim()) return;
        try {
            await apiFetch("/case-macros", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(), bodyTemplate,
                    channel: channel === "__none__" ? null : channel,
                    isInternalNote: channel === "__none__",
                    requiresApprovalForExternalReply: requiresApproval,
                }),
            });
            setName(""); setBodyTemplate(""); setChannel("__none__"); setRequiresApproval(false);
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create macro");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-macros/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete macro");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                A macro with no channel posts an internal note only. A macro with a channel also sends the reply to the requester over that channel --
                {" "}variable tokens like <code>{"{{caseNumber}}"}</code>, <code>{"{{subject}}"}</code>, and <code>{"{{requesterName}}"}</code> are available.
            </p>
            {macros.map((macro) => (
                <SettingsRow key={macro.id} onDelete={() => remove(macro.id)}>
                    <span className="font-semibold">{macro.name}</span>
                    <Badge variant="outline">{macro.channel ?? "Internal note"}</Badge>
                    {macro.requiresApprovalForExternalReply && <Badge variant="outline">Approval required</Badge>}
                </SettingsRow>
            ))}
            <div className="grid gap-2 md:grid-cols-2">
                <Input aria-label="Macro name" placeholder="Macro name" value={name} onChange={(e) => setName(e.target.value)} />
                <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">Internal note only</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <textarea
                className="w-full rounded-md border p-2 text-sm"
                rows={3}
                placeholder="Template body"
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
            />
            {channel !== "__none__" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                    <Checkbox checked={requiresApproval} onCheckedChange={(checked) => setRequiresApproval(!!checked)} />
                    Require a second admin&apos;s approval before this reply is actually sent
                </label>
            )}
            <Button onClick={add}><Plus className="size-4" />Add Macro</Button>
        </div>
    );
}

type KbCategory = { id: string; name: string; description: string | null; isActive: boolean };

// Knowledge-base categories (GET/POST /knowledge-base/categories, PATCH/DELETE .../:id).
// Deleting a category leaves its articles in place, uncategorized (the column is "on delete set null").
function KnowledgeBaseCategories({ categories, articleCounts, loadError, onRetry, onChanged }: {
    categories: KbCategory[];
    articleCounts: Map<string, number>;
    loadError: string | null;
    onRetry: () => void;
    onChanged: () => void;
}) {
    const confirm = useConfirm();
    const askText = useAskText();
    const [name, setName] = useState("");
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const nameTaken = (value: string, exceptId?: string) =>
        categories.some((category) => category.id !== exceptId && category.name.trim().toLowerCase() === value.trim().toLowerCase());

    const add = async () => {
        const trimmed = name.trim();
        if (!trimmed) { setNameError("Enter a category name."); return; }
        if (nameTaken(trimmed)) { setNameError(`There's already a category called ${trimmed}.`); return; }
        setSaving(true);
        try {
            await apiFetch("/knowledge-base/categories", { method: "POST", body: JSON.stringify({ name: trimmed }) });
            setName("");
            setNameError(null);
            onChanged();
        } catch (error: any) {
            setNameError(error?.message || "The category couldn't be created.");
        } finally {
            setSaving(false);
        }
    };

    const rename = async (category: KbCategory) => {
        const next = await askText({ title: `Rename ${category.name}`, label: "Category name", confirmLabel: "Rename", defaultValue: category.name, required: true, singleLine: true });
        const trimmed = next?.trim();
        if (!trimmed || trimmed === category.name) return;
        if (nameTaken(trimmed, category.id)) { toast.error(`There's already a category called ${trimmed}`); return; }
        try {
            await apiFetch(`/knowledge-base/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name: trimmed }) });
            toast.success("Category renamed");
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "The category couldn't be renamed");
        }
    };

    const remove = async (category: KbCategory) => {
        const count = articleCounts.get(category.id) ?? 0;
        const ok = await confirm({
            title: `Delete the ${category.name} category?`,
            description: count ? `Its ${count} article version${count === 1 ? "" : "s"} stay in the knowledge base without a category.` : undefined,
            confirmLabel: "Delete category",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/knowledge-base/categories/${category.id}`, { method: "DELETE" });
            toast.success("Category deleted");
            onChanged();
        } catch (error: any) {
            toast.error(error?.message || "The category couldn't be deleted");
        }
    };

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold">Categories</h3>
            {loadError ? (
                <ErrorState variant="inline" title="Categories couldn't be loaded" description={loadError} onRetry={onRetry} />
            ) : (
                <>
                    {categories.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No categories yet. Articles can still be saved without one.</p>
                    ) : (
                        categories.map((category) => (
                            <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                                <span className="min-w-0 flex-1 break-words">
                                    <span className="font-semibold">{category.name}</span>{" "}
                                    <span className="text-xs text-muted-foreground">{formatCount(articleCounts.get(category.id) ?? 0)} article versions</span>
                                </span>
                                <div className="flex flex-wrap items-center gap-1">
                                    <Button variant="ghost" size="icon-sm" aria-label={`Rename ${category.name}`} onClick={() => rename(category)}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`} className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(category)}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                    <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1 basis-56 space-y-1">
                            <Input
                                aria-label="New category name"
                                placeholder="New category name"
                                value={name}
                                aria-invalid={nameError ? true : undefined}
                                aria-describedby={nameError ? "kb-category-name-error" : undefined}
                                onChange={(e) => { setName(e.target.value); setNameError(null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                            />
                            {nameError ? <p id="kb-category-name-error" className="text-xs text-destructive">{nameError}</p> : null}
                        </div>
                        <Button onClick={add} isLoading={saving} disabled={saving}><Plus className="size-4" />Add category</Button>
                    </div>
                </>
            )}
        </div>
    );
}

function KnowledgeBaseTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [articles, setArticles] = useState<any[]>([]);
    const [categories, setCategories] = useState<KbCategory[]>([]);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [categoryId, setCategoryId] = useState(NO_CATEGORY);

    const loadArticles = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/knowledge-base/articles").then((data) => setArticles(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load articles."));
    }, []);
    const loadCategories = useCallback(() => {
        setCategoryError(null);
        apiFetch<KbCategory[]>("/knowledge-base/categories").then((data) => setCategories(Array.isArray(data) ? data : [])).catch((error: any) => setCategoryError(error?.message || "Failed to load categories."));
    }, []);
    const load = useCallback(() => { loadArticles(); loadCategories(); }, [loadArticles, loadCategories]);
    useEffect(() => { load(); }, [load]);

    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const articleCounts = new Map<string, number>();
    for (const article of articles) {
        if (article.categoryId) articleCounts.set(article.categoryId, (articleCounts.get(article.categoryId) ?? 0) + 1);
    }

    const add = async () => {
        if (!title.trim() || !body.trim()) return;
        try {
            await apiFetch("/knowledge-base/articles", {
                method: "POST",
                body: JSON.stringify({ title: title.trim(), body, categoryId: categoryId === NO_CATEGORY ? null : categoryId }),
            });
            setTitle(""); setBody(""); setCategoryId(NO_CATEGORY);
            loadArticles();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create article");
        }
    };

    const toggleActive = async (article: any) => {
        try {
            await apiFetch(`/knowledge-base/articles/${article.id}/active`, { method: "PATCH", body: JSON.stringify({ isActive: !article.isActive }) });
            loadArticles();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update article");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-6">
            <KnowledgeBaseCategories categories={categories} articleCounts={articleCounts} loadError={categoryError} onRetry={loadCategories} onChanged={load} />
            <div className="space-y-3">
                <h3 className="text-sm font-semibold">Articles</h3>
                <p className="text-xs text-muted-foreground">
                    Editing an existing article (same title) saves a new version rather than overwriting -- the highest-numbered active version is what&apos;s suggested on case detail pages.
                </p>
                {articles.map((article) => (
                    <div key={article.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                        <span>
                            {article.title}{" "}
                            <span className="text-xs text-muted-foreground">
                                v{article.version} · {article.visibility}
                                {article.categoryId ? ` · ${categoryById.get(article.categoryId)?.name ?? "Unknown category"}` : ""}
                            </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={article.isActive ? "secondary" : "outline"}>{article.isActive ? "Active" : "Inactive"}</Badge>
                            <Button variant="outline" size="sm" onClick={() => toggleActive(article)}>{article.isActive ? "Deactivate" : "Activate"}</Button>
                        </div>
                    </div>
                ))}
                <div className="flex flex-wrap gap-2">
                    <Input aria-label="Article title" placeholder="Article title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 basis-56" />
                    <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger className="w-full sm:w-56" aria-label="Article category"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={4} placeholder="Article body" value={body} onChange={(e) => setBody(e.target.value)} />
                <Button onClick={add}><Plus className="size-4" />Save Article</Button>
            </div>
        </div>
    );
}

function InboundAddressesTab() {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [addresses, setAddresses] = useState<any[]>([]);
    const [address, setAddress] = useState("");
    const [channel, setChannel] = useState("EMAIL");

    const load = useCallback(() => {
        setLoadError(null);
        apiFetch<any[]>("/case-inbound-addresses").then((data) => setAddresses(Array.isArray(data) ? data : [])).catch(() => setLoadError("Failed to load inbound addresses."));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!address.trim()) return;
        try {
            await apiFetch("/case-inbound-addresses", { method: "POST", body: JSON.stringify({ address: address.trim(), channel }) });
            setAddress("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create inbound address");
        }
    };

    const remove = async (id: string) => {
        try {
            await apiFetch(`/case-inbound-addresses/${id}`, { method: "DELETE" });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete inbound address");
        }
    };

    if (loadError) return <ErrorState description={loadError} onRetry={load} />;

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Point your provider&apos;s inbound webhook at <code>/api/integrations/inbound/case-messages/&#123;tenantId&#125;</code>, signed with the same
                inbound-webhook secret used for lead capture (Settings &gt; Integrations). Messages to an address configured here without a matching
                open thread create a new case in that address&apos;s default queue/type; with no match at all, the tenant&apos;s default queue is used as a fallback.
            </p>
            {addresses.map((row) => (
                <SettingsRow key={row.id} onDelete={() => remove(row.id)}>
                    <span className="font-semibold">{row.address}</span>
                    <Badge variant="outline">{row.channel}</Badge>
                </SettingsRow>
            ))}
            <div className="flex flex-wrap gap-2">
                <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="EMAIL">Email</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                    </SelectContent>
                </Select>
                <Input aria-label="support@yourcompany.com" placeholder="support@yourcompany.com" value={address} onChange={(e) => setAddress(e.target.value)} />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

export default function ServiceDeskSettingsPage() {
    return (
        <div className="min-w-0">
            <PageHeader title="Service desk" description="Configure support queues, response targets and case handling." />
            <SettingsSections label="Service desk section" sections={[
                { id: "types", label: "Types", content: <TypesTab /> },
                { id: "statuses", label: "Statuses", content: <StatusesTab /> },
                { id: "priorities", label: "Priorities", content: <PrioritiesTab /> },
                { id: "queues", label: "Queues", content: <QueuesTab /> },
                { id: "sla", label: "Service levels", content: <SlaPoliciesTab /> },
                { id: "macros", label: "Macros", content: <MacrosTab /> },
                { id: "kb", label: "Knowledge base", content: <KnowledgeBaseTab /> },
                { id: "inbound", label: "Inbound email", content: <InboundAddressesTab /> },
            ]} />
        </div>
    );
}
