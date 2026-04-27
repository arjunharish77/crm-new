"use client";

import {
    Box,
    Button,
    Chip,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { Filter, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import {
    FilterCondition,
    FilterConfig,
    FilterField,
    FilterOperator,
    OPERATORS_BY_TYPE,
} from "@/types/filters";

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

    const renderValueInput = (condition: FilterCondition) => {
        const fieldType = getFieldType(condition.field);
        const fieldOptions = getFieldOptions(condition.field);

        if (condition.operator === "is_empty" || condition.operator === "is_not_empty") {
            return <Box sx={{ width: { xs: "100%", sm: 190 } }} />;
        }

        if (fieldType === "select" && fieldOptions.length > 0 && condition.operator !== "in" && condition.operator !== "not_in") {
            return (
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 190 }, flex: { xs: "1 1 100%", sm: "0 0 190px" } }}>
                    <InputLabel>Value</InputLabel>
                    <Select
                        label="Value"
                        value={condition.value?.toString() || ""}
                        onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                    >
                        {fieldOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            );
        }

        if (fieldType === "boolean") {
            return (
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 150 }, flex: { xs: "1 1 100%", sm: "0 0 150px" } }}>
                    <InputLabel>Value</InputLabel>
                    <Select
                        label="Value"
                        value={condition.value === true ? "true" : condition.value === false ? "false" : ""}
                        onChange={(event) => updateCondition(condition.id, { value: event.target.value === "true" })}
                    >
                        <MenuItem value="true">True</MenuItem>
                        <MenuItem value="false">False</MenuItem>
                    </Select>
                </FormControl>
            );
        }

        if (fieldType === "date") {
            return (
                <DatePicker
                    value={condition.value ? new Date(condition.value as string) : null}
                    onChange={(date: Date | null) => updateCondition(condition.id, { value: date ? date.toISOString() : "" })}
                    slotProps={{
                        textField: {
                            size: "small",
                            label: "Value",
                            sx: { minWidth: { xs: "100%", sm: 190 }, flex: { xs: "1 1 100%", sm: "0 0 190px" } },
                        },
                    }}
                />
            );
        }

        const placeholder = fieldType === "number"
            ? "Enter number"
            : fieldType === "tags" || condition.operator === "in" || condition.operator === "not_in"
                ? "Comma-separated values"
                : "Enter value";

        return (
            <TextField
                size="small"
                label="Value"
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
                sx={{ minWidth: { xs: "100%", sm: 220 }, flex: { xs: "1 1 100%", sm: "1 1 220px" } }}
            />
        );
    };

    return (
        <Stack spacing={1.1}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Filter size={18} />
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>Filters</Typography>
                    {value.conditions.length > 0 ? (
                        <Chip label={value.conditions.length} size="small" sx={{ height: 22, fontWeight: 800 }} />
                    ) : null}
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    {value.conditions.length > 1 ? (
                        <Button variant="outlined" size="small" onClick={toggleLogic} sx={{ minHeight: 30, borderRadius: 1.5 }}>
                            {value.logic}
                        </Button>
                    ) : null}
                    {value.conditions.length > 0 ? (
                        <Button variant="text" size="small" onClick={clearAll} sx={{ minHeight: 30, fontWeight: 800 }}>
                            Clear All
                        </Button>
                    ) : null}
                </Stack>
            </Stack>

            <Stack spacing={0.75}>
                {value.conditions.map((condition, index) => {
                    const fieldType = getFieldType(condition.field);
                    return (
                        <Stack
                            key={condition.id}
                            direction={{ xs: "column", md: "row" }}
                            spacing={0.75}
                            alignItems={{ xs: "stretch", md: "center" }}
                            sx={{ width: "100%" }}
                        >
                            <Box sx={{ width: { xs: "100%", md: 44 }, textAlign: { md: "center" }, flexShrink: 0 }}>
                                {index > 0 ? (
                                    <Chip label={value.logic} size="small" variant="outlined" sx={{ height: 24, fontWeight: 800 }} />
                                ) : null}
                            </Box>

                            <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 190 }, flex: { md: "0 0 190px" } }}>
                                <InputLabel>Field</InputLabel>
                                <Select
                                    label="Field"
                                    value={condition.field}
                                    onChange={(event) => {
                                        const newFieldType = getFieldType(event.target.value);
                                        const operators = getOperators(newFieldType);
                                        updateCondition(condition.id, {
                                            field: event.target.value,
                                            operator: operators[0].value,
                                            value: "",
                                        });
                                    }}
                                >
                                    {fields.map((field) => (
                                        <MenuItem key={field.key} value={field.key}>
                                            {field.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 170 }, flex: { md: "0 0 170px" } }}>
                                <InputLabel>Operator</InputLabel>
                                <Select
                                    label="Operator"
                                    value={condition.operator}
                                    onChange={(event) => updateCondition(condition.id, { operator: event.target.value as FilterOperator })}
                                >
                                    {getOperators(fieldType).map((operator) => (
                                        <MenuItem key={operator.value} value={operator.value}>
                                            {operator.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {renderValueInput(condition)}

                            <IconButton
                                size="small"
                                onClick={() => removeCondition(condition.id)}
                                sx={{ alignSelf: { xs: "flex-end", md: "center" }, width: 34, height: 34 }}
                            >
                                <X size={18} />
                            </IconButton>
                        </Stack>
                    );
                })}
            </Stack>

            <Box>
                <Button variant="outlined" size="small" onClick={addCondition} startIcon={<Plus size={16} />} sx={{ borderRadius: 1.5, fontWeight: 800 }}>
                    Add Filter
                </Button>
            </Box>
        </Stack>
    );
}
