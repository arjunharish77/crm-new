"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, Eye, FileText, Globe, GraduationCap, MessageSquareText, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { Section } from "@/components/common/section";
import { FormField } from "@/components/common/form-field";
import { StandardSheet } from "@/components/common/standard-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Kind = "QA" | "DOCUMENT" | "WEBSITE" | "CATALOG";
type Source = {
    id: string; kind: Kind; title: string; status: "PROCESSING" | "READY" | "FAILED"; error: string | null;
    question: string | null; answer: string | null; url: string | null; fileName: string | null; fileSize: number | null;
    programIds: string[]; tidyWithClaude: boolean; chunkCount: number; refreshedAt: string | null; updatedAt: string;
};
type Knowledge = { sources: Source[]; passages: number; limits: { sources: number; passages: number; documentMb: number }; catalogAvailable: boolean; claudeAvailable: boolean };
type Sheet = { kind: "qa"; source: Source | null } | { kind: "website" } | { kind: "document" } | { kind: "catalog" } | { kind: "view"; sourceId: string } | null;

const KIND_LABEL: Record<Kind, string> = { QA: "Q&A", DOCUMENT: "Document", WEBSITE: "Web page", CATALOG: "Catalogue" };
const KIND_ICON: Record<Kind, typeof FileText> = { QA: MessageSquareText, DOCUMENT: FileText, WEBSITE: Globe, CATALOG: GraduationCap };

function describe(source: Source) {
    if (source.kind === "WEBSITE") return source.url ?? "";
    if (source.kind === "DOCUMENT") return `${source.fileName ?? ""}${source.fileSize ? ` · ${Math.max(1, Math.round(source.fileSize / 1024))} KB` : ""}`;
    if (source.kind === "CATALOG") return `${source.programIds.length} program${source.programIds.length === 1 ? "" : "s"}, kept in step with the catalogue`;
    return source.answer ?? "";
}

