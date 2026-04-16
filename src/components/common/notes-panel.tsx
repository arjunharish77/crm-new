'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
    Box,
    Typography,
    TextField,
    IconButton,
    Avatar,
    Stack,
    Chip,
    Tooltip,
    Divider,
    CircularProgress,
    alpha,
    useTheme,
} from '@mui/material';
import {
    PushPin as PinIcon,
    PushPinOutlined as PinOutlinedIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Send as SendIcon,
    Add as AddIcon,
    StickyNote2 as NoteIcon,
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

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
    const theme = useTheme();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [content, setContent] = useState('');
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [editContent, setEditContent] = useState('');
    const textRef = useRef<HTMLInputElement>(null);

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
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Header */}
            <Stack direction="row" spacing={1} alignItems="center">
                <NoteIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                <Typography variant="subtitle1" fontWeight={700}>
                    Notes
                </Typography>
                <Chip
                    label={notes.length}
                    size="small"
                    sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'action.selected' }}
                />
            </Stack>

            {/* Compose */}
            <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 3,
                    overflow: 'hidden',
                    '&:focus-within': {
                        borderColor: 'primary.main',
                        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                    },
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                }}
            >
                <TextField
                    inputRef={textRef}
                    multiline
                    minRows={2}
                    maxRows={6}
                    fullWidth
                    placeholder="Add a note…"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    variant="filled"
                    sx={{
                        '& .MuiFilledInput-root': {
                            bgcolor: 'transparent',
                            '&::before, &::after': { display: 'none' },
                        },
                    }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
                    <IconButton
                        type="submit"
                        disabled={!content.trim() || submitting}
                        size="small"
                        color="primary"
                        sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, '&:disabled': { bgcolor: 'action.disabled' } }}
                    >
                        {submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon fontSize="small" />}
                    </IconButton>
                </Box>
            </Box>

            {/* Notes List */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : notes.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
                    <NoteIcon sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="body2">No notes yet. Add one above!</Typography>
                </Box>
            ) : (
                <Stack spacing={1.5}>
                    {notes.map(note => (
                        <Box
                            key={note.id}
                            sx={{
                                p: 2,
                                borderRadius: 3,
                                border: '1px solid',
                                borderColor: note.isPinned ? 'warning.main' : 'divider',
                                bgcolor: note.isPinned
                                    ? alpha(theme.palette.warning.main, 0.04)
                                    : 'background.paper',
                                transition: 'border-color 0.2s',
                            }}
                        >
                            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                                    {note.author.name[0].toUpperCase()}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography variant="caption" fontWeight={700}>
                                                {note.author.name}
                                            </Typography>
                                            {note.isPinned && (
                                                <Chip
                                                    label="Pinned"
                                                    size="small"
                                                    icon={<PinIcon sx={{ fontSize: '10px !important' }} />}
                                                    sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'warning.main', color: 'warning.contrastText' }}
                                                />
                                            )}
                                        </Stack>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <Typography variant="caption" color="text.disabled">
                                                {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                                            </Typography>
                                            <Tooltip title={note.isPinned ? 'Unpin' : 'Pin'}>
                                                <IconButton size="small" onClick={() => handlePin(note.id)}>
                                                    {note.isPinned ? <PinIcon sx={{ fontSize: 14 }} color="warning" /> : <PinOutlinedIcon sx={{ fontSize: 14 }} />}
                                                </IconButton>
                                            </Tooltip>
                                            {note.author.id === currentUserId && (
                                                <>
                                                    <Tooltip title="Edit">
                                                        <IconButton size="small" onClick={() => startEdit(note)}>
                                                            <EditIcon sx={{ fontSize: 14 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" onClick={() => handleDelete(note.id)} color="error">
                                                            <DeleteIcon sx={{ fontSize: 14 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}
                                        </Stack>
                                    </Stack>

                                    {editingNote?.id === note.id ? (
                                        <Box sx={{ mt: 1 }}>
                                            <TextField
                                                multiline
                                                fullWidth
                                                size="small"
                                                value={editContent}
                                                onChange={e => setEditContent(e.target.value)}
                                                autoFocus
                                            />
                                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => handleEdit(note)}
                                                    sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                                                >
                                                    <SendIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => setEditingNote(null)}>
                                                    ✕
                                                </IconButton>
                                            </Stack>
                                        </Box>
                                    ) : (
                                        <Typography
                                            variant="body2"
                                            sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}
                                        >
                                            {note.content}
                                        </Typography>
                                    )}
                                </Box>
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
