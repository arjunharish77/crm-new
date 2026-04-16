"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Typography,
    Stack,
    IconButton,
    Paper,
    alpha,
    useTheme
} from "@mui/material";
import {
    Delete as DeleteIcon,
    ArrowForward as ArrowRightIcon,
    Add as PlusIcon
} from "@mui/icons-material";

interface LogicRule {
    action: "SHOW" | "HIDE";
    fieldId: string;
    operator: "equals" | "not_equals" | "contains" | "gt" | "lt";
    value: string;
}

interface LogicBuilderProps {
    fields: any[];
    currentFieldId: string;
    value?: LogicRule;
    onChange: (value: LogicRule | undefined) => void;
}

export function ConditionalLogicBuilder({ fields, currentFieldId, value, onChange }: LogicBuilderProps) {
    const theme = useTheme();
    const [rule, setRule] = useState<LogicRule>(value || {
        action: "SHOW",
        fieldId: "",
        operator: "equals",
        value: ""
    });

    useEffect(() => {
        if (value) {
            setRule(value);
        }
    }, [value]);

    const updateRule = (updates: Partial<LogicRule>) => {
        const newRule = { ...rule, ...updates };
        setRule(newRule);
        onChange(newRule);
    };

    const clearRule = () => {
        onChange(undefined);
        setRule({
            action: "SHOW",
            fieldId: "",
            operator: "equals",
            value: ""
        });
    };

    const sourceFields = fields.filter((f) => f.id !== currentFieldId);

    if (!value && !rule.fieldId) {
        return (
            <Paper
                variant="outlined"
                sx={{
                    p: 4,
                    borderStyle: 'dashed',
                    textAlign: 'center',
                    bgcolor: alpha(theme.palette.action.disabled, 0.05)
                }}
            >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    No conditional logic applied.
                </Typography>
                <Button
                    size="small"
                    startIcon={<PlusIcon />}
                    onClick={() => updateRule({ fieldId: sourceFields[0]?.id || "" })}
                    sx={{ borderRadius: 20 }}
                >
                    Add Rule
                </Button>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                    <ArrowRightIcon fontSize="small" /> Condition
                </Typography>
                <IconButton size="small" onClick={clearRule} color="error">
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Box>

            <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">Then</Typography>
                    <FormControl size="small" sx={{ width: 100 }}>
                        <Select
                            value={rule.action}
                            onChange={(e) => updateRule({ action: e.target.value as any })}
                        >
                            <MenuItem value="SHOW">Show</MenuItem>
                            <MenuItem value="HIDE">Hide</MenuItem>
                        </Select>
                    </FormControl>
                    <Typography variant="body2">this field when:</Typography>
                </Stack>

                <FormControl fullWidth size="small">
                    <InputLabel>Field</InputLabel>
                    <Select
                        value={rule.fieldId}
                        label="Field"
                        onChange={(e) => updateRule({ fieldId: e.target.value })}
                    >
                        {sourceFields.map((f) => (
                            <MenuItem key={f.id} value={f.id}>
                                {f.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Stack direction="row" spacing={2}>
                    <FormControl size="small" sx={{ width: '40%' }}>
                        <InputLabel>Operator</InputLabel>
                        <Select
                            value={rule.operator}
                            label="Operator"
                            onChange={(e) => updateRule({ operator: e.target.value as any })}
                        >
                            <MenuItem value="equals">Equals</MenuItem>
                            <MenuItem value="not_equals">Not Equals</MenuItem>
                            <MenuItem value="contains">Contains</MenuItem>
                            <MenuItem value="gt"> Greater Than</MenuItem>
                            <MenuItem value="lt">Less Than</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        placeholder="Value"
                        fullWidth
                        value={rule.value}
                        onChange={(e) => updateRule({ value: e.target.value })}
                    />
                </Stack>
            </Stack>
        </Paper>
    );
}
