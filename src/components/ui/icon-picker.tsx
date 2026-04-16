'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

interface IconPickerProps {
    value: string;
    onChange: (icon: string) => void;
}

// Popular icons for CRM
const COMMON_ICONS = [
    'GraduationCap', 'Building2', 'Briefcase', 'Users', 'Target', 'Trophy',
    'DollarSign', 'Heart', 'Star', 'Zap', 'Flame', 'Rocket',
    'TrendingUp', 'BarChart', 'PieChart', 'LineChart', 'Activity', 'Award',
    'Book', 'BookOpen', 'Bookmark', 'Box', 'Calendar', 'Camera',
    'CheckCircle', 'Clock', 'Cloud', 'Code', 'Coffee', 'Compass',
    'CreditCard', 'Database', 'Download', 'Edit', 'Eye', 'File',
    'Filter', 'Flag', 'Folder', 'Gift', 'Globe', 'Grid',
    'Hash', 'Headphones', 'Home', 'Image', 'Inbox', 'Info',
    'Key', 'Layers', 'Layout', 'Lightbulb', 'Link', 'Lock',
    'Mail', 'Map', 'MapPin', 'Maximize', 'Menu', 'MessageCircle',
];

export function IconPicker({ value, onChange }: IconPickerProps) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);

    const filteredIcons = COMMON_ICONS.filter(icon =>
        icon.toLowerCase().includes(search.toLowerCase())
    );

    const SelectedIcon = value ? (Icons as any)[value] : null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                    {SelectedIcon ? (
                        <div className="flex items-center gap-2">
                            <SelectedIcon className="h-4 w-4" />
                            <span>{value}</span>
                        </div>
                    ) : (
                        'Select icon'
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b">
                    <Input
                        placeholder="Search icons..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                    <div className="grid grid-cols-6 gap-1">
                        {filteredIcons.map((iconName) => {
                            const Icon = (Icons as any)[iconName];
                            const isSelected = value === iconName;

                            return (
                                <button
                                    key={iconName}
                                    onClick={() => {
                                        onChange(iconName);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        'p-2 rounded hover:bg-accent relative group',
                                        isSelected && 'bg-accent'
                                    )}
                                    title={iconName}
                                >
                                    <Icon className="h-5 w-5" />
                                    {isSelected && (
                                        <Check className="h-3 w-3 absolute top-0.5 right-0.5 text-primary" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {filteredIcons.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            No icons found
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
