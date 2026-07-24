'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Pin, PinOff, Pencil, Trash2, Send, StickyNote, Loader2, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatWorkspaceRelativeTime, parseWorkspaceDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';

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
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [content, setContent] = useState('');
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [editContent, setEditContent] = useState('');
    const textRef = useRef<HTMLTextAreaElement>(null);

    const fetchNotes = async () => {
        try {
            const data = await apiFetch<Note[]>(`/notes?entityType=${entityType}&entityId=${entityId}`);
            setNotes(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load notes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (entityId) fetchNotes();
    }, [entityId, entityType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;
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
            toast.error('Failed to add note');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (note: Note) => {
        if (!editContent.trim()) return;
        try {
            const updated = await apiFetch<Note>(`/notes/${note.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ content: editContent.trim() }),
            });
            setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
            setEditingNote(null);
            toast.success('Note updated');
        } catch {
            toast.error('Failed to update note');
        }
    };

    const handleDelete = async (noteId: string) => {
        if (!confirm('Delete this note?')) return;
        try {
            await apiFetch(`/notes/${noteId}`, { method: 'DELETE' });
            setNotes(prev => prev.filter(n => n.id !== noteId));
            toast.success('Note deleted');
        } catch {
            toast.error('Failed to delete note');
        }
    };

    const handlePin = async (noteId: string) => {
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
            toast.error('Failed to toggle pin');
        }
    };

    const startEdit = (note: Note) => {
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
                <Badge variant="secondary" className="h-[18px] rounded-md text-[0.7rem]">
                    {notes.length}
                </Badge>
            </div>

            {/* Compose */}
            <form
                onSubmit={handleSubmit}
                className="overflow-hidden rounded-[10px] border transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"
            >
                <Textarea
                    ref={textRef}
                    rows={3}
                    placeholder="Add a note…"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="min-h-16 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <div className="flex justify-end border-t bg-muted/40 px-2 py-1.5">
                    <Button
                        type="submit"
                        disabled={!content.trim() || submitting}
                        size="icon-sm"
                        className="rounded-lg"
                    >
                        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </Button>
                </div>
            </form>

            {/* Notes List */}
            {loading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : notes.length === 0 ? (
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
                                "rounded-[10px] border p-3 transition-colors",
                                note.isPinned ? "border-amber-500 bg-amber-500/[0.04]" : "border-border bg-card"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <Avatar className="size-7 text-[0.72rem]">
                                    <AvatarFallback>{note.author.name[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-bold">
                                                {note.author.name}
                                            </span>
                                            {note.isPinned && (
                                                <Badge className="h-4 gap-0.5 rounded-[5px] bg-amber-500 text-[0.6rem] text-white hover:bg-amber-500">
                                                    <Pin className="size-2.5" />
                                                    Pinned
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-xs text-muted-foreground/60">
                                                {formatWorkspaceRelativeTime(note.createdAt)}
                                            </span>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        size="icon-xs"
                                                        variant="ghost"
                                                        onClick={() => handlePin(note.id)}
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
                                                                onClick={() => startEdit(note)}
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
                                                                onClick={() => handleDelete(note.id)}
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
                                                value={editContent}
                                                onChange={e => setEditContent(e.target.value)}
                                                autoFocus
                                                className="text-sm"
                                            />
                                            <div className="mt-2 flex gap-1.5">
                                                <Button
                                                    size="icon-sm"
                                                    onClick={() => handleEdit(note)}
                                                >
                                                    <Send className="size-4" />
                                                </Button>
                                                <Button
                                                    size="icon-sm"
                                                    variant="ghost"
                                                    onClick={() => setEditingNote(null)}
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