// The bot's knowledge (voice bot plan wave D): written Q&A, documents, web pages and catalogue
// programs. Changes save straight away; reading a document or page happens in the background.
export function KnowledgePanel({ botId }: { botId: string }) {
    const confirm = useConfirm();
    const [data, setData] = useState<Knowledge | null>(null);
    const [failed, setFailed] = useState(false);
    const [sheet, setSheet] = useState<Sheet>(null);

    const load = useCallback(async () => {
        try {
            setData(await apiFetch<Knowledge>(`/voice-bots/${botId}/knowledge`));
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [botId]);

    useEffect(() => { load(); }, [load]);

    // While something is being read, look again every few seconds.
    const processing = !!data?.sources.some((source) => source.status === "PROCESSING");
    useEffect(() => {
        if (!processing) return;
        const timer = setInterval(load, 2500);
        return () => clearInterval(timer);
    }, [processing, load]);

    const remove = async (source: Source) => {
        const ok = await confirm({
            title: `Remove "${source.title}"?`,
            description: "The bot stops using it on new calls. Past calls aren't changed.",
            confirmLabel: "Remove",
            destructive: true,
        });
        if (!ok) return;
        try {
            await apiFetch(`/voice-bots/${botId}/knowledge/${source.id}`, { method: "DELETE" });
            toast.success("Knowledge removed");
            await load();
        } catch (error: any) {
            toast.error(error?.message || "It couldn't be removed");
        }
    };

    const refresh = async (source: Source) => {
        try {
            await apiFetch(`/voice-bots/${botId}/knowledge/${source.id}/refresh`, { method: "POST" });
            await load();
        } catch (error: any) {
            toast.error(error?.message || "It couldn't be refreshed");
        }
    };

    if (failed && !data) return <div className="py-6"><ErrorState description="The bot's knowledge couldn't be loaded." onRetry={load} /></div>;
    if (!data) return <div className="space-y-3 py-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-32 w-full" /></div>;

    const catalogSource = data.sources.find((source) => source.kind === "CATALOG") ?? null;
    const atLimit = data.sources.length >= data.limits.sources;
    const addMenu = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={atLimit}><Plus className="size-4" />Add knowledge<ChevronDown className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSheet({ kind: "qa", source: null })}><MessageSquareText className="size-4" />Write a Q&amp;A</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSheet({ kind: "document" })}><FileText className="size-4" />Upload a document</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSheet({ kind: "website" })}><Globe className="size-4" />Add a web page</DropdownMenuItem>
                {data.catalogAvailable ? <DropdownMenuItem onSelect={() => setSheet({ kind: "catalog" })}><GraduationCap className="size-4" />{catalogSource ? "Change catalogue programs" : "Choose catalogue programs"}</DropdownMenuItem> : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="space-y-4 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Knowledge</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">What the bot can answer from. On a call it looks up the closest passages and answers only from them; anything else it offers to have the team confirm. Changes save straight away.</p>
                    <p className="text-xs text-muted-foreground">{data.sources.length} of {data.limits.sources} sources · {data.passages.toLocaleString("en-IN")} of {data.limits.passages.toLocaleString("en-IN")} passages</p>
                </div>
                {addMenu}
            </div>

            {data.sources.length === 0 ? (
                <EmptyState variant="inline" icon={<BookOpen className="size-8 text-muted-foreground" />} title="No knowledge yet" description="Without knowledge, the bot answers only from the caller details and offers to have the team confirm everything else." action={addMenu} />
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-full sm:w-1/2">Source</TableHead>
                                <TableHead className="hidden w-48 sm:table-cell">Status</TableHead>
                                <TableHead className="hidden w-44 md:table-cell">Updated</TableHead>
                                <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.sources.map((source) => {
                                const Icon = KIND_ICON[source.kind];
                                const status = source.status === "READY"
                                    ? <StatusBadge tone="success" label={`Ready · ${source.chunkCount} passage${source.chunkCount === 1 ? "" : "s"}`} />
                                    : source.status === "PROCESSING" ? <StatusBadge tone="info" label="Reading…" /> : <StatusBadge tone="danger" label="Failed" />;
                                return (
                                    <TableRow key={source.id}>
                                        <TableCell className="max-w-0">
                                            <div className="flex min-w-0 items-start gap-2">
                                                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                                                <div className="min-w-0 space-y-0.5">
                                                    <p className="truncate font-medium">{source.title}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{KIND_LABEL[source.kind]} · {describe(source)}</p>
                                                    <div className="sm:hidden">{status}</div>
                                                    {source.status === "FAILED" && source.error ? <p className="text-xs text-destructive">{source.error}</p> : null}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">{status}</TableCell>
                                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatWorkspaceRelativeTime(source.refreshedAt ?? source.updatedAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex justify-end">
                                                {source.status === "READY" ? <IconButton label={`View ${source.title}`} onClick={() => setSheet({ kind: "view", sourceId: source.id })}><Eye className="size-4" /></IconButton> : null}
                                                {source.kind === "QA" ? <IconButton label={`Edit ${source.title}`} onClick={() => setSheet({ kind: "qa", source })}><Pencil className="size-4" /></IconButton> : null}
                                                {source.kind === "CATALOG" ? <IconButton label="Change catalogue programs" onClick={() => setSheet({ kind: "catalog" })}><Pencil className="size-4" /></IconButton> : null}
                                                {source.kind !== "QA" || source.status === "FAILED" ? <IconButton label={`Read ${source.title} again`} onClick={() => refresh(source)} disabled={source.status === "PROCESSING"}><RefreshCw className="size-4" /></IconButton> : null}
                                                <IconButton label={`Remove ${source.title}`} onClick={() => remove(source)}><Trash2 className="size-4" /></IconButton>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            <TestQuestion botId={botId} disabled={data.passages === 0} />

            <QaSheet botId={botId} open={sheet?.kind === "qa"} source={sheet?.kind === "qa" ? sheet.source : null} onClose={() => setSheet(null)} onSaved={load} />
            <WebsiteSheet botId={botId} open={sheet?.kind === "website"} claudeAvailable={data.claudeAvailable} onClose={() => setSheet(null)} onSaved={load} />
            <DocumentSheet botId={botId} open={sheet?.kind === "document"} claudeAvailable={data.claudeAvailable} maxMb={data.limits.documentMb} onClose={() => setSheet(null)} onSaved={load} />
            <CatalogSheet botId={botId} open={sheet?.kind === "catalog"} selected={catalogSource?.programIds ?? []} onClose={() => setSheet(null)} onSaved={load} />
            <ViewSheet botId={botId} sourceId={sheet?.kind === "view" ? sheet.sourceId : null} onClose={() => setSheet(null)} />
        </div>
    );
}

function TidySwitch({ id, value, onChange, claudeAvailable }: { id: string; value: boolean; onChange: (value: boolean) => void; claudeAvailable: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="space-y-0.5">
                <Label htmlFor={id}>Tidy with Claude</Label>
                <p className="text-xs text-muted-foreground">{claudeAvailable ? "Turns the text into short facts in English (Hindi is translated) and drops menus and boilerplate. A few cents a page." : "Add a Claude key in Providers to use this."}</p>
            </div>
            <Switch id={id} checked={value && claudeAvailable} onCheckedChange={onChange} disabled={!claudeAvailable} />
        </div>
    );
}

function QaSheet({ botId, open, source, onClose, onSaved }: { botId: string; open: boolean; source: Source | null; onClose: () => void; onSaved: () => Promise<void> }) {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!open) return;
        setQuestion(source?.question ?? ""); setAnswer(source?.answer ?? ""); setError(null);
    }, [open, source]);
    const save = async () => {
        if (question.trim().length < 3 || !answer.trim()) {
            setError("Write the question and its answer.");
            return;
        }
        setSaving(true);
        try {
            const body = JSON.stringify({ kind: "QA", question, answer });
            if (source) await apiFetch(`/voice-bots/${botId}/knowledge/${source.id}`, { method: "PATCH", body });
            else await apiFetch(`/voice-bots/${botId}/knowledge`, { method: "POST", body });
            toast.success(source ? "Q&A saved" : "Q&A added");
            await onSaved();
            onClose();
        } catch (failure: any) {
            toast.error(failure?.message || "The Q&A couldn't be saved");
        } finally {
            setSaving(false);
        }
    };
    return (
        <StandardSheet open={open} onClose={saving ? () => undefined : onClose} title={source ? "Edit Q&A" : "Write a Q&A"} description="A question callers ask and the answer the bot should give."
            actions={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={saving}>{source ? "Save" : "Add Q&A"}</Button></>}>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
                <FormField id="knowledge-question" label="Question" required error={error && question.trim().length < 3 ? error : null}>
                    <Input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Is there a hostel on campus?" autoFocus />
                </FormField>
                <FormField id="knowledge-answer" label="Answer" required error={error && !answer.trim() ? error : null} help="In plain words, with exact figures. Hindi or English.">
                    <Textarea rows={6} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Yes. Rooms cost ₹60,000 a year, including meals." />
                </FormField>
            </form>
        </StandardSheet>
    );
}

function WebsiteSheet({ botId, open, claudeAvailable, onClose, onSaved }: { botId: string; open: boolean; claudeAvailable: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
    const [url, setUrl] = useState("");
    const [tidy, setTidy] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (open) { setUrl(""); setTidy(true); } }, [open]);
    const save = async () => {
        setSaving(true);
        try {
            await apiFetch(`/voice-bots/${botId}/knowledge`, { method: "POST", body: JSON.stringify({ kind: "WEBSITE", url, tidyWithClaude: tidy && claudeAvailable }) });
            toast.success("Web page added. It's being read now.");
            await onSaved();
            onClose();
        } catch (failure: any) {
            toast.error(failure?.message || "The page couldn't be added");
        } finally {
            setSaving(false);
        }
    };
    return (
        <StandardSheet open={open} onClose={saving ? () => undefined : onClose} title="Add a web page" description="The page is read now and again every day, so changes on your site reach the bot."
            actions={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={saving || !url.trim()}>Add page</Button></>}>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (url.trim()) save(); }}>
                <FormField id="knowledge-url" label="Address" required help="One page, such as the course's fees or admissions page. Add each page you want separately.">
                    <Input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.edu/mba/fees" autoFocus />
                </FormField>
                <TidySwitch id="knowledge-url-tidy" value={tidy} onChange={setTidy} claudeAvailable={claudeAvailable} />
            </form>
        </StandardSheet>
    );
}

