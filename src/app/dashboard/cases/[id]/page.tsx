"use client";

import { RecordSummary } from "@/components/detail-shell/record-summary";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SlaBadge } from "@/components/cases/sla-badge";
import { ArrowLeft, BookOpen, History, LifeBuoy, Lock, MessageSquare, Pause, Paperclip, Play, Sparkles, ThumbsDown, ThumbsUp, UserCog } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StandardDialog } from "@/components/common/standard-dialog";
import { PageSkeleton } from "@/components/common/skeletons";
import { ErrorState } from "@/components/common/error-state";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { useRecordTitle } from "@/components/app-states/page-title";

export default function CaseDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [record, setRecord] = useState<any>(null);
    useRecordTitle(record ? [record.caseNumber ? `#${record.caseNumber}` : "", record.subject].filter(Boolean).join(" ") : null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [statuses, setStatuses] = useState<any[]>([]);
    const [priorities, setPriorities] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    const [commentBody, setCommentBody] = useState("");
    const [commentInternal, setCommentInternal] = useState(true);
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignUserId, setAssignUserId] = useState("");
    const [assignReason, setAssignReason] = useState("");
    const [assignSubmitting, setAssignSubmitting] = useState(false);

    const [slaBusy, setSlaBusy] = useState(false);
    const [suggestedArticles, setSuggestedArticles] = useState<any[]>([]);
    const [openArticleId, setOpenArticleId] = useState<string | null>(null);
    // "Was this helpful?" per suggested article: "sending" while posting, "sent" once recorded.
    const [articleFeedback, setArticleFeedback] = useState<Record<string, "sending" | "sent">>({});
    const [macros, setMacros] = useState<any[]>([]);
    const [selectedMacroId, setSelectedMacroId] = useState("");
    const [macroApplying, setMacroApplying] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const attachmentInput = useRef<HTMLInputElement>(null);
    const [history, setHistory] = useState<any>(null);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [attachmentUploading, setAttachmentUploading] = useState(false);

    const fetchCase = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch<any>(`/cases/${params.id}`);
            if (!data) {
                setFetchError("Case not found.");
                return;
            }
            setRecord(data);
        } catch (error: any) {
            setFetchError(error?.message || "Failed to load case.");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        fetchCase();
        apiFetch<any[]>("/case-statuses").then((data) => setStatuses(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>("/case-priorities").then((data) => setPriorities(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>("/case-macros").then((data) => setMacros(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>(`/cases/${params.id}/suggested-articles`).then((data) => setSuggestedArticles(Array.isArray(data) ? data : [])).catch(() => undefined);
        apiFetch<any[]>(`/cases/${params.id}/attachments`).then((data) => setAttachments(Array.isArray(data) ? data : [])).catch(() => undefined);
    }, [fetchCase, params.id]);

    const loadHistory = () => {
        setHistoryOpen((open) => !open);
        if (!history) {
            apiFetch<any>(`/cases/${params.id}/communication-history`).then(setHistory).catch(() => toast.error("Failed to load communication history"));
        }
    };

    const toggleSla = async () => {
        setSlaBusy(true);
        try {
            const updated = await apiFetch<any>(`/cases/${params.id}/sla/${record.slaPausedAt ? "resume" : "pause"}`, { method: "POST" });
            setRecord((prev: any) => ({ ...prev, ...updated }));
            toast.success(record.slaPausedAt ? "SLA resumed" : "SLA paused");
        } catch (error: any) {
            toast.error(error?.message || "Failed to update SLA state");
        } finally {
            setSlaBusy(false);
        }
    };

    const applyMacro = async () => {
        if (!selectedMacroId) return;
        setMacroApplying(true);
        try {
            const outcome = await apiFetch<any>(`/cases/${params.id}/apply-macro`, { method: "POST", body: JSON.stringify({ macroId: selectedMacroId }) });
            toast.success(outcome?.sent?.pendingApproval ? "Macro applied -- reply submitted for approval" : "Macro applied");
            fetchCase();
        } catch (error: any) {
            toast.error(error?.message || "Failed to apply macro");
        } finally {
            setMacroApplying(false);
        }
    };

    const uploadAttachment = async (file: File) => {
        setAttachmentUploading(true);
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const created = await apiFetch<any>(`/cases/${params.id}/attachments`, {
                method: "POST",
                body: JSON.stringify({ filename: file.name, contentType: file.type, base64 }),
            });
            setAttachments((prev) => [{ ...created, createdAt: new Date().toISOString() }, ...prev]);
            toast.success("Attachment uploaded");
        } catch (error: any) {
            toast.error(error?.message || "Failed to upload attachment");
        } finally {
            setAttachmentUploading(false);
        }
    };

    const userById = new Map(users.map((u) => [u.id, u]));

    // Status and priority change as soon as they're picked; the toast offers Undo (UI/UX plan §5.15).
    const handleFieldChange = async (patch: Record<string, unknown>, undo = true) => {
        const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, record?.[key] ?? null]));
        try {
            const updated = await apiFetch<any>(`/cases/${params.id}`, { method: "PATCH", body: JSON.stringify(patch) });
            setRecord((prev: any) => ({ ...prev, ...updated }));
            const what = "statusId" in patch
                ? `Status: ${statuses.find((status) => status.id === patch.statusId)?.name ?? "changed"}`
                : "priorityId" in patch
                    ? `Priority: ${priorities.find((priority) => priority.id === patch.priorityId)?.name ?? "changed"}`
                    : "Case updated";
            toast.success(what, undo ? { action: { label: "Undo", onClick: () => handleFieldChange(previous, false) } } : undefined);
        } catch (error: any) {
            toast.error(error?.message || "The case couldn't be updated");
        }
    };

    // A suggested article goes into the reply box as a customer-visible reply, for the agent to edit.
    const insertArticle = (article: { title: string; body?: string | null }) => {
        setCommentBody((current) => [current.trim(), article.body?.trim() || article.title].filter(Boolean).join("\n\n"));
        setCommentInternal(false);
        window.setTimeout(() => document.getElementById("case-comment")?.focus(), 0);
        toast.success("Article added to your reply as a customer-visible reply");
    };

    const sendArticleFeedback = async (articleId: string, isHelpful: boolean) => {
        setArticleFeedback((current) => ({ ...current, [articleId]: "sending" }));
        try {
            await apiFetch(`/knowledge-base/articles/${articleId}/feedback`, { method: "POST", body: JSON.stringify({ isHelpful, caseId: params.id }) });
            setArticleFeedback((current) => ({ ...current, [articleId]: "sent" }));
        } catch (error: any) {
            setArticleFeedback((current) => {
                const next = { ...current };
                delete next[articleId];
                return next;
            });
            toast.error(error?.message || "Your feedback couldn't be saved");
        }
    };

    const handleAddComment = async () => {
        if (!commentBody.trim()) return;
        setCommentSubmitting(true);
        try {
            await apiFetch(`/cases/${params.id}/comments`, { method: "POST", body: JSON.stringify({ body: commentBody.trim(), isInternal: commentInternal }) });
            setCommentBody("");
            fetchCase();
        } catch (error: any) {
            toast.error(error?.message || "Failed to add comment");
        } finally {
            setCommentSubmitting(false);
        }
    };

    const handleAssign = async () => {
        if (!assignUserId || !assignReason.trim()) {
            toast.error("Select a user and enter a reason");
            return;
        }
        setAssignSubmitting(true);
        try {
            const updated = await apiFetch<any>(`/cases/${params.id}/assign`, {
                method: "POST",
                body: JSON.stringify({ newOwnerId: assignUserId, reason: assignReason.trim() }),
            });
            setRecord((prev: any) => ({ ...prev, ...updated }));
            toast.success("Case reassigned");
            setAssignOpen(false);
            setAssignUserId("");
            setAssignReason("");
            fetchCase();
        } catch (error: any) {
            toast.error(error?.message || "Failed to reassign case");
        } finally {
            setAssignSubmitting(false);
        }
    };

    if (loading) return <div className="p-4"><PageSkeleton /></div>;
    if (fetchError || !record) {
        return (
            <div className="mx-auto max-w-[900px] p-4">
                <ErrorState description={fetchError ?? "Case not found."} onRetry={fetchCase} />
            </div>
        );
    }


    return (
        <div className="mx-auto min-w-0 max-w-[1400px]">
            <div className="mb-4 flex min-w-0 items-start gap-2">
                <Button variant="ghost" size="icon-sm" aria-label="Back to cases" onClick={() => router.push("/dashboard/cases")}>
                    <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="[overflow-wrap:anywhere] break-words text-2xl font-semibold">{record.subject}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>Case #{record.caseNumber}</span><Badge tone="neutral">{statuses.find(status => status.id === record.statusId)?.name || "Status unavailable"}</Badge></div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <RecordSummary>
                    <Card className="min-w-0 space-y-3 p-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="case-status">Status</Label>
                            <Select value={record.statusId} onValueChange={(value) => handleFieldChange({ statusId: value })}>
                                <SelectTrigger id="case-status" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="case-priority">Priority</Label>
                            <Select value={record.priorityId} onValueChange={(value) => handleFieldChange({ priorityId: value })}>
                                <SelectTrigger id="case-priority" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {priorities.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Owner</Label>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="min-w-0 break-words text-sm">{userById.get(record.ownerId)?.name ?? userById.get(record.ownerId)?.email ?? "Unassigned"}</span>
                                <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                                    <UserCog className="size-4" />
                                    Reassign
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2 border-t pt-3 text-xs">
                            <div>
                                <p className="text-muted-foreground">First response</p>
                                <SlaBadge due={record.firstResponseDueAt} resolvedAt={record.firstRespondedAt ?? record.resolvedAt} />
                            </div>
                            <div>
                                <p className="text-muted-foreground">Resolution</p>
                                <SlaBadge due={record.resolutionDueAt} resolvedAt={record.resolvedAt} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between border-t pt-3">
                            <div className="text-xs">
                                {record.slaPausedAt ? (
                                    <Badge variant="outline" className="gap-1"><Pause className="size-3" />SLA paused</Badge>
                                ) : (
                                    <span className="text-muted-foreground">SLA running</span>
                                )}
                                {record.escalatedAt && <p className="mt-1 text-destructive">Escalated {formatWorkspaceRelativeTime(record.escalatedAt)}</p>}
                            </div>
                            <Button variant="outline" size="sm" onClick={toggleSla} disabled={slaBusy}>
                                {record.slaPausedAt ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                                {record.slaPausedAt ? "Resume" : "Pause"}
                            </Button>
                        </div>
                    </Card>

                    {suggestedArticles.length > 0 && (
                        <Card className="space-y-2 p-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="size-4 text-muted-foreground" />
                                <p className="text-sm font-bold">Suggested articles</p>
                            </div>
                            {suggestedArticles.map((article) => {
                                const open = openArticleId === article.id;
                                return (
                                    <div key={article.id} className="rounded-md border p-2 text-sm">
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            aria-controls={`article-${article.id}`}
                                            onClick={() => setOpenArticleId(open ? null : article.id)}
                                            className="w-full rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {article.title}
                                        </button>
                                        {open ? (
                                            <div id={`article-${article.id}`} className="mt-2 space-y-2">
                                                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{article.body}</p>
                                                <Button size="sm" variant="outline" onClick={() => insertArticle(article)}>Insert in reply</Button>
                                                {articleFeedback[article.id] === "sent" ? (
                                                    <p role="status" className="text-xs text-muted-foreground">Thanks for the feedback</p>
                                                ) : (
                                                    <div role="group" aria-label={`Was ${article.title} helpful?`} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                                        <span className="mr-1">Was this helpful?</span>
                                                        <Button size="xs" variant="ghost" disabled={articleFeedback[article.id] === "sending"} onClick={() => sendArticleFeedback(article.id, true)}>
                                                            <ThumbsUp className="size-3.5" />Yes
                                                        </Button>
                                                        <Button size="xs" variant="ghost" disabled={articleFeedback[article.id] === "sending"} onClick={() => sendArticleFeedback(article.id, false)}>
                                                            <ThumbsDown className="size-3.5" />No
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </Card>
                    )}

                    <Card className="space-y-2 p-4">
                        <button type="button" aria-expanded={historyOpen} className="flex w-full items-center justify-between rounded-sm text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={loadHistory}>
                            <span className="flex items-center gap-2"><History className="size-4 text-muted-foreground" />Communication history</span>
                            <span className="text-xs font-normal text-muted-foreground">{historyOpen ? "Hide" : "Show"}</span>
                        </button>
                        {historyOpen && (
                            history ? (
                                <div className="space-y-2 text-xs">
                                    {history.previousCases?.length > 0 && (
                                        <div>
                                            <p className="font-semibold text-muted-foreground">Previous cases from this requester</p>
                                            {history.previousCases.map((prev: any) => (
                                                <Link key={prev.id} href={`/dashboard/cases/${prev.id}`} className="block text-primary hover:underline">Case #{prev.caseNumber} — {prev.subject}</Link>
                                            ))}
                                        </div>
                                    )}
                                    {[...(history.events ?? []), ...(history.outbox ?? [])].length === 0 ? (
                                        <p className="text-muted-foreground">No prior communications found.</p>
                                    ) : (
                                        [...(history.events ?? []), ...(history.outbox ?? [])].slice(0, 20).map((item: any, index: number) => (
                                            <div key={item.id ?? index} className="flex flex-wrap items-center justify-between border-b pb-1">
                                                <span>{item.channel} — {item.subject || item.eventType || item.status}</span>
                                                <span className="text-muted-foreground">{formatWorkspaceRelativeTime(item.createdAt ?? item.occurredAt)}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">Loading...</p>
                            )
                        )}
                    </Card>

                    {(record.requesterName || record.requesterEmail || record.requesterPhone) && (
                        <Card className="space-y-1 p-4 text-sm">
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Requester</p>
                            {record.requesterName && <p>{record.requesterName}</p>}
                            {record.requesterEmail && <p className="break-all text-muted-foreground">{record.requesterEmail}</p>}
                            {record.requesterPhone && <p className="text-muted-foreground">{record.requesterPhone}</p>}
                        </Card>
                    )}

                    {(record.relatedLeadId || record.relatedOpportunityId) && (
                        <Card className="space-y-1.5 p-4 text-sm">
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Related records</p>
                            {record.relatedLeadId && <Link href={`/dashboard/leads/${record.relatedLeadId}`} className="block text-primary hover:underline">View Lead</Link>}
                            {record.relatedOpportunityId && <Link href={`/dashboard/opportunities/${record.relatedOpportunityId}`} className="block text-primary hover:underline">View Opportunity</Link>}
                        </Card>
                    )}
                </RecordSummary>

                <div className="min-w-0 space-y-4">
                    {record.description && (
                        <Card className="p-4">
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Description</p>
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{record.description}</p>
                        </Card>
                    )}

                    <Card className="p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <MessageSquare className="size-4 text-muted-foreground" />
                            <p className="text-sm font-bold">Comments</p>
                        </div>
                        <div className="space-y-3">
                            {(record.comments ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">No comments yet.</p>
                            ) : (
                                record.comments.map((comment: any) => (
                                    <div key={comment.id} className={cn("rounded-lg border p-3", comment.isInternal ? "bg-muted/40" : "bg-background")}>
                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-bold">{userById.get(comment.authorId)?.name ?? userById.get(comment.authorId)?.email ?? "Unknown"}</span>
                                            <div className="flex items-center gap-2">
                                                {comment.isInternal && (
                                                    <Badge variant="outline" className="gap-1 text-xs">
                                                        <Lock className="size-3" />
                                                        Internal
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground">{formatWorkspaceRelativeTime(comment.createdAt)}</span>
                                            </div>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{comment.body}</p>
                                    </div>
                                ))
                            )}
                        </div>
                        {macros.length > 0 && (
                            <div className="mt-3 flex items-center gap-2 border-t pt-3">
                                <Select value={selectedMacroId} onValueChange={setSelectedMacroId}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Apply a macro..." /></SelectTrigger>
                                    <SelectContent>
                                        {macros.map((macro) => <SelectItem key={macro.id} value={macro.id}>{macro.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" onClick={applyMacro} disabled={!selectedMacroId || macroApplying}>
                                    <Sparkles className="size-3.5" />
                                    Apply
                                </Button>
                            </div>
                        )}
                        <div className="mt-4 space-y-2 border-t pt-3">
                            <Textarea id="case-comment" aria-label="Comment" rows={3} placeholder="Add a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                            <div className="flex flex-wrap items-center justify-between">
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={commentInternal} onCheckedChange={(checked) => setCommentInternal(!!checked)} />
                                    Internal note (not visible to requester)
                                </label>
                                <Button size="sm" onClick={handleAddComment} disabled={commentSubmitting || !commentBody.trim()}>
                                    {commentSubmitting ? "Posting..." : "Post"}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Paperclip className="size-4 text-muted-foreground" />
                                <p className="text-sm font-bold">Attachments</p>
                            </div>
                            {/* A real button that opens the file picker, so it works from the keyboard (UI/UX plan §5.15). */}
                            <Button size="sm" variant="outline" isLoading={attachmentUploading} onClick={() => attachmentInput.current?.click()}>
                                <Paperclip className="size-3.5" />Add file
                            </Button>
                            <input
                                ref={attachmentInput}
                                type="file"
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden
                                disabled={attachmentUploading}
                                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAttachment(file); e.target.value = ""; }}
                            />
                        </div>
                        {attachments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No attachments yet.</p>
                        ) : (
                            <div className="space-y-1">
                                {attachments.map((attachment) => (
                                    <a
                                        key={attachment.id}
                                        href={`/api/case-attachments/${attachment.id}/download`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex flex-wrap items-center justify-between text-sm text-primary hover:underline"
                                    >
                                        <span>{attachment.filename}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card className="p-4">
                        <p className="mb-3 text-sm font-bold">Assignment history</p>
                        {(record.assignmentLog ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No assignment history yet.</p>
                        ) : (
                            <div className="space-y-2 text-sm">
                                {record.assignmentLog.map((entry: any) => (
                                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <span>
                                            Assigned to <span className="font-semibold">{userById.get(entry.assignedToId)?.name ?? userById.get(entry.assignedToId)?.email ?? "Unknown"}</span>
                                            {entry.reason ? ` — ${entry.reason}` : ""}
                                        </span>
                                        <span className="text-muted-foreground">{formatWorkspaceRelativeTime(entry.assignedAt)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <StandardDialog
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                title="Reassign case"
                icon={<LifeBuoy className="size-5" />}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
                        <Button onClick={handleAssign} disabled={assignSubmitting || !assignUserId || !assignReason.trim()}>
                            {assignSubmitting ? "Saving..." : "Reassign"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>New Owner</Label>
                        <Select value={assignUserId} onValueChange={setAssignUserId}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Select a user" /></SelectTrigger>
                            <SelectContent>
                                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || "User"}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Reason</Label>
                        <Textarea rows={2} value={assignReason} onChange={(e) => setAssignReason(e.target.value)} placeholder="Why is this case being reassigned?" />
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}
