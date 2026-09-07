"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function SettingsRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
            <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" />
            </Button>
        </div>
    );
}

function TypesTab() {
    const [types, setTypes] = useState<any[]>([]);
    const [name, setName] = useState("");

    const load = useCallback(() => {
        apiFetch<any[]>("/case-types").then((data) => setTypes(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load case types"));
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

    return (
        <div className="space-y-3">
            {types.map((type) => (
                <SettingsRow key={type.id} onDelete={() => remove(type.id)}>
                    <span className="font-semibold">{type.name}</span>
                    {type.description && <span className="text-muted-foreground">{type.description}</span>}
                </SettingsRow>
            ))}
            <div className="flex gap-2">
                <Input placeholder="New case type name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

const STATUS_CATEGORIES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];

function StatusesTab() {
    const [statuses, setStatuses] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [category, setCategory] = useState("OPEN");

    const load = useCallback(() => {
        apiFetch<any[]>("/case-statuses").then((data) => setStatuses(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load case statuses"));
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
                <Input placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
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
    const [priorities, setPriorities] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [level, setLevel] = useState("1");

    const load = useCallback(() => {
        apiFetch<any[]>("/case-priorities").then((data) => setPriorities(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load case priorities"));
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

    return (
        <div className="space-y-3">
            {priorities.map((priority) => (
                <SettingsRow key={priority.id} onDelete={() => remove(priority.id)}>
                    <span className="font-semibold">{priority.name}</span>
                    <span className="text-xs text-muted-foreground">Level {priority.level}</span>
                    {priority.isDefault && <Badge>Default</Badge>}
                </SettingsRow>
            ))}
            <div className="flex gap-2">
                <Input placeholder="New priority name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
                <Input type="number" min={1} placeholder="Level" value={level} onChange={(e) => setLevel(e.target.value)} className="w-[100px]" />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

function QueuesTab() {
    const [queues, setQueues] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [name, setName] = useState("");

    const load = useCallback(() => {
        apiFetch<any[]>("/case-queues").then((data) => setQueues(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load case queues"));
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

    return (
        <div className="space-y-4">
            {queues.map((queue) => (
                <Card key={queue.id} className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold">{queue.name}{queue.isDefault && <Badge className="ml-2">Default</Badge>}</span>
                        <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(queue.id)}>
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">Members (round-robin assigns among these)</p>
                    <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                        {users.map((user) => (
                            <label key={user.id} className="flex items-center gap-2 text-sm">
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
            <div className="flex gap-2">
                <Input placeholder="New queue name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[220px]" />
                <Button onClick={add}><Plus className="size-4" />Add Queue</Button>
            </div>
        </div>
    );
}

function SlaPoliciesTab() {
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
        apiFetch<any[]>("/case-sla-policies").then((data) => setPolicies(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load SLA policies"));
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
                <Input placeholder="Policy name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
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
    const [macros, setMacros] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [channel, setChannel] = useState("__none__");
    const [bodyTemplate, setBodyTemplate] = useState("");
    const [requiresApproval, setRequiresApproval] = useState(false);

    const load = useCallback(() => {
        apiFetch<any[]>("/case-macros").then((data) => setMacros(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load macros"));
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
                <Input placeholder="Macro name" value={name} onChange={(e) => setName(e.target.value)} />
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
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={requiresApproval} onCheckedChange={(checked) => setRequiresApproval(!!checked)} />
                    Require a second admin&apos;s approval before this reply is actually sent
                </label>
            )}
            <Button onClick={add}><Plus className="size-4" />Add Macro</Button>
        </div>
    );
}

function KnowledgeBaseTab() {
    const [articles, setArticles] = useState<any[]>([]);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");

    const load = useCallback(() => {
        apiFetch<any[]>("/knowledge-base/articles").then((data) => setArticles(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load articles"));
    }, []);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!title.trim() || !body.trim()) return;
        try {
            await apiFetch("/knowledge-base/articles", { method: "POST", body: JSON.stringify({ title: title.trim(), body }) });
            setTitle(""); setBody("");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to create article");
        }
    };

    const toggleActive = async (article: any) => {
        try {
            await apiFetch(`/knowledge-base/articles/${article.id}/active`, { method: "PATCH", body: JSON.stringify({ isActive: !article.isActive }) });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update article");
        }
    };

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Editing an existing article (same title) saves a new version rather than overwriting -- the highest-numbered active version is what&apos;s suggested on case detail pages.
            </p>
            {articles.map((article) => (
                <div key={article.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <span>{article.title} <span className="text-xs text-muted-foreground">v{article.version} · {article.visibility}</span></span>
                    <div className="flex items-center gap-2">
                        <Badge variant={article.isActive ? "secondary" : "outline"}>{article.isActive ? "Active" : "Inactive"}</Badge>
                        <Button variant="outline" size="sm" onClick={() => toggleActive(article)}>{article.isActive ? "Deactivate" : "Activate"}</Button>
                    </div>
                </div>
            ))}
            <Input placeholder="Article title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full rounded-md border p-2 text-sm" rows={4} placeholder="Article body" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button onClick={add}><Plus className="size-4" />Save Article</Button>
        </div>
    );
}

function InboundAddressesTab() {
    const [addresses, setAddresses] = useState<any[]>([]);
    const [address, setAddress] = useState("");
    const [channel, setChannel] = useState("EMAIL");

    const load = useCallback(() => {
        apiFetch<any[]>("/case-inbound-addresses").then((data) => setAddresses(Array.isArray(data) ? data : [])).catch(() => toast.error("Failed to load inbound addresses"));
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
            <div className="flex gap-2">
                <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="EMAIL">Email</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                    </SelectContent>
                </Select>
                <Input placeholder="support@yourcompany.com" value={address} onChange={(e) => setAddress(e.target.value)} />
                <Button onClick={add}><Plus className="size-4" />Add</Button>
            </div>
        </div>
    );
}

export default function ServiceDeskSettingsPage() {
    return (
        <div className="mx-auto max-w-[900px] p-3 md:p-4">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex rounded-[10px] bg-primary/10 p-2 text-primary">
                    <LifeBuoy className="size-5" />
                </div>
                <div>
                    <h1 className="text-lg font-extrabold">Service Desk</h1>
                    <p className="text-xs text-muted-foreground">Configure case types, statuses, priorities, queues, and SLA policies.</p>
                </div>
            </div>

            <Tabs defaultValue="types">
                <TabsList>
                    <TabsTrigger value="types">Types</TabsTrigger>
                    <TabsTrigger value="statuses">Statuses</TabsTrigger>
                    <TabsTrigger value="priorities">Priorities</TabsTrigger>
                    <TabsTrigger value="queues">Queues</TabsTrigger>
                    <TabsTrigger value="sla">SLA Policies</TabsTrigger>
                    <TabsTrigger value="macros">Macros</TabsTrigger>
                    <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
                    <TabsTrigger value="inbound">Inbound Addresses</TabsTrigger>
                </TabsList>
                <TabsContent value="types"><TypesTab /></TabsContent>
                <TabsContent value="statuses"><StatusesTab /></TabsContent>
                <TabsContent value="priorities"><PrioritiesTab /></TabsContent>
                <TabsContent value="queues"><QueuesTab /></TabsContent>
                <TabsContent value="sla"><SlaPoliciesTab /></TabsContent>
                <TabsContent value="macros"><MacrosTab /></TabsContent>
                <TabsContent value="kb"><KnowledgeBaseTab /></TabsContent>
                <TabsContent value="inbound"><InboundAddressesTab /></TabsContent>
            </Tabs>
        </div>
    );
}
