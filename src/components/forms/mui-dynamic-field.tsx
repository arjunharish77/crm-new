'use client';

import React from 'react';
import {
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormControlLabel,
    Checkbox,
    FormHelperText,
    Box,
    Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { CustomFieldDefinition } from '@/types/custom-fields';

interface MuiDynamicFieldProps {
    field: CustomFieldDefinition;
    value: any;
    onChange: (value: any) => void;
    error?: string;
    helperText?: string;
}

export function MuiDynamicField({ field, value, onChange, error, helperText }: MuiDynamicFieldProps) {
    const label = `${field.label}${field.required ? ' *' : ''}`;

    switch (field.type) {
        case 'TEXT':
            return (
                <TextField
                    label={label}
                    fullWidth
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={!!error}
                    helperText={error || helperText}
                />
            );

        case 'NUMBER':
            return (
                <TextField
                    label={label}
                    type="number"
                    fullWidth
                    value={value !== undefined ? value : ''}
                    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
                    error={!!error}
                    helperText={error || helperText}
                />
            );

        case 'DROPDOWN':
            return (
                <FormControl fullWidth error={!!error}>
                    <InputLabel>{label}</InputLabel>
                    <Select
                        label={label}
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                    >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {Array.isArray(field.options) && field.options.map((opt: any) => (
                            <MenuItem key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                                {typeof opt === 'string' ? opt : opt.label}
                            </MenuItem>
                        ))}
                    </Select>
                    {(error || helperText) && <FormHelperText>{error || helperText}</FormHelperText>}
                </FormControl>
            );

        case 'MULTI_SELECT':
            return (
                <FormControl fullWidth error={!!error}>
                    <InputLabel>{label}</InputLabel>
                    <Select
                        label={label}
                        multiple
                        value={Array.isArray(value) ? value : []}
                        onChange={(e) => onChange(e.target.value)}
                    >
                        {Array.isArray(field.options) && field.options.map((opt: any) => (
                            <MenuItem key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                                {typeof opt === 'string' ? opt : opt.label}
                            </MenuItem>
                        ))}
                    </Select>
                    {(error || helperText) && <FormHelperText>{error || helperText}</FormHelperText>}
                </FormControl>
            );

        case 'BOOLEAN':
            return (
                <FormControl error={!!error} component="fieldset">
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!!value}
                                onChange={(e) => onChange(e.target.checked)}
                            />
                        }
                        label={label}
                    />
                    {(error || helperText) && <FormHelperText>{error || helperText}</FormHelperText>}
                </FormControl>
            );

        case 'DATE':
            return (
                <DatePicker
                    label={label}
                    value={value ? new Date(value) : null}
                    onChange={(date: Date | null) => onChange(date?.toISOString() || null)}
                    slotProps={{
                        textField: {
                            fullWidth: true,
                            error: !!error,
                            helperText: error || helperText
                        }
                    }}
                />
            );

        case 'DATETIME':
            return (
                <DateTimePicker
                    label={label}
                    value={value ? new Date(value) : null}
                    onChange={(date: Date | null) => onChange(date?.toISOString() || null)}
                    slotProps={{
                        textField: {
                            fullWidth: true,
                            error: !!error,
                            helperText: error || helperText
                        }
                    }}
                />
            );

        default:
            return (
                <TextField
                    label={label}
                    fullWidth
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={!!error}
                    helperText={error || helperText}
                />
            );
    }
}
