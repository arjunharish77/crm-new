"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, Pencil, Trash2, History } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ConditionBuilder, type ConditionFieldOption, type CrmCondition } from "@/components/common/condition-builder";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type ObjectionEntry = { objection: string; response: string };

type CallScript = {
    id: string;
    name: string;
    matchConditions: { conditions: CrmCondition[]; conditionLogic: "AND" | "OR" };
    content: string;
    objectionHandling: ObjectionEntry[];
    complianceLines: string[];
    isActive: boolean;
    order: number;
    version: number;
    updatedAt: string;
};

type ScriptVersion = { id: string; version: number; name: string; content: string; createdBy: string | null; createdAt: string };

// "Course" has no dedicated entity in this data model (confirmed by audit) -- reinterpreted
// as opportunityTypeId, the closest real matchable dimension, and labeled honestly here
// rather than pretending a Course concept exists.
const CONDITION_FIELDS: ConditionFieldOption[] = [
    { key: "source", label: "Lead Source", type: "text" },
    { key: "opportunityTypeId", label: "Opportunity Type (Course)", type: "text" },
    { key: "stageId", label: "Opportunity Stage Id", type: "text" },
    { key: "predictiveScore.scoreBand", label: "Score Band", type: "select", options: ["HOT", "WARM", "COLD", "RISK"] },
];

function emptyScript(): Partial<CallScript> {
    return {
        name: "",
        matchConditions: { conditions: [], conditionLogic: "AND" },
        content: "",
        objectionHandling: [],
        complianceLines: [],
        isActive: true,
    };
}

