'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Pin, PinOff, Pencil, Trash2, Send, StickyNote, Loader2, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/common/error-state';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatWorkspaceRelativeTime, parseWorkspaceDate } from '@/lib/date-format';
import { useRetainedEditorDraft } from '@/providers/editor-draft-provider';
import { useEditorDismissGuard } from '@/hooks/use-editor-dismiss-guard';
import { cn } from '@/lib/utils';
import { useConfirm } from "@/components/common/dialogs-provider";

interface NoteAuthor {
    id: string;
    name: string;
    email: string;
}

interface Note {
    id: string;
    content: string;
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
    author: NoteAuthor;
}

interface NotesPanelProps {
    entityType: 'lead' | 'opportunity' | 'activity';
    entityId: string;
    currentUserId?: string;
}

export function NotesPanel({ entityType, entityId, currentUserId }: NotesPanelProps) {
    const confirmAction = useConfirm();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const newDraft = useRetainedEditorDraft(`notes:new:${entityType}:${entityId}`);
    const editDraft = useRetainedEditorDraft(`notes:edit:${entityType}:${entityId}`);
    const content: string = newDraft.draft.values?.content ?? '';
    const submitting = newDraft.draft.pending;
    const setSubmitting = (pending: boolean) => newDraft.update({ pending });
    const setContent = (content: string) => newDraft.update({ values: content ? { content } : null, dirty: !!content.trim() });
    const editingNote: Note | null = editDraft.draft.values?.note ?? null;
    const editContent: string = editDraft.draft.values?.content ?? '';
    const setEditingNote = (note: Note | null) => editDraft.update({ values: note ? { note, content: note.content } : null, dirty: false });
    const setEditContent = (content: string) => {
        const note = editDraft.current().values?.note;
        editDraft.update({ values: note ? { note, content } : null, dirty: !!note && content !== note.content });
    };
    const textRef = useRef<HTMLTextAreaElement>(null);

    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const saveError = newDraft.draft.error;
    const setSaveError = (error: string) => newDraft.update({ error });
    const submittingRef = useRef(false);
    const actionRef = useRef(false);
    const pendingAction = editDraft.draft.pending;
    const setPendingAction = (pending: boolean) => editDraft.update({ pending });
    const actionError = editDraft.draft.error;
    const setActionError = (error: string) => editDraft.update({ error });
    useEditorDismissGuard(!!content.trim(), submitting);
    const canDismissEdit = useEditorDismissGuard(!!editingNote && editContent !== editingNote.content, !!editingNote && pendingAction);
    // Load once per record (and per Retry). Every action already updates `notes` locally, so a
    // finished add/edit/delete must not clear and reload the list (UI/UX plan B10: flicker, lost
    // scroll and focus). The load still waits while a retained save is pending, so a panel that
    // remounts mid-save loads once that save has settled.
    const loadedKey = useRef<string | null>(null);
    useEffect(() => {
        const key = `${entityType}:${entityId}:${attempt}`;
        if (submitting || pendingAction || loadedKey.current === key) return;
        loadedKey.current = key;
        const controller = new AbortController();
        let settled = false;
        setLoading(true);
        setLoadError(false);
        setNotes([]);
        apiFetch<Note[]>(`/notes?entityType=${entityType}&entityId=${entityId}`, { signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setNotes(Array.isArray(data) ? data : []); })
            .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
            .finally(() => { settled = true; if (!controller.signal.aborted) setLoading(false); });
        return () => {
            // Interrupted before it finished: let the next run load again.
            if (!settled && loadedKey.current === key) loadedKey.current = null;
            controller.abort();
        };
    }, [entityId, entityType, attempt, submitting, pendingAction]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || submittingRef.current || actionRef.current || newDraft.current().pending || editDraft.current().pending || loading || loadError) return;
        submittingRef.current = true;
        setSaveError('');
        setSubmitting(true);
        try {
            const note = await apiFetch<Note>('/notes', {
                method: 'POST',
                body: JSON.stringify({ entityType, entityId, content: content.trim() }),
            });
            setNotes(prev => [note, ...prev]);
            setContent('');
            toast.success('Note added');
        } catch {
            setSaveError('Note could not be added. Your draft is still here.');
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const handleEdit = async (note: Note) => {
        if (!editContent.trim() || actionRef.current || submittingRef.current || newDraft.current().pending || editDraft.current().pending) return;
        actionRef.current = true;
        setPendingAction(true);
        setActionError('');
        try {
            const updated = await apiFetch<Note>(`/notes/${note.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ content: editContent.trim() }),
            });
            setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
            setEditingNote(null);
            toast.success('Note updated');
        } catch {
            setActionError('Note could not be updated. Your edits are still here.');
        } finally {
            actionRef.current = false;
            setPendingAction(false);
        }
    };

    const handleDelete = async (noteId: string) => {
        if (actionRef.current || submittingRef.current) return;
        if (!(await confirmAction({ title: 'Delete note?', description: 'This note will be deleted.', confirmLabel: 'Delete note', destructive: true }))) return;
        if (actionRef.current || submittingRef.current) return;
        actionRef.current = true;
        setPendingAction(true);
        setActionError('');
        try {
            await apiFetch(`/notes/${noteId}`, { method: 'DELETE' });
            setNotes(prev => prev.filter(n => n.id !== noteId));
            toast.success('Note deleted');
        } catch {
            setActionError('Note could not be deleted. It is still in the list.');
        } finally {
            actionRef.current = false;
            setPendingAction(false);
        }
    };

    const handlePin = async (noteId: string) => {
        if (actionRef.current || submittingRef.current) return;
        actionRef.current = true;
        setPendingAction(true);
        setActionError('');
        try {
            const updated = await apiFetch<Note>(`/notes/${noteId}/pin`, { method: 'POST' });
            setNotes(prev => [
                ...prev.filter(n => n.id !== noteId),
                updated,
            ].sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return (parseWorkspaceDate(b.createdAt)?.getTime() ?? 0) - (parseWorkspaceDate(a.createdAt)?.getTime() ?? 0);
            }));
        } catch {
            setActionError('Note pin could not be changed.');
        } finally {
            actionRef.current = false;
            setPendingAction(false);
        }
    };

    const startEdit = (note: Note) => {
        if (!canDismissEdit()) return;
        setActionError('');
        setEditingNote(note);
        setEditContent(note.content);
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center gap-2">
                <StickyNote className="size-5 text-primary" />
                <span className="text-base font-bold">
                    Notes
                </span>
                <Badge variant="secondary" className="h-[18px] rounded-md text-xs">
                    {notes.length}
                </Badge>
            </div>

            {/* Compose */}
            <form
                onSubmit={handleSubmit}
                className="overflow-hidden rounded-xl border transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"
            >
                <Textarea
                    ref={textRef}
                    rows={3}
                    aria-label="New note" disabled={submitting || pendingAction || loading || loadError} placeholder="Add a note…"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="min-h-16 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/40 px-2 py-1.5">
                    {!!content.trim() && <Button type="button" variant="ghost" size="sm" disabled={submitting || pendingAction} onClick={async () => {
                        if (await confirmAction({ title: "Discard note?", description: "Your unsaved note will be lost.", confirmLabel: "Discard", destructive: true })) { setContent(''); setSaveError(''); }
                    }}>Discard note draft</Button>}
                    <Button
                        type="submit"
                        aria-label="Add note" disabled={!content.trim() || submitting || pendingAction || loading || loadError}
                        size="icon-sm"
                        className="rounded-lg"
                    >
                        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </Button>
                </div>
            </form>

            {(newDraft.draft.dirty || editDraft.draft.dirty) && <p role="status" className="text-xs text-muted-foreground">Unsubmitted notes are kept while you navigate in this app. Refreshing or signing out clears them.</p>}
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            {actionError && <p role="alert" className="break-words text-sm text-destructive">{actionError}</p>}
            {pendingAction && <p role="status" className="text-sm text-muted-foreground">Updating note…</p>}
            {/* Notes List */}
            {loading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : loadError ? <ErrorState description="Notes could not be loaded." onRetry={() => setAttempt(value => value + 1)} /> : notes.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground/60">
                    <StickyNote className="mx-auto mb-2 size-8" />
                    <p className="text-sm">No notes yet. Add one above!</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {notes.map(note => (
                        <div
                            key={note.id}
                            className={cn(
                                "rounded-xl border p-3 transition-colors",
                                note.isPinned ? "border-amber-500 bg-amber-500/[0.04]" : "border-border bg-card"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <Avatar className="size-7 shrink-0 text-xs">
                                    <AvatarFallback>{note.author.name[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                                            <span className="min-w-0 max-w-full break-words text-xs font-bold">
                                                {note.author.name}
                                            </span>
                                            {note.isPinned && (
                                                <Badge className="h-4 gap-0.5 rounded-md bg-amber-500 text-xs text-black hover:bg-amber-500">
                                                    <Pin className="size-2.5" />
                                                    Pinned
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-0.5">
                                            <span className="text-xs text-muted-foreground/60">
                                                {formatWorkspaceRelativeTime(note.createdAt)}
                                            </span>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        size="icon-xs"
                                                        variant="ghost"
                                                        aria-label={note.isPinned ? "Unpin note" : "Pin note"} disabled={pendingAction || submitting} onClick={() => handlePin(note.id)}
                                                    >
                                                        {note.isPinned ? <Pin className="size-3.5 text-amber-500" /> : <PinOff className="size-3.5" />}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>{note.isPinned ? 'Unpin' : 'Pin'}</TooltipContent>
                                            </Tooltip>
                                            {note.author.id === currentUserId && (
                                                <>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                aria-label="Edit note" disabled={pendingAction || submitting} onClick={() => startEdit(note)}
                                                            >
                                                                <Pencil className="size-3.5" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Edit</TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                size="icon-xs"
                                                                variant="ghost"
                                                                aria-label="Delete note" disabled={pendingAction || submitting} onClick={() => handleDelete(note.id)}
                                                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Delete</TooltipContent>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {editingNote?.id === note.id ? (
                                        <div className="mt-2">
                                            <Textarea
                                                aria-label="Edit note content" disabled={pendingAction || submitting} value={editContent}
                                                onChange={e => setEditContent(e.target.value)}
                                                autoFocus
                                                className="text-sm"
                                            />
                                            <div className="mt-2 flex gap-1.5">
                                                <Button
                                                    size="icon-sm"
                                                    aria-label="Save note changes" disabled={pendingAction || submitting} onClick={() => handleEdit(note)}
                                                >
                                                    <Send className="size-4" />
                                                </Button>
                                                <Button
                                                    size="icon-sm"
                                                    variant="ghost"
                                                    aria-label="Cancel note editing" disabled={pendingAction || submitting} onClick={() => { if (canDismissEdit()) setEditingNote(null); }}
                                                >
                                                    <X className="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                            {note.content}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