function DocumentSheet({ botId, open, claudeAvailable, maxMb, onClose, onSaved }: { botId: string; open: boolean; claudeAvailable: boolean; maxMb: number; onClose: () => void; onSaved: () => Promise<void> }) {
    const [file, setFile] = useState<File | null>(null);
    const [tidy, setTidy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement | null>(null);
    useEffect(() => { if (open) { setFile(null); setTidy(false); setError(null); } }, [open]);
    const pick = (next: File | null) => {
        setFile(next);
        setError(next && next.size > maxMb * 1024 * 1024 ? `The file must be under ${maxMb} MB.` : null);
    };
    const save = async () => {
        if (!file || error) return;
        setSaving(true);
        try {
            const form = new FormData();
            form.set("file", file);
            form.set("tidyWithClaude", String(tidy && claudeAvailable));
            const response = await fetch(`/api/voice-bots/${botId}/knowledge/documents`, { method: "POST", body: form, credentials: "same-origin" });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.message || "The document couldn't be uploaded");
            }
            toast.success("Document uploaded. It's being read now.");
            await onSaved();
            onClose();
        } catch (failure: any) {
            toast.error(failure?.message || "The document couldn't be uploaded");
        } finally {
            setSaving(false);
        }
    };
    return (
        <StandardSheet open={open} onClose={saving ? () => undefined : onClose} title="Upload a document" description="A prospectus, fee sheet or FAQ. The bot answers from its text."
            actions={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={saving || !file || !!error}>Upload</Button></>}>
            <div className="space-y-4">
                <FormField id="knowledge-file" label="File" required error={error} help={`PDF, Word (.docx) or text, up to ${maxMb} MB. Scanned PDFs without text can't be read.`}>
                    <Input ref={input} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => pick(event.target.files?.[0] ?? null)} />
                </FormField>
                <TidySwitch id="knowledge-file-tidy" value={tidy} onChange={setTidy} claudeAvailable={claudeAvailable} />
            </div>
        </StandardSheet>
    );
}

