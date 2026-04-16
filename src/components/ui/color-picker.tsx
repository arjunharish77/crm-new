'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
    value: string;
    onChange: (color: string) => void;
}

// Material Design inspired color palette
const COLOR_PALETTE = [
    // Blues
    '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af',
    // Greens
    '#10b981', '#059669', '#047857', '#065f46',
    // Reds
    '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
    // Oranges
    '#f97316', '#ea580c', '#c2410c', '#9a3412',
    // Purples
    '#a855f7', '#9333ea', '#7e22ce', '#6b21a8',
    // Pinks
    '#ec4899', '#db2777', '#be185d', '#9d174d',
    // Teals
    '#14b8a6', '#0d9488', '#0f766e', '#115e59',
    // Indigos
    '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
    // Grays
    '#64748b', '#475569', '#334155', '#1e293b',
];

export function ColorPicker({ value, onChange }: ColorPickerProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                    <div
                        className="h-4 w-4 rounded border"
                        style={{ backgroundColor: value }}
                    />
                    <span className="font-mono text-xs">{value}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-2">
                    <p className="text-sm font-medium">Select color</p>
                    <div className="grid grid-cols-8 gap-2">
                        {COLOR_PALETTE.map((color) => (
                            <button
                                key={color}
                                onClick={() => onChange(color)}
                                className={cn(
                                    'h-8 w-8 rounded border-2 transition-all hover:scale-110',
                                    value === color ? 'border-foreground' : 'border-transparent'
                                )}
                                style={{ backgroundColor: color }}
                                title={color}
                            >
                                {value === color && (
                                    <Check className="h-4 w-4 mx-auto text-white drop-shadow" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
