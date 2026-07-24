'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import * as Icons from 'lucide-react';
import { toast } from 'sonner';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CreateOpportunityTypeDto, OpportunityType } from '@/types/opportunity-types';

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

function iconPreviewStyles(color?: string) {
    const value = color || '#3b82f6';
    return {
        color: value,
        backgroundColor: `${value}1a`,
        borderColor: `${value}3d`,
    };
}

export function OpportunityTypeDialog({
    open,
    onOpenChange,
    opportunityType,
    onSuccess,
}: OpportunityTypeDialogProps) {
    const [formData, setFormData] = useState<CreateOpportunityTypeDto>({
        name: '',
        description: '',
        icon: '',
        color: '#3b82f6',
    });
    const [loading, setLoading] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
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
            setIconSearch('');
            setIconPickerOpen(false);
            setColorPickerOpen(false);
        }
    }, [open, opportunityType]);

    const handleSubmit = async (event?: FormEvent) => {
        event?.preventDefault();

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

            toast.success(opportunityType ? 'Opportunity type updated' : 'Opportunity type created');
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save opportunity type');
        } finally {
            setLoading(false);
        }
    };

    const SelectedIcon = formData.icon ? (Icons as unknown as Record<string, React.ElementType>)[formData.icon] : null;
    const filteredIcons = COMMON_ICONS.filter((icon) => icon.toLowerCase().includes(iconSearch.toLowerCase()));

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={opportunityType ? 'Edit Opportunity Type' : 'Create Opportunity Type'}
            maxWidth="sm"
            actions={
                <>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleSubmit()} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? 'Saving...' : opportunityType ? 'Update' : 'Create'}
                    </Button>
                </>
            }
        >
            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        required
                        value={formData.name}
                        onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                        placeholder="e.g., Admission, Partnership"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        rows={3}
                        value={formData.description}
                        onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                        placeholder="Brief description of this opportunity type"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Icon</Label>
                        <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-11 w-full justify-start">
                                    <span
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                                        style={iconPreviewStyles(formData.color)}
                                    >
                                        {SelectedIcon ? <SelectedIcon size={16} /> : <Search size={16} />}
                                    </span>
                                    <span className="truncate font-semibold">{formData.icon || 'Select icon'}</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[330px] space-y-3">
                                <Input
                                    placeholder="Search icons"
                                    value={iconSearch}
                                    onChange={(event) => setIconSearch(event.target.value)}
                                />
                                <div className="grid max-h-[220px] grid-cols-6 gap-1.5 overflow-y-auto pr-1">
                                    {filteredIcons.map((iconName) => {
                                        const Icon = (Icons as unknown as Record<string, React.ElementType>)[iconName];
                                        const isSelected = formData.icon === iconName;
                                        return (
                                            <Button
                                                key={iconName}
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                title={iconName}
                                                className={cn(
                                                    'h-10 w-10 rounded-lg',
                                                    isSelected && 'border-primary bg-primary/10 text-primary'
                                                )}
                                                onClick={() => {
                                                    setFormData({ ...formData, icon: iconName });
                                                    setIconPickerOpen(false);
                                                }}
                                            >
                                                <Icon size={18} />
                                            </Button>
                                        );
                                    })}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label>Color</Label>
                        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-11 w-full justify-start">
                                    <span
                                        className="h-7 w-7 shrink-0 rounded-lg border shadow-inner"
                                        style={{ backgroundColor: formData.color || '#3b82f6' }}
                                    />
                                    <span className="font-mono text-sm font-semibold">{formData.color || '#3b82f6'}</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[260px] space-y-3">
                                <p className="text-xs font-semibold text-muted-foreground">Select color</p>
                                <div className="grid grid-cols-6 gap-1.5">
                                    {COLOR_PALETTE.map((color) => {
                                        const isSelected = (formData.color || '#3b82f6').toLowerCase() === color.toLowerCase();
                                        return (
                                            <button
                                                key={color}
                                                type="button"
                                                title={color}
                                                className={cn(
                                                    'flex h-8 w-8 items-center justify-center rounded-lg border-2 text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                                    isSelected ? 'border-foreground' : 'border-transparent'
                                                )}
                                                style={{ backgroundColor: color }}
                                                onClick={() => {
                                                    setFormData({ ...formData, color });
                                                    setColorPickerOpen(false);
                                                }}
                                            >
                                                {isSelected ? <Check className="h-4 w-4 drop-shadow" /> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="opportunity-type-color">Hex</Label>
                                    <Input
                                        id="opportunity-type-color"
                                        value={formData.color || '#3b82f6'}
                                        onChange={(event) => setFormData({ ...formData, color: event.target.value })}
                                        maxLength={7}
                                    />
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </form>
        </StandardDialog>
    );
}
