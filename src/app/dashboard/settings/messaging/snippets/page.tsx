"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Pencil, Plus, TextQuote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatWorkspaceDateTime } from "@/lib/date-format";

type Snippet = { id: string; key: string; body: string; createdAt: string; updatedAt: string };

const KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

function tokenFor(key: string) {
    return `{{snippet:${key}}}`;
}

// Settings › Messaging & AI › Message snippets (UI/UX plan decision 33): reusable blocks of text,
// such as a signature or a legal footer. A template that contains {{snippet:key}} gets the
// snippet's current text when the message is sent.
export default function MessageSnippetsPage() {
    const confirm = useConfirm();
    const [snippets, setSnippets] = useState<Snippet[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [editing, setEditing] = useState<Snippet | "new" | null>(null);
    const [key, setKey] = useState("");
    const [body, setBody] = useState("");
    const [errors, setErrors] = useState<{ key?: string; body?: string }>({});
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            const data = await apiFetch<Snippet[]>("/communications/snippets");
            setSnippets(Array.isArray(data) ? data : []);
        } catch {
            setFailed(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setKey("");
        setBody("");
        setErrors({});
        setEditing("new");
    };

    const openEdit = (snippet: Snippet) => {
        setKey(snippet.key);
        setBody(snippet.body);
        setErrors({});
        setEditing(snippet);
    };

    const save = async () => {
        const isNew = editing === "new";
        const trimmedKey = key.trim();
        const next: { key?: string; body?: string } = {};
        if (isNew) {
            if (!trimmedKey) next.key = "Enter a key, for example signature.";
            else if (!KEY_PATTERN.test(trimmedKey)) next.key = "Use only letters, numbers, dots, dashes and underscores.";
            // Saving a key that already exists replaces that snippet's text, so new keys must be unique.
            else if ((snippets ?? []).some((snippet) => snippet.key === trimmedKey)) next.key = "A snippet with this key already exists. Edit it instead.";
        }
        if (!body.trim()) next.body = "Enter the snippet's text.";
        setErrors(next);
        if (next.key || next.body) return;
        setSaving(true);
        try {
            // The API upserts by key; the key can't change once created.
            const saved = await apiFetch<Snippet>("/communications/snippets", {
                method: "PUT",
                body: JSON.stringify({ key: isNew ? trimmedKey : (editing as Snippet).key, body }),
            });
            setSnippets((current) => {
                const rest = (current ?? []).filter((snippet) => snippet.id !== saved.id && snippet.key !== saved.key);
                return [...rest, saved].sort((a, b) => a.key.localeCompare(b.key));
            });
            toast.success(isNew ? "Snippet added" : "Snippet saved");
            setEditing(null);
        } catch (caught: any) {
            toast.error(caught?.message || "The snippet couldn't be saved");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (snippet: Snippet) => {
        const ok = await confirm({
            title: `Delete the snippet ${snippet.key}?`,
            description: `Templates that still contain ${tokenFor(snippet.key)} will send nothing in its place.`,
            confirmLabel: "Delete snippet",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/communications/snippets/${snippet.id}`, { method: "DELETE" });
            setSnippets((current) => (current ?? []).filter((item) => item.id !== snippet.id));
            toast.success("Snippet deleted");
        } catch (caught: any) {
            toast.error(caught?.message || "The snippet couldn't be deleted");
        }
    };

    const copyToken = async (snippet: Snippet) => {
        try {
            await navigator.clipboard.writeText(tokenFor(snippet.key));
            toast.success("Copied");
        } catch {
            toast.error("Couldn't copy. Select the text and copy it instead.");
        }
    };

    const isNew = editing === "new";

    return (
        <div className="min-w-0 max-w-4xl">
            <PageHeader
                title="Message snippets"
                description="Reusable text, such as a signature or a legal footer. Put {{snippet:key}} in an email, SMS or WhatsApp template and the snippet's current text is sent in its place."
                primaryAction={<Button onClick={openNew} disabled={snippets === null}><Plus className="size-4" />New snippet</Button>}
            />

            {failed ? (
                <ErrorState description="The snippets couldn't be loaded." onRetry={load} />
            ) : snippets === null ? (
                <p role="status" className="text-sm text-muted-foreground">Loading…</p>
            ) : snippets.length === 0 ? (
                <EmptyState icon={<TextQuote />} title="No snippets yet" description="Add a snippet once and reuse it in any template." action={<Button variant="outline" onClick={openNew}><Plus className="size-4" />New snippet</Button>} />
            ) : (
                <ul className="divide-y rounded-lg border">
                    {snippets.map((snippet) => (
                        <li key={snippet.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
                            <div className="min-w-0 flex-1 basis-64 space-y-1">
                                <code className="font-mono text-sm font-medium">{tokenFor(snippet.key)}</code>
                                <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{snippet.body}</p>
                                <p className="text-xs text-muted-foreground">Updated {formatWorkspaceDateTime(snippet.updatedAt)}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <Button variant="ghost" size="icon-sm" aria-label={`Copy ${tokenFor(snippet.key)}`} onClick={() => copyToken(snippet)}><Copy className="size-4" /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${snippet.key}`} onClick={() => openEdit(snippet)}><Pencil className="size-4" /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${snippet.key}`} onClick={() => remove(snippet)}><Trash2 className="size-4" /></Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <StandardDialog
                open={editing !== null}
                onClose={() => { if (!saving) setEditing(null); }}
                title={isNew ? "New snippet" : `Edit ${(editing as Snippet | null)?.key ?? "snippet"}`}
                maxWidth="sm"
                actions={<>
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                    <Button onClick={save} isLoading={saving}>{isNew ? "Add snippet" : "Save snippet"}</Button>
                </>}
            >
                <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
                    <div className="space-y-1.5">
                        <Label htmlFor="snippet-key">Key</Label>
                        <Input
                            id="snippet-key"
                            className="font-mono"
                            value={key}
                            disabled={!isNew}
                            onChange={(event) => { setKey(event.target.value); setErrors((current) => ({ ...current, key: undefined })); }}
                            aria-invalid={!!errors.key || undefined}
                            aria-describedby={errors.key ? "snippet-key-error" : "snippet-key-help"}
                        />
                        {errors.key ? (
                            <p id="snippet-key-error" className="text-sm text-destructive">{errors.key}</p>
                        ) : (
                            <p id="snippet-key-help" className="text-xs text-muted-foreground">
                                {isNew ? <>Used in templates as <code className="font-mono">{tokenFor(key.trim() || "key")}</code>. It can&apos;t be changed later.</> : "The key can't be changed. To rename a snippet, add a new one and delete this one."}
                            </p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="snippet-body">Text</Label>
                        <Textarea
                            id="snippet-body"
                            rows={8}
                            value={body}
                            onChange={(event) => { setBody(event.target.value); setErrors((current) => ({ ...current, body: undefined })); }}
                            aria-invalid={!!errors.body || undefined}
                            aria-describedby={errors.body ? "snippet-body-error" : undefined}
                        />
                        {errors.body ? <p id="snippet-body-error" className="text-sm text-destructive">{errors.body}</p> : null}
                    </div>
                </form>
            </StandardDialog>
        </div>
    );
}