export default function CallScriptsSettingsPage() {
    const [scripts, setScripts] = useState<CallScript[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<{ open: boolean; script: Partial<CallScript> | null }>({ open: false, script: null });
    const [historyFor, setHistoryFor] = useState<CallScript | null>(null);
    const [versions, setVersions] = useState<ScriptVersion[]>([]);

    const load = () => {
        setLoading(true);
        setLoadError(null);
        apiFetch<CallScript[]>("/call-scripts")
            .then((data) => setScripts(Array.isArray(data) ? data : []))
            .catch(() => setLoadError("Failed to load call scripts."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const remove = async (script: CallScript) => {
        if (!confirm(`Delete call script "${script.name}"?`)) return;
        try {
            await apiFetch(`/call-scripts/${script.id}`, { method: "DELETE" });
            setScripts((current) => current.filter((s) => s.id !== script.id));
            toast.success("Call script deleted");
        } catch (error: any) {
            toast.error(error?.message || "Failed to delete call script");
        }
    };

    const openHistory = async (script: CallScript) => {
        setHistoryFor(script);
        try {
            const data = await apiFetch<ScriptVersion[]>(`/call-scripts/${script.id}/versions`);
            setVersions(Array.isArray(data) ? data : []);
        } catch {
            setVersions([]);
        }
    };

    return (
        <div className="min-w-0 space-y-4">
            <PageHeader title="Call Scripts & Guidance" description="Manage scripts, objection responses and required call guidance." actions={
                <Button onClick={() => setDialog({ open: true, script: emptyScript() })}>
                    <Plus className="size-4" />
                    Add Script
                </Button>
            } />

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? (
                <ErrorState description={loadError} onRetry={load} />
            ) : scripts.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">No call scripts configured yet.</Card>
            ) : (
                <div className="space-y-2">
                    {scripts.map((script) => (
                        <Card key={script.id} className="p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FileText className="size-4 text-primary" />
                                    <span className="font-bold">{script.name}</span>
                                    {!script.isActive && <Badge variant="outline">Inactive</Badge>}
                                    <Badge variant="outline">v{script.version}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {script.matchConditions?.conditions?.length ?? 0} match condition(s)
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openHistory(script)}>
                                        <History className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, script })}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => remove(script)}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {dialog.open && dialog.script && (
                <ScriptDialog
                    script={dialog.script}
                    onClose={() => setDialog({ open: false, script: null })}
                    onSaved={(saved) => {
                        setScripts((current) => {
                            const exists = current.some((s) => s.id === saved.id);
                            return exists ? current.map((s) => (s.id === saved.id ? saved : s)) : [...current, saved];
                        });
                        setDialog({ open: false, script: null });
                    }}
                />
            )}

            {historyFor && (
                <StandardDialog open onClose={() => setHistoryFor(null)} title={`Version History -- ${historyFor.name}`} maxWidth="md">
                    <div className="space-y-3">
                        {versions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No prior versions -- this is the first version.</p>
                        ) : (
                            versions.map((version) => (
                                <div key={version.id} className="rounded-md border p-3">
                                    <div className="flex flex-wrap items-center justify-between">
                                        <Badge variant="outline">v{version.version}</Badge>
                                        <span className="text-xs text-muted-foreground">{formatWorkspaceDateTime(version.createdAt)}</span>
                                    </div>
                                    <p className="mt-1 text-sm font-medium">{version.name}</p>
                                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{version.content}</p>
                                </div>
                            ))
                        )}
                    </div>
                </StandardDialog>
            )}
        </div>
    );
}

function ScriptDialog({
    script,
    onClose,
    onSaved,
}: {
    script: Partial<CallScript>;
    onClose: () => void;
    onSaved: (script: CallScript) => void;
}) {
    const [name, setName] = useState(script.name ?? "");
    const [content, setContent] = useState(script.content ?? "");
    const [isActive, setIsActive] = useState(script.isActive ?? true);
    const [conditions, setConditions] = useState<CrmCondition[]>(script.matchConditions?.conditions ?? []);
    const [logic, setLogic] = useState<"AND" | "OR">(script.matchConditions?.conditionLogic ?? "AND");
    const [objectionHandling, setObjectionHandling] = useState<ObjectionEntry[]>(script.objectionHandling ?? []);
    const [complianceLines, setComplianceLines] = useState<string[]>(script.complianceLines ?? []);
    const [saving, setSaving] = useState(false);

    const addObjection = () => setObjectionHandling((current) => [...current, { objection: "", response: "" }]);
    const updateObjection = (index: number, patch: Partial<ObjectionEntry>) =>
        setObjectionHandling((current) => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
    const removeObjection = (index: number) => setObjectionHandling((current) => current.filter((_, i) => i !== index));

    const addComplianceLine = () => setComplianceLines((current) => [...current, ""]);
    const updateComplianceLine = (index: number, value: string) =>
        setComplianceLines((current) => current.map((line, i) => (i === index ? value : line)));
    const removeComplianceLine = (index: number) => setComplianceLines((current) => current.filter((_, i) => i !== index));

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name,
                content,
                isActive,
                matchConditions: { conditions, conditionLogic: logic },
                objectionHandling: objectionHandling.filter((entry) => entry.objection.trim() || entry.response.trim()),
                complianceLines: complianceLines.filter((line) => line.trim()),
            };
            const saved = script.id
                ? await apiFetch<CallScript>(`/call-scripts/${script.id}`, { method: "PATCH", body: JSON.stringify(payload) })
                : await apiFetch<CallScript>("/call-scripts", { method: "POST", body: JSON.stringify(payload) });
            onSaved(saved);
            toast.success(script.id ? "Call script updated" : "Call script created");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save call script");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open
            onClose={onClose}
            title={script.id ? "Edit Call Script" : "Add Call Script"}
            maxWidth="lg"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} onClick={save}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="call-script-name">Name</Label>
                    <Input id="call-script-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise Renewal -- Hot Leads" />
                </div>

                <ConditionBuilder
                    title="Match Conditions"
                    description="Leave empty for a catch-all fallback script. A script matching more conditions wins over a more generic one."
                    fields={CONDITION_FIELDS}
                    conditions={conditions}
                    logic={logic}
                    onLogicChange={setLogic}
                    onChange={setConditions}
                />

                <div className="space-y-1.5">
                    <Label htmlFor="call-script-content">Script Content</Label>
                    <Textarea id="call-script-content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What the agent should say..." />
                </div>

                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between">
                        <Label>Objection Handling</Label>
                        <Button size="sm" variant="outline" onClick={addObjection}>
                            <Plus className="size-3.5" />
                            Add
                        </Button>
                    </div>
                    {objectionHandling.map((entry, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-md border p-2">
                            <Input placeholder="Objection" value={entry.objection} onChange={(e) => updateObjection(index, { objection: e.target.value })} />
                            <div className="flex gap-1">
                                <Input placeholder="Response" value={entry.response} onChange={(e) => updateObjection(index, { response: e.target.value })} />
                                <Button variant="ghost" size="icon" onClick={() => removeObjection(index)}>
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between">
                        <Label>Required Compliance Lines</Label>
                        <Button size="sm" variant="outline" onClick={addComplianceLine}>
                            <Plus className="size-3.5" />
                            Add
                        </Button>
                    </div>
                    {complianceLines.map((line, index) => (
                        <div key={index} className="flex gap-1">
                            <Input value={line} onChange={(e) => updateComplianceLine(index, e.target.value)} placeholder="e.g. This call may be recorded for quality purposes." />
                            <Button variant="ghost" size="icon" onClick={() => removeComplianceLine(index)}>
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <Label>Active</Label>
                </div>
            </div>
        </StandardDialog>
    );
}