function CatalogSheet({ botId, open, selected, onClose, onSaved }: { botId: string; open: boolean; selected: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
    const [programs, setPrograms] = useState<Array<{ id: string; name: string; university: string; level: string }> | null>(null);
    const [chosen, setChosen] = useState<string[]>([]);
    const [filter, setFilter] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!open) return;
        setChosen(selected); setFilter("");
        apiFetch<{ programs: Array<{ id: string; name: string; university: string; level: string }> }>("/voice-bots/knowledge/programs").then((result) => setPrograms(result.programs)).catch(() => setPrograms([]));
    }, [open, selected]);
    const groups = useMemo(() => {
        const term = filter.trim().toLowerCase();
        const map = new Map<string, Array<{ id: string; name: string; level: string }>>();
        for (const program of programs ?? []) {
            if (term && !`${program.name} ${program.university}`.toLowerCase().includes(term)) continue;
            map.set(program.university, [...(map.get(program.university) ?? []), program]);
        }
        return [...map.entries()];
    }, [programs, filter]);
    const save = async () => {
        setSaving(true);
        try {
            await apiFetch(`/voice-bots/${botId}/knowledge`, { method: "POST", body: JSON.stringify({ kind: "CATALOG", programIds: chosen }) });
            toast.success(chosen.length ? "Catalogue programs saved. They're being read now." : "Catalogue programs removed");
            await onSaved();
            onClose();
        } catch (failure: any) {
            toast.error(failure?.message || "The programs couldn't be saved");
        } finally {
            setSaving(false);
        }
    };
    return (
        <StandardSheet open={open} onClose={saving ? () => undefined : onClose} title="Catalogue programs" description="The bot learns each ticked program's courses, intakes, fees, scholarships and eligibility, kept in step with the catalogue."
            actions={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={saving}>Save {chosen.length ? `(${chosen.length})` : ""}</Button></>}>
            <div className="space-y-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a program" aria-label="Find a program" className="pl-8" />
                </div>
                {programs === null ? <p className="text-sm text-muted-foreground" role="status">Loading programs…</p> : groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{programs.length ? "No programs match." : "The catalogue has no active programs yet."}</p>
                ) : groups.map(([university, items]) => (
                    <fieldset key={university} className="space-y-2">
                        <legend className="text-xs font-medium text-muted-foreground">{university}</legend>
                        {items.map((program) => (
                            <div key={program.id} className="flex items-center gap-2">
                                <Checkbox id={`program-${program.id}`} checked={chosen.includes(program.id)} onCheckedChange={(checked) => setChosen((current) => checked === true ? [...new Set([...current, program.id])] : current.filter((id) => id !== program.id))} />
                                <Label htmlFor={`program-${program.id}`} className="font-normal">{program.name} <span className="text-xs text-muted-foreground">· {program.level.toLowerCase()}</span></Label>
                            </div>
                        ))}
                    </fieldset>
                ))}
            </div>
        </StandardSheet>
    );
}

