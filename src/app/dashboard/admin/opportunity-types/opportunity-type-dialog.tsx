'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    Grid,
    Typography,
    Popover,
    Stack,
    IconButton,
    alpha,
    useTheme,
} from '@mui/material';
import { Check as CheckIcon, Search as SearchIcon } from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { OpportunityType, CreateOpportunityTypeDto } from '@/types/opportunity-types';
import { StandardDialog } from '@/components/common/standard-dialog';
import * as Icons from 'lucide-react';

interface OpportunityTypeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    opportunityType?: OpportunityType | null;
    onSuccess: () => void;
}

const COMMON_ICONS = [
    'GraduationCap', 'Building2', 'Briefcase', 'Users', 'Target', 'Trophy',
    'DollarSign', 'Star', 'Zap', 'Rocket', 'TrendingUp', 'Award',
    'BookOpen', 'Calendar', 'CheckCircle', 'Clock', 'Compass', 'CreditCard',
    'Database', 'FileText', 'Flag', 'Folder', 'Globe', 'Grid',
    'Headphones', 'Home', 'Inbox', 'Layers', 'Layout', 'Lightbulb',
    'Mail', 'MapPin', 'MessageCircle', 'Phone', 'School', 'Sparkles',
];

const COLOR_PALETTE = [
    '#3b82f6', '#2563eb', '#0ea5e9', '#06b6d4',
    '#10b981', '#059669', '#22c55e', '#84cc16',
    '#f97316', '#ea580c', '#f59e0b', '#eab308',
    '#ef4444', '#dc2626', '#ec4899', '#db2777',
    '#a855f7', '#9333ea', '#6366f1', '#4f46e5',
    '#14b8a6', '#0d9488', '#64748b', '#334155',
];

