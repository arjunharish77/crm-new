"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Chip } from "@mui/material";
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { X, Plus, Filter } from "lucide-react";
import {
    FilterCondition,
    FilterConfig,
    FilterField,
    OPERATORS_BY_TYPE,
    FilterOperator,
} from "@/types/filters";
import { nanoid } from "nanoid";

interface FilterBuilderProps {
    fields: FilterField[];
    value: FilterConfig;
    onChange: (config: FilterConfig) => void;
}

export function FilterBuilder({ fields, value, onChange }: FilterBuilderProps) {
    const addCondition = () => {
        const newCondition: FilterCondition = {
            id: nanoid(),
            field: fields[0]?.key || '',
            operator: 'equals',
            value: '',
        };
        onChange({
            ...value,
            conditions: [...value.conditions, newCondition],
        });
    };

    const removeCondition = (id: string) => {
        onChange({
            ...value,
            conditions: value.conditions.filter((c) => c.id !== id),
        });
    };

    const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
        onChange({
            ...value,
            conditions: value.conditions.map((c) =>
                c.id === id ? { ...c, ...updates } : c
            ),
        });
    };

    const toggleLogic = () => {
        onChange({
            ...value,
            logic: value.logic === 'AND' ? 'OR' : 'AND',
        });
    };

    const clearAll = () => {
        onChange({
            conditions: [],
            logic: 'AND',
        });
    };

    const getFieldType = (fieldKey: string) => {
        return fields.find((f) => f.key === fieldKey)?.type || 'text';
    };

    const getFieldOptions = (fieldKey: string) => {
        return fields.find((f) => f.key === fieldKey)?.options || [];
    };

    const getOperators = (fieldType: string) => {
        return OPERATORS_BY_TYPE[fieldType as keyof typeof OPERATORS_BY_TYPE] || OPERATORS_BY_TYPE.text;
    };

    const renderValueInput = (condition: FilterCondition) => {
        const fieldType = getFieldType(condition.field);
        const fieldOptions = getFieldOptions(condition.field);

        // No input needed for is_empty/is_not_empty
        if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
            return null;
        }

        // Select field
        if (fieldType === 'select' && fieldOptions.length > 0) {
            if (condition.operator === 'in' || condition.operator === 'not_in') {
                // Multi-select for 'in' and 'not_in'
                return (
                    <Input
                        placeholder="Comma-separated values"
                        value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value}
                        onChange={(e) => {
                            const values = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
                            updateCondition(condition.id, { value: values });
                        }}
                        className="flex-1"
                    />
                );
            }
            return (
                <Select
                    value={condition.value?.toString() || ''}
                    onValueChange={(val) => updateCondition(condition.id, { value: val })}
                >
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                        {fieldOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }

        // Tags field
        if (fieldType === 'tags') {
            return (
                <Input
                    placeholder="Enter tags (comma-separated)"
                    value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value}
                    onChange={(e) => {
                        const values = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
                        updateCondition(condition.id, { value: values });
                    }}
                    className="flex-1"
                />
            );
        }

        // Date field
        if (fieldType === 'date') {
            return (
                <DatePicker
                    value={condition.value ? new Date(condition.value as string) : null}
                    onChange={(date: Date | null) => updateCondition(condition.id, { value: date ? date.toISOString() : '' })}
                    slotProps={{ textField: { size: 'small', className: "flex-1" } }}
                />
            );
        }

        // Number field
        if (fieldType === 'number') {
            return (
                <Input
                    type="number"
                    placeholder="Enter number"
                    value={condition.value || ''}
                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                    className="flex-1"
                />
            );
        }

        // Boolean field
        if (fieldType === 'boolean') {
            return (
                <Select
                    value={condition.value?.toString() || ''}
                    onValueChange={(val) => updateCondition(condition.id, { value: val === 'true' })}
                >
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                </Select>
            );
        }

        // Default: text input
        return (
            <Input
                placeholder="Enter value"
                value={condition.value || ''}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="flex-1"
            />
        );
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span className="text-sm font-medium">Filters</span>
                    {value.conditions.length > 0 && (
                        <Chip label={value.conditions.length} size="small" color="default" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {value.conditions.length > 1 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleLogic}
                            className="h-7 text-xs"
                        >
                            {value.logic}
                        </Button>
                    )}
                    {value.conditions.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAll}
                            className="h-7 text-xs"
                        >
                            Clear All
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter Conditions */}
            <div className="space-y-2">
                {value.conditions.map((condition, index) => (
                    <div key={condition.id} className="flex items-center gap-2">
                        {index > 0 && (
                            <span className="text-xs text-muted-foreground w-10 text-center">
                                {value.logic}
                            </span>
                        )}
                        {index === 0 && <span className="w-10" />}

                        {/* Field Selector */}
                        <Select
                            value={condition.field}
                            onValueChange={(val) => {
                                const newFieldType = getFieldType(val);
                                const operators = getOperators(newFieldType);
                                updateCondition(condition.id, {
                                    field: val,
                                    operator: operators[0].value,
                                    value: '',
                                });
                            }}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {fields.map((field) => (
                                    <SelectItem key={field.key} value={field.key}>
                                        {field.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Operator Selector */}
                        <Select
                            value={condition.operator}
                            onValueChange={(val) =>
                                updateCondition(condition.id, { operator: val as FilterOperator })
                            }
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {getOperators(getFieldType(condition.field)).map((op) => (
                                    <SelectItem key={op.value} value={op.value}>
                                        {op.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Value Input */}
                        {renderValueInput(condition)}

                        {/* Remove Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCondition(condition.id)}
                            className="h-9 w-9 flex-shrink-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>

            {/* Add Filter Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={addCondition}
                className="w-full"
            >
                <Plus className="h-4 w-4 mr-2" />
                Add Filter
            </Button>
        </div>
    );
}