function ViewSheet({ botId, sourceId, onClose }: { botId: string; sourceId: string | null; onClose: () => void }) {
    const [source, setSource] = useState<(Source & { passages: Array<{ position: number; text: string; language: string | null }> }) | null>(null);
    useEffect(() => {
        setSource(null);
        if (!sourceId) return;
        apiFetch<any>(`/voice-bots/${botId}/knowledge/${sourceId}`).then(setSource).catch(() => toast.error("It couldn't be loaded"));
    }, [botId, sourceId]);
    return (
        <StandardSheet open={!!sourceId} onClose={onClose} title={source?.title ?? "Knowledge"} description={source ? `${KIND_LABEL[source.kind]} · ${source.passages.length} passage${source.passages.length === 1 ? "" : "s"} the bot can find` : undefined}
            actions={<Button variant="outline" onClick={onClose}>Close</Button>}>
            {!source ? <p className="text-sm text-muted-foreground" role="status">Loading…</p> : (
                <ol className="space-y-3">
                    {source.passages.map((passage) => (
                        <li key={passage.position} className="whitespace-pre-line rounded-lg border p-3 text-sm">{passage.text}</li>
                    ))}
                </ol>
            )}
        </StandardSheet>
    );
}

function TestQuestion({ botId, disabled }: { botId: string; disabled: boolean }) {
    const [question, setQuestion] = useState("");
    const [result, setResult] = useState<{ passages: Array<{ text: string; source: string; score: number }> } | null>(null);
    const [testing, setTesting] = useState(false);
    const run = async () => {
        if (!question.trim()) return;
        setTesting(true);
        try {
            setResult(await apiFetch(`/voice-bots/${botId}/knowledge/test`, { method: "POST", body: JSON.stringify({ question }) }));
        } catch (failure: any) {
            toast.error(failure?.message || "The question couldn't be tested");
        } finally {
            setTesting(false);
        }
    };
    return (
        <Section layout="split" id="knowledge-test" title="Test a question" description="What the bot would find for a question on a call. On calls, the AI searches in English; Hindi questions work here too.">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); run(); }}>
                <Input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="What are the MBA fees?" aria-label="Question to test" disabled={disabled} />
                <Button type="submit" variant="outline" isLoading={testing} disabled={disabled || testing || !question.trim()}><Search className="size-4" />Test</Button>
            </form>
            {disabled ? <p className="text-sm text-muted-foreground">Add knowledge first.</p> : null}
            {result ? (
                result.passages.length === 0 ? (
                    <p className="text-sm text-muted-foreground" aria-live="polite">Nothing close enough. The bot would say the team will confirm, and offer a callback.</p>
                ) : (
                    <ol className="space-y-2" aria-live="polite">
                        {result.passages.map((passage, index) => (
                            <li key={index} className="space-y-1 rounded-lg border p-3">
                                <p className="whitespace-pre-line text-sm">{passage.text}</p>
                                <p className="text-xs text-muted-foreground">{passage.source} · match {Math.round(passage.score * 100)}%</p>
                            </li>
                        ))}
                    </ol>
                )
            ) : null}
        </Section>
    );
}
