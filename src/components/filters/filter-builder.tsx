"use client";

import { Filter, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    FilterCondition,
    FilterConfig,
    FilterField,
    FilterOperator,
    OPERATORS_BY_TYPE,
} from "@/types/filters";
import { formatWorkspaceDateInput, workspaceDateInputToIso } from "@/lib/date-format";

interface FilterBuilderProps {
    fields: FilterField[];
    value: FilterConfig;
    onChange: (config: FilterConfig) => void;
}

export function FilterBuilder({ fields, value, onChange }: FilterBuilderProps) {
    const addCondition = () => {
        const firstField = fields[0];
        const operators = OPERATORS_BY_TYPE[firstField?.type as keyof typeof OPERATORS_BY_TYPE] || OPERATORS_BY_TYPE.text;
        const newCondition: FilterCondition = {
            id: nanoid(),
            field: firstField?.key || "",
            operator: operators[0]?.value || "equals",
            value: "",
        };
        onChange({
            ...value,
            conditions: [...value.conditions, newCondition],
        });
    };

    const removeCondition = (id: string) => {
        onChange({
            ...value,
            conditions: value.conditions.filter((condition) => condition.id !== id),
        });
    };

    const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
        onChange({
            ...value,
            conditions: value.conditions.map((condition) =>
                condition.id === id ? { ...condition, ...updates } : condition
            ),
        });
    };

    const toggleLogic = () => {
        onChange({
            ...value,
            logic: value.logic === "AND" ? "OR" : "AND",
        });
    };

    const clearAll = () => {
        onChange({
            conditions: [],
            logic: "AND",
        });
    };

    const getField = (fieldKey: string) => fields.find((field) => field.key === fieldKey);
    const getFieldType = (fieldKey: string) => getField(fieldKey)?.type || "text";
    const getFieldOptions = (fieldKey: string) => getField(fieldKey)?.options || [];
    const getOperators = (fieldType: string) =>
        OPERATORS_BY_TYPE[fieldType as keyof typeof OPERATORS_BY_TYPE] || OPERATORS_BY_TYPE.text;
    const valueArray = (value: unknown) => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

    const renderValueInput = (condition: FilterCondition) => {
        const fieldType = getFieldType(condition.field);
        const fieldOptions = getFieldOptions(condition.field);

        if (condition.operator === "is_empty" || condition.operator === "is_not_empty") {
            return <div className="w-full sm:w-[190px]" />;
        }

        if (fieldType === "select" && fieldOptions.length > 0) {
            const values = valueArray(condition.value);
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between sm:w-[220px] sm:flex-none">
                            {values.length === 0
                                ? "Select values"
                                : values.length === 1
                                    ? fieldOptions.find((option) => option.value === values[0])?.label ?? "1 selected"
                                    : `${values.length} selected`}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                        {fieldOptions.map((option) => (
                            <DropdownMenuCheckboxItem
                                key={option.value}
                                checked={values.includes(option.value)}
                                onCheckedChange={(checked) => {
                                    const nextValues = checked
                                        ? [...new Set([...values, option.value])]
                                        : values.filter((value) => value !== option.value);
                                    updateCondition(condition.id, { value: nextValues });
                                }}
                            >
                                {option.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        if (fieldType === "boolean") {
            return (
                <Select
                    value={condition.value === true ? "true" : condition.value === false ? "false" : ""}
                    onValueChange={(newValue) => updateCondition(condition.id, { value: newValue === "true" })}
                >
                    <SelectTrigger size="sm" className="w-full sm:w-[150px] sm:flex-none">
                        <SelectValue placeholder="Value" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                </Select>
            );
        }

        if (fieldType === "date") {
            return (
                <Input
                    type="date"
                    value={formatWorkspaceDateInput(condition.value as string)}
                    onChange={(event) => {
                        const raw = event.target.value;
                        updateCondition(condition.id, { value: workspaceDateInputToIso(raw) ?? "" });
                    }}
                    className="w-full sm:w-[190px] sm:flex-none"
                />
            );
        }

        const placeholder = fieldType === "number"
            ? "Enter number"
            : fieldType === "tags" || condition.operator === "in" || condition.operator === "not_in"
                ? "Comma-separated values"
                : "Enter value";

        return (
            <Input
                type={fieldType === "number" ? "number" : "text"}
                placeholder={placeholder}
                value={Array.isArray(condition.value) ? condition.value.join(", ") : condition.value || ""}
                onChange={(event) => {
                    if (fieldType === "tags" || condition.operator === "in" || condition.operator === "not_in") {
                        const values = event.target.value.split(",").map((item) => item.trim()).filter(Boolean);
                        updateCondition(condition.id, { value: values });
                    } else {
                        updateCondition(condition.id, { value: event.target.value });
                    }
                }}
                className="w-full sm:min-w-[220px] sm:flex-1"
            />
        );
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1.5">
                    <Filter size={18} />
                    <span className="text-sm font-extrabold">Filters</span>
                    {value.conditions.length > 0 ? (
                        <Badge variant="secondary" className="h-[22px] font-extrabold">
                            {value.conditions.length}
                        </Badge>
                    ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                    {value.conditions.length > 1 ? (
                        <Button variant="outline" size="sm" onClick={toggleLogic} className="h-[30px] rounded-md">
                            {value.logic}
                        </Button>
                    ) : null}
                    {value.conditions.length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={clearAll} className="h-[30px] font-extrabold">
                            Clear All
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                {value.conditions.map((condition, index) => {
                    const fieldType = getFieldType(condition.field);
                    return (
                        <div
                            key={condition.id}
                            className="flex w-full flex-col items-stretch gap-1.5 md:flex-row md:items-center"
                        >
                            <div className="w-full shrink-0 text-left md:w-11 md:text-center">
                                {index > 0 ? (
                                    <Badge variant="outline" className="h-6 font-extrabold">
                                        {value.logic}
                                    </Badge>
                                ) : null}
                            </div>

                            <Select
                                value={condition.field}
                                onValueChange={(newValue) => {
                                    const newFieldType = getFieldType(newValue);
                                    const operators = getOperators(newFieldType);
                                    updateCondition(condition.id, {
                                        field: newValue,
                                        operator: operators[0].value,
                                        value: "",
                                    });
                                }}
                            >
                                <SelectTrigger size="sm" className="w-full md:w-[190px] md:flex-none">
                                    <SelectValue placeholder="Field" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fields.map((field) => (
                                        <SelectItem key={field.key} value={field.key}>
                                            {field.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={condition.operator}
                                onValueChange={(newValue) => updateCondition(condition.id, { operator: newValue as FilterOperator })}
                            >
                                <SelectTrigger size="sm" className="w-full md:w-[170px] md:flex-none">
                                    <SelectValue placeholder="Operator" />
                                </SelectTrigger>
                                <SelectContent>
                                    {getOperators(fieldType).map((operator) => (
                                        <SelectItem key={operator.value} value={operator.value}>
                                            {operator.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {renderValueInput(condition)}

                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeCondition(condition.id)}
                                className="self-end md:self-center"
                            >
                                <X size={18} />
                            </Button>
                        </div>
                    );
                })}
            </div>

            <div>
                <Button variant="outline" size="sm" onClick={addCondition} className="rounded-md font-extrabold">
                    <Plus size={16} />
                    Add Filter
                </Button>
            </div>
        </div>
    );
}
