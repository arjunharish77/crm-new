'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CustomFieldDefinition } from '@/types/custom-fields';
import { formatWorkspaceDateInput, formatWorkspaceDateTimeInput, workspaceDateInputToIso, workspaceDateTimeInputToIso } from '@/lib/date-format';

interface DynamicFieldProps {
    field: CustomFieldDefinition;
    value: any;
    onChange: (value: any) => void;
    error?: string;
    helperText?: string;
}

function optionValue(opt: any) {
    return typeof opt === 'string' ? opt : opt.value;
}

function optionLabel(opt: any) {
    return typeof opt === 'string' ? opt : opt.label;
}

export function DynamicField({ field, value, onChange, error, helperText }: DynamicFieldProps) {
    const label = `${field.label}${field.required ? ' *' : ''}`;
    const instanceId = React.useId();
    const fieldId = `dynamic-field-${instanceId}-${field.key}`;
    const messageId = `${fieldId}-message`;
    const message = error || helperText;

    switch (field.type) {
        case 'TEXT':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Input
                        id={fieldId}
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}
                    />
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        case 'TEXTAREA':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Textarea id={fieldId} rows={4} value={value || ''} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={message ? messageId : undefined} />
                    {message && <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>}
                </div>
            );

        case 'NUMBER':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Input
                        id={fieldId}
                        type="number"
                        value={value !== undefined && value !== null ? value : ''}
                        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
                        aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}
                    />
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        case 'DROPDOWN':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Select value={value || undefined} onValueChange={onChange}>
                        <SelectTrigger id={fieldId} className="w-full" aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}>
                            <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.isArray(field.options) && field.options.map((opt: any) => (
                                <SelectItem key={optionValue(opt)} value={optionValue(opt)}>
                                    {optionLabel(opt)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        case 'MULTI_SELECT': {
            const selected: string[] = Array.isArray(value) ? value : [];
            const toggle = (optValue: string) => {
                onChange(
                    selected.includes(optValue)
                        ? selected.filter((v) => v !== optValue)
                        : [...selected, optValue]
                );
            };
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label>{label}</Label>
                    <div className={cn('space-y-2 rounded-md border p-3', error && 'border-destructive')}>
                        {Array.isArray(field.options) && field.options.length > 0 ? (
                            field.options.map((opt: any) => {
                                const optValue = optionValue(opt);
                                return (
                                    <label key={optValue} className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={selected.includes(optValue)}
                                            onCheckedChange={() => toggle(optValue)}
                                        />
                                        {optionLabel(opt)}
                                    </label>
                                );
                            })
                        ) : (
                            <p className="text-xs text-muted-foreground">No options configured</p>
                        )}
                    </div>
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );
        }

        case 'BOOLEAN':
            return (
                <div className="min-w-0 space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                            checked={!!value}
                            onCheckedChange={(checked) => onChange(!!checked)}
                        />
                        {label}
                    </label>
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        case 'DATE':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Input
                        id={fieldId}
                        type="date"
                        value={formatWorkspaceDateInput(value)}
                        onChange={(e) => onChange(workspaceDateInputToIso(e.target.value))}
                        aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}
                    />
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        case 'DATETIME':
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Input
                        id={fieldId}
                        type="datetime-local"
                        value={formatWorkspaceDateTimeInput(value)}
                        onChange={(e) => onChange(workspaceDateTimeInputToIso(e.target.value))}
                        aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}
                    />
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );

        default:
            return (
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={fieldId} className="break-words">{label}</Label>
                    <Input
                        id={fieldId}
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        aria-invalid={!!error}
                        aria-describedby={message ? messageId : undefined}
                    />
                    {message && (
                        <p id={messageId} className={cn('break-words text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
                    )}
                </div>
            );
    }
}
