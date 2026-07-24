
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPERATORS_BY_TYPE, type FilterField, type FilterFieldType, type FilterOperator } from '@/types/filters';
import { formatWorkspaceDateInput, workspaceDateInputToIso } from '@/lib/date-format';

export interface FilterCondition {
    id: string;
    field: string;
    operator: string;
    value: any;
}

export interface FilterGroup {
    id: string;
    logic: 'AND' | 'OR';
    conditions: FilterCondition[];
}

interface AdvancedFilterModalProps {
    open: boolean;
    onClose: () => void;
    fields: FilterField[];
    onApply: (filters: FilterGroup[]) => void;
}

export function AdvancedFilterModal({ open, onClose, fields, onApply }: AdvancedFilterModalProps) {
    const [groups, setGroups] = useState<FilterGroup[]>([
        { id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: '', operator: 'equals', value: '' }] }
    ]);

    const handleAddCondition = (groupId: string) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    conditions: [...g.conditions, { id: `c-${Date.now()}`, field: '', operator: 'equals', value: '' }]
                };
            }
            return g;
        }));
    };

    const handleRemoveCondition = (groupId: string, conditionId: string) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return { ...g, conditions: g.conditions.filter(c => c.id !== conditionId) };
            }
            return g;
        }));
    };

    const handleUpdateCondition = (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    conditions: g.conditions.map(c => c.id === conditionId ? { ...c, ...updates } : c)
                };
            }
            return g;
        }));
    };

    const fieldFor = (fieldKey: string) => fields.find((field) => field.key === fieldKey);
    const operatorsFor = (fieldKey: string) => {
        const type = (fieldFor(fieldKey)?.type || 'text') as FilterFieldType;
        return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text;
    };
    const resetForField = (fieldKey: string) => ({
        field: fieldKey,
        operator: operatorsFor(fieldKey)[0]?.value || 'equals',
        value: '',
    });
    const valueArray = (value: unknown) => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

    const renderValueInput = (groupId: string, condition: FilterCondition) => {
        const field = fieldFor(condition.field);
        const fieldType = (field?.type || 'text') as FilterFieldType;
        const options = field?.options || [];

        if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
            return <div className="min-w-[160px] flex-1" />;
        }

        if (fieldType === 'boolean') {
            return (
                <Select
                    value={condition.value === true ? 'true' : condition.value === false ? 'false' : ''}
                    onValueChange={(value) => handleUpdateCondition(groupId, condition.id, { value: value === 'true' })}
                >
                    <SelectTrigger size="sm" className="min-w-[160px] flex-1">
                        <SelectValue placeholder="Value" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                </Select>
            );
        }

        if (fieldType === 'select' && options.length > 0) {
            const values = valueArray(condition.value);
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="min-w-[180px] flex-1 justify-between">
                            {values.length === 0
                                ? 'Select values'
                                : values.length === 1
                                    ? options.find((option) => option.value === values[0])?.label ?? '1 selected'
                                    : `${values.length} selected`}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                        {options.map((option) => (
                            <DropdownMenuCheckboxItem
                                key={option.value}
                                checked={values.includes(option.value)}
                                onCheckedChange={(checked) => {
                                    const nextValues = checked
                                        ? [...new Set([...values, option.value])]
                                        : values.filter((value) => value !== option.value);
                                    handleUpdateCondition(groupId, condition.id, { value: nextValues });
                                }}
                                onSelect={(event) => event.preventDefault()}
                            >
                                {option.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        if (fieldType === 'date') {
            return (
                <Input
                    type="date"
                    value={formatWorkspaceDateInput(condition.value as string)}
                    onChange={(event) => {
                        const raw = event.target.value;
                        handleUpdateCondition(groupId, condition.id, { value: workspaceDateInputToIso(raw) ?? '' });
                    }}
                    className="min-w-[180px] flex-1"
                />
            );
        }

        return (
            <Input
                type={fieldType === 'number' ? 'number' : 'text'}
                placeholder={condition.operator === 'in' || condition.operator === 'not_in' ? 'Comma-separated values' : 'Value'}
                value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value ?? ''}
                onChange={(event) => {
                    const value = condition.operator === 'in' || condition.operator === 'not_in'
                        ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                        : event.target.value;
                    handleUpdateCondition(groupId, condition.id, { value });
                }}
                className="min-w-[180px] flex-1"
            />
        );
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title="Advanced Filters"
            subtitle="Build complex queries with AND/OR logic"
            maxWidth="md"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { onApply(groups); onClose(); }}>Apply Filters</Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                {groups.map((group, gIndex) => (
                    <div key={group.id} className="rounded-xl border bg-muted/30 p-4">
                        <div className="mb-4 flex items-center gap-4">
                            <span className="text-sm font-bold">Group {gIndex + 1}</span>
                            <Select
                                value={group.logic}
                                onValueChange={(value) => setGroups(prev => prev.map(g => g.id === group.id ? { ...g, logic: value as any } : g))}
                            >
                                <SelectTrigger size="sm" className="min-w-[160px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AND">Match ALL (AND)</SelectItem>
                                    <SelectItem value="OR">Match ANY (OR)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-3">
                            {group.conditions.map((condition) => (
                                <div key={condition.id} className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                                    <Select
                                        value={condition.field}
                                        onValueChange={(value) => handleUpdateCondition(group.id, condition.id, resetForField(value))}
                                    >
                                        <SelectTrigger size="sm" className="min-w-[150px] flex-1">
                                            <SelectValue placeholder="Field" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {fields.map(f => (
                                                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={condition.operator}
                                        onValueChange={(value) => handleUpdateCondition(group.id, condition.id, { operator: value as FilterOperator, value: '' })}
                                    >
                                        <SelectTrigger size="sm" className="min-w-[120px]">
                                            <SelectValue placeholder="Operator" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {operatorsFor(condition.field).map((operator) => (
                                                <SelectItem key={operator.value} value={operator.value}>
                                                    {operator.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {renderValueInput(group.id, condition)}

                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => handleRemoveCondition(group.id, condition.id)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-fit"
                                onClick={() => handleAddCondition(group.id)}
                            >
                                <Plus className="size-4" />
                                Add Condition
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </StandardDialog>
    );
}
