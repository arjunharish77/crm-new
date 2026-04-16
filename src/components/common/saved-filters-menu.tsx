'use client';

import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    TextField,
    Button,
    IconButton,
    Tooltip,
    Menu,
    MenuItem as MuiMenuItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip,
    alpha,
    useTheme,
    CircularProgress,
} from '@mui/material';
import {
    BookmarkBorder as BookmarkIcon,
    Bookmark as BookmarkFilledIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    FilterAlt as FilterIcon,
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface SavedFilter {
    id: string;
    name: string;
    module: string;
    filters: any;
    columns?: string[];
    isDefault: boolean;
    isShared: boolean;
    user?: { name: string };
}

interface SavedFiltersMenuProps {
    /** Which module these filters belong to (e.g. 'leads', 'opportunities') */
    module: string;
    /** The current active filter config */
    activeFilter?: any;
    /** Called when a saved filter is selected */
    onApply: (filters: any) => void;
    /** Called when filter is cleared */
    onClear?: () => void;
}

export function SavedFiltersMenu({ module, activeFilter, onApply, onClear }: SavedFiltersMenuProps) {
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [views, setViews] = useState<SavedFilter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveAsDefault, setSaveAsDefault] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);

    const open = Boolean(anchorEl);

    const fetchViews = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const data = await apiFetch<SavedFilter[]>(`/saved-views?module=${module}`);
            setViews(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load saved filters');
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
        fetchViews();
    };

    const handleClose = () => setAnchorEl(null);

    const handleApply = (view: SavedFilter) => {
        setActiveViewId(view.id);
        onApply(view.filters);
        handleClose();
    };

    const handleSave = async () => {
        if (!saveName.trim()) return;
        setSaving(true);
        try {
            const saved = await apiFetch<SavedFilter>('/saved-views', {
                method: 'POST',
                body: JSON.stringify({
                    name: saveName.trim(),
                    module,
                    filters: activeFilter || {},
                    isDefault: saveAsDefault,
                }),
            });
            setViews(prev => [saved, ...prev]);
            setActiveViewId(saved.id);
            setSaveDialogOpen(false);
            setSaveName('');
            setSaveAsDefault(false);
            toast.success('Filter saved');
        } catch {
            toast.error('Failed to save filter');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (viewId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await apiFetch(`/saved-views/${viewId}`, { method: 'DELETE' });
            setViews(prev => prev.filter(v => v.id !== viewId));
            if (activeViewId === viewId) {
                setActiveViewId(null);
                onClear?.();
            }
            toast.success('Filter deleted');
        } catch {
            toast.error('Failed to delete filter');
        }
    };

    const handleClear = () => {
        setActiveViewId(null);
        onClear?.();
        handleClose();
    };

    const activeView = views.find(v => v.id === activeViewId);

    return (
        <>
            <Tooltip title="Saved Filters">
                <Box
                    onClick={handleOpen}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: activeView ? 'primary.main' : 'divider',
                        bgcolor: activeView ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                        transition: 'all 0.15s',
                    }}
                >
                    <FilterIcon sx={{ fontSize: 16, color: activeView ? 'primary.main' : 'text.secondary' }} />
                    <Typography variant="caption" fontWeight={600} color={activeView ? 'primary.main' : 'text.secondary'}>
                        {activeView ? activeView.name : 'Saved Filters'}
                    </Typography>
                </Box>
            </Tooltip>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                PaperProps={{ sx: { minWidth: 260, borderRadius: 3, mt: 0.5 } }}
            >
                {/* Save current filter action */}
                <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        startIcon={<AddIcon />}
                        onClick={() => { handleClose(); setSaveDialogOpen(true); }}
                        disabled={!activeFilter || Object.keys(activeFilter).length === 0}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Save current filter
                    </Button>
                </Box>

                <Divider />

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                    </Box>
                ) : views.length === 0 ? (
                    <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.disabled">No saved filters yet</Typography>
                    </Box>
                ) : (
                    <>
                        {activeViewId && (
                            <MuiMenuItem onClick={handleClear} dense>
                                <ListItemText
                                    primary="Clear filter"
                                    primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                                />
                            </MuiMenuItem>
                        )}
                        {views.map(view => (
                            <MuiMenuItem
                                key={view.id}
                                onClick={() => handleApply(view)}
                                dense
                                selected={view.id === activeViewId}
                                sx={{ borderRadius: 1, mx: 0.5 }}
                            >
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                    {view.isDefault
                                        ? <StarIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                                        : <BookmarkIcon sx={{ fontSize: 14 }} />}
                                </ListItemIcon>
                                <ListItemText
                                    primary={view.name}
                                    secondary={view.isShared ? `by ${view.user?.name}` : undefined}
                                    primaryTypographyProps={{ variant: 'body2', fontWeight: view.isDefault ? 700 : 400 }}
                                    secondaryTypographyProps={{ variant: 'caption' }}
                                />
                                {!view.isShared && (
                                    <IconButton
                                        size="small"
                                        onClick={(e) => handleDelete(view.id, e)}
                                        sx={{ opacity: 0, '.MuiMenuItem-root:hover &': { opacity: 1 } }}
                                    >
                                        <DeleteIcon sx={{ fontSize: 14 }} color="error" />
                                    </IconButton>
                                )}
                            </MuiMenuItem>
                        ))}
                    </>
                )}
            </Menu>

            {/* Save dialog */}
            <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>Save Current Filter</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Filter name"
                        placeholder="e.g. Hot leads this week"
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        size="small"
                        sx={{ mt: 1 }}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                    <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <input
                            type="checkbox"
                            id="save-default"
                            checked={saveAsDefault}
                            onChange={e => setSaveAsDefault(e.target.checked)}
                        />
                        <label htmlFor="save-default" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                            Set as default view
                        </label>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ pb: 2, px: 3 }}>
                    <Button onClick={() => setSaveDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!saveName.trim() || saving}
                        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                    >
                        {saving ? <CircularProgress size={16} /> : 'Save Filter'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