export function OpportunityTypeDialog({
    open,
    onOpenChange,
    opportunityType,
    onSuccess,
}: OpportunityTypeDialogProps) {
    const theme = useTheme();
    const [formData, setFormData] = useState<CreateOpportunityTypeDto>({
        name: '',
        description: '',
        icon: '',
        color: '#3b82f6',
    });
    const [loading, setLoading] = useState(false);
    const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
    const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
    const [iconSearch, setIconSearch] = useState('');

    useEffect(() => {
        if (open) {
            if (opportunityType) {
                setFormData({
                    name: opportunityType.name,
                    description: opportunityType.description || '',
                    icon: opportunityType.icon || '',
                    color: opportunityType.color || '#3b82f6',
                });
            } else {
                setFormData({
                    name: '',
                    description: '',
                    icon: '',
                    color: '#3b82f6',
                });
            }
        }
    }, [open, opportunityType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error('Name is required');
            return;
        }

        setLoading(true);
        try {
            const url = opportunityType
                ? `/opportunity-types/${opportunityType.id}`
                : '/opportunity-types';
            const method = opportunityType ? 'PATCH' : 'POST';

            await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            toast.success(
                opportunityType
                    ? 'Opportunity type updated'
                    : 'Opportunity type created'
            );
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save opportunity type');
        } finally {
            setLoading(false);
        }
    };

    const SelectedIcon = formData.icon ? (Icons as any)[formData.icon] : null;
    const filteredIcons = COMMON_ICONS.filter((icon) => icon.toLowerCase().includes(iconSearch.toLowerCase()));

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={opportunityType ? 'Edit Opportunity Type' : 'Create Opportunity Type'}
            maxWidth="sm"
            actions={
                <>
                    <Button onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? 'Saving...' : opportunityType ? 'Update' : 'Create'}
                    </Button>
                </>
            }
        >
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                <Grid container spacing={2}>
                    {/* Name */}
                    <Grid size={{ xs: 12 }}>
                        <TextField
                            id="name"
                            label="Name"
                            fullWidth
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Admission, Partnership"
                        />
                    </Grid>

                    {/* Description */}
                    <Grid size={{ xs: 12 }}>
                        <TextField
                            id="description"
                            label="Description"
                            fullWidth
                            multiline
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Brief description of this opportunity type"
                        />
                    </Grid>

                    {/* Icon & Color */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Icon</Typography>
                            <Button
                                variant="outlined"
                                onClick={(event) => setIconAnchor(event.currentTarget)}
                                sx={{
                                    height: 44,
                                    justifyContent: 'flex-start',
                                    borderRadius: '10px',
                                    borderColor: 'divider',
                                    px: 1.25,
                                    gap: 1,
                                    color: 'text.primary',
                                    textTransform: 'none',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: alpha(formData.color || theme.palette.primary.main, 0.1),
                                        color: formData.color || theme.palette.primary.main,
                                        border: '1px solid',
                                        borderColor: alpha(formData.color || theme.palette.primary.main, 0.24),
                                        flexShrink: 0,
                                    }}
                                >
                                    {SelectedIcon ? <SelectedIcon size={16} /> : <SearchIcon sx={{ fontSize: 16 }} />}
                                </Box>
                                <Typography variant="body2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {formData.icon || 'Select icon'}
                                </Typography>
                            </Button>
                        </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Color</Typography>
                            <Button
                                variant="outlined"
                                onClick={(event) => setColorAnchor(event.currentTarget)}
                                sx={{
                                    height: 44,
                                    justifyContent: 'flex-start',
                                    borderRadius: '10px',
                                    borderColor: 'divider',
                                    px: 1.25,
                                    gap: 1,
                                    color: 'text.primary',
                                    textTransform: 'none',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '8px',
                                        bgcolor: formData.color || '#3b82f6',
                                        border: '1px solid',
                                        borderColor: alpha(theme.palette.common.black, 0.12),
                                        boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.common.white, 0.36)}`,
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                                    {formData.color || '#3b82f6'}
                                </Typography>
                            </Button>
                        </Box>
                    </Grid>
                </Grid>
            </Box>

            <Popover
                open={Boolean(iconAnchor)}
                anchorEl={iconAnchor}
                onClose={() => setIconAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { zIndex: (theme) => theme.zIndex.modal + 2, p: 1.25, width: 330, borderRadius: 2 } }}
            >
                <Stack spacing={1}>
                    <TextField
                        size="small"
                        placeholder="Search icons"
                        value={iconSearch}
                        onChange={(event) => setIconSearch(event.target.value)}
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.75, maxHeight: 220, overflowY: 'auto', pr: 0.25 }}>
                        {filteredIcons.map((iconName) => {
                            const Icon = (Icons as any)[iconName];
                            const isSelected = formData.icon === iconName;
                            return (
                                <IconButton
                                    key={iconName}
                                    title={iconName}
                                    onClick={() => {
                                        setFormData({ ...formData, icon: iconName });
                                        setIconAnchor(null);
                                    }}
                                    sx={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '10px',
                                        border: '1px solid',
                                        borderColor: isSelected ? 'primary.main' : 'divider',
                                        bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                                        color: isSelected ? 'primary.main' : 'text.secondary',
                                    }}
                                >
                                    <Icon size={18} />
                                </IconButton>
                            );
                        })}
                    </Box>
                </Stack>
            </Popover>

            <Popover
                open={Boolean(colorAnchor)}
                anchorEl={colorAnchor}
                onClose={() => setColorAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { zIndex: (theme) => theme.zIndex.modal + 2, p: 1.25, width: 260, borderRadius: 2 } }}
            >
                <Stack spacing={1}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Select color</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.75 }}>
                        {COLOR_PALETTE.map((color) => {
                            const isSelected = (formData.color || '#3b82f6').toLowerCase() === color.toLowerCase();
                            return (
                                <IconButton
                                    key={color}
                                    title={color}
                                    onClick={() => {
                                        setFormData({ ...formData, color });
                                        setColorAnchor(null);
                                    }}
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '9px',
                                        bgcolor: color,
                                        border: '2px solid',
                                        borderColor: isSelected ? 'text.primary' : 'transparent',
                                        color: '#fff',
                                        '&:hover': { bgcolor: color, transform: 'translateY(-1px)' },
                                    }}
                                >
                                    {isSelected ? <CheckIcon sx={{ fontSize: 16, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }} /> : null}
                                </IconButton>
                            );
                        })}
                    </Box>
                    <TextField
                        size="small"
                        label="Hex"
                        value={formData.color || '#3b82f6'}
                        onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                        inputProps={{ maxLength: 7 }}
                    />
                </Stack>
            </Popover>
        </StandardDialog>
    );
}
