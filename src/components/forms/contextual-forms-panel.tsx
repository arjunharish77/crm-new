"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
    Box,
    Button,
    Stack,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    CircularProgress,
    TextField,
    MenuItem,
    FormControlLabel,
    Checkbox,
    Radio,
    RadioGroup,
    Menu,
    ListItemIcon,
    ListItemText,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type ContextualFormsPanelProps = {
    placement: "LEAD_DETAIL" | "OPPORTUNITY_DETAIL" | "ACTIVITY_DETAIL" | "LEAD_CREATE" | "OPPORTUNITY_CREATE";
    context: {
        leadId?: string | null;
        opportunityId?: string | null;
        activityId?: string | null;
    };
    /** Entity data used to prefill forms */
    entityData?: Record<string, any> | null;
    /** Callback after save so page can reload data */
    onSaved?: () => void;
    showEmpty?: boolean;
};

/**
 * Renders a "Forms" dropdown button.  Clicking shows available forms.
 * Picking a form opens a dialog with entity data prefilled.
 * Saving calls PATCH on the entity (update, not new submission).
 */
export function ContextualFormsPanel({ placement, context, entityData, onSaved, showEmpty = false }: ContextualFormsPanelProps) {
    const [forms, setForms] = useState<any[]>([]);
    const [openFormId, setOpenFormId] = useState<string | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const menuOpen = Boolean(anchorEl);

    useEffect(() => {
        apiFetch(`/forms/available?placement=${encodeURIComponent(placement)}`)
            .then((data: any) => {
                const all = Array.isArray(data) ? data : [];
                setForms(all);
            })
            .catch(() => setForms([]));
    }, [placement]);

    const availableForms = useMemo(() => {
        return forms
            .filter((form) => placementRuleMatches(form, placement, entityData))
            .sort((a, b) => placementRuleOrder(a, placement) - placementRuleOrder(b, placement));
    }, [entityData, forms, placement]);

    if (availableForms.length === 0) {
        if (!showEmpty) return null;
        return (
            <Typography variant="caption" color="text.secondary">
                No forms are enabled for this CRM location.
            </Typography>
        );
    }

    return (
        <>
            <Button
                color="secondary"
                startIcon={<DescriptionIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{
                    borderRadius: "10px",
                    px: 1.75,
                    bgcolor: "secondaryContainer",
                    color: "onSecondaryContainer",
                    minHeight: 36,
                }}
            >
                Forms
            </Button>

            <Menu
                anchorEl={anchorEl}
                open={menuOpen}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{
                    paper: {
                        sx: {
                            borderRadius: "12px",
                            minWidth: 200,
                            mt: 0.5,
                        },
                    },
                }}
            >
                {availableForms.map((form) => {
                    const rule = placementRuleFor(form, placement);
                    return (
                    <MenuItem
                        key={form.id}
                        onClick={() => {
                            setOpenFormId(form.id);
                            setAnchorEl(null);
                        }}
                        sx={{ py: 1 }}
                    >
                        <ListItemIcon>
                            <DescriptionIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                            primary={rule?.label || form.name}
                            secondary={rule?.label ? form.name : undefined}
                            primaryTypographyProps={{ fontWeight: 600, fontSize: "0.875rem" }}
                            secondaryTypographyProps={{ fontSize: "0.75rem" }}
                        />
                    </MenuItem>
                    );
                })}
            </Menu>

            {openFormId && (
                <FormDialog
                    formId={openFormId}
                    context={context}
                    entityData={entityData}
                    placement={placement}
                    onClose={() => setOpenFormId(null)}
                    onSaved={onSaved}
                />
            )}
        </>
    );
}

function placementRuleFor(form: any, placement: string) {
    const rules = Array.isArray(form?.config?.placementRules) ? form.config.placementRules : [];
    return rules.find((rule: any) => rule.placement === placement && rule.enabled !== false);
}

function placementRuleOrder(form: any, placement: string) {
    return Number(placementRuleFor(form, placement)?.order ?? 0);
}

function placementRuleMatches(form: any, placement: string, entityData?: Record<string, any> | null) {
    const rule = placementRuleFor(form, placement);
    if (!rule) return true;
    const conditions = Array.isArray(rule.conditions) ? rule.conditions.filter((condition: any) => condition.field) : [];
    if (conditions.length === 0) return true;
    const checks = conditions.map((condition: any) => placementConditionMatches(entityData ?? {}, condition));
    return String(rule.conditionLogic ?? "AND") === "OR" ? checks.some(Boolean) : checks.every(Boolean);
}

function placementConditionMatches(entityData: Record<string, any>, condition: any) {
    const value = readEntityValue(entityData, String(condition.field ?? ""));
    const expected = condition.value;
    switch (condition.operator) {
        case "not_equals":
            return String(value ?? "") !== String(expected ?? "");
        case "contains":
            return String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
        case "contains_data":
            return value !== undefined && value !== null && String(value).trim() !== "";
        case "not_contains_data":
            return value === undefined || value === null || String(value).trim() === "";
        case "equals":
        default:
            return String(value ?? "") === String(expected ?? "");
    }
}

function readEntityValue(entityData: Record<string, any>, path: string) {
    if (!path) return undefined;
    const normalizedPath = path.replace(/^(lead|opportunity|activity)\./, "");
    const direct = entityData[normalizedPath] ?? entityData[path];
    if (direct !== undefined) return direct;
    return normalizedPath.split(".").reduce<any>((current, key) => current?.[key], entityData);
}

/* ─── Form Dialog ────────────────────────────────────────────────────── */

function FormDialog({
    formId,
    context,
    entityData,
    placement,
    onClose,
    onSaved,
}: {
    formId: string;
    context: ContextualFormsPanelProps["context"];
    entityData?: Record<string, any> | null;
    placement: ContextualFormsPanelProps["placement"];
    onClose: () => void;
    onSaved?: () => void;
}) {
    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        // Use the public endpoint which returns { name, description, config, isActive }
        // config contains { fields: [...], ... } — same flat format used by public form renderer
        apiFetch(`/public/forms/${formId}`)
            .then(setForm)
            .catch(() => setError("Failed to load form."))
            .finally(() => setLoading(false));
    }, [formId]);

    // Extract the flat fields array from config
    const configFields = useMemo(() => {
        if (!form?.config) return [];
        const cfg = form.config;
        return Array.isArray(cfg.fields) ? cfg.fields : [];
    }, [form]);

    return (
        <Dialog
            open
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: "16px",
                    maxHeight: "85vh",
                },
            }}
        >
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 0.5 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>
                        {form?.name || "Form"}
                    </Typography>
                    {form?.description && (
                        <Typography variant="caption" color="text.secondary">
                            {form.description}
                        </Typography>
                    )}
                </Box>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ pt: 2 }}>
                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                        <CircularProgress size={32} />
                    </Box>
                ) : error ? (
                    <Typography color="error" textAlign="center" py={4}>
                        {error}
                    </Typography>
                ) : configFields.length > 0 ? (
                    <FormRenderer
                        formId={formId}
                        fields={configFields}
                        context={context}
                        entityData={entityData}
                        placement={placement}
                        submitButtonText={form?.config?.submitButtonText}
                        onSuccess={() => {
                            onSaved?.();
                            onClose();
                        }}
                    />
                ) : (
                    <Typography color="text.secondary" textAlign="center" py={4}>
                        This form has no configured fields.
                    </Typography>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ─── Form Renderer (same field format as public form) ───────────────── */

function FormRenderer({
    formId,
    fields,
    context,
    entityData,
    placement,
    submitButtonText,
    onSuccess,
}: {
    formId: string;
    fields: any[];
    context: ContextualFormsPanelProps["context"];
    entityData?: Record<string, any> | null;
    placement: ContextualFormsPanelProps["placement"];
    submitButtonText?: string;
    onSuccess: () => void;
}) {
    // formData is keyed by field.id (same as public form)
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const draftKey = `crm-context-form-draft:${formId}:${placement}:${context.leadId || ""}:${context.opportunityId || ""}:${context.activityId || ""}`;

    // Prefill from entityData using field.mapping as the entity key
    useEffect(() => {
        const data: Record<string, any> = {};
        fields.forEach((field) => {
            const mappingStr = field.mapping || field.label || "";
            const parts = mappingStr.split('.');
            const entityKey = parts.pop() || "";
            const modulePrefix = parts.length > 0 ? parts[0].toLowerCase() : "";

            let value;

            if (entityData) {
                if (placement === "OPPORTUNITY_DETAIL" && modulePrefix === "lead" && entityData.lead) {
                    // Try to extract from nested lead object
                    const leadObj = entityData.lead;
                    value = leadObj[entityKey];
                    if (value === undefined) {
                        const matchingKey = Object.keys(leadObj).find(k => k.toLowerCase() === entityKey.toLowerCase());
                        if (matchingKey) value = leadObj[matchingKey];
                    }
                } else {
                    // Extract from the base entity object
                    value = entityData[entityKey];
                    if (value === undefined) {
                        const matchingKey = Object.keys(entityData).find(k => k.toLowerCase() === entityKey.toLowerCase());
                        if (matchingKey) value = entityData[matchingKey];
                    }
                }
            }

            if (value !== undefined) {
                data[field.id] = value;
            } else if (field.defaultValue) {
                data[field.id] = field.defaultValue;
            }
        });
        const savedDraft = window.localStorage.getItem(draftKey);
        const draftData = parseDraft(savedDraft);
        setFormData({ ...data, ...draftData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityData]);

    useEffect(() => {
        if (submitted || Object.keys(formData).length === 0) return;
        window.localStorage.setItem(draftKey, JSON.stringify(formData));
    }, [draftKey, formData, submitted]);

    // Conditional logic (same as public form)
    const visibleFields = useMemo(() => {
        return fields.filter((field) => {
            if (!field.logic || !field.logic.fieldId) return true;
            const sourceValue = formData[field.logic.fieldId];
            const targetValue = field.logic.value;
            let isMatch = false;
            switch (field.logic.operator) {
                case "equals": isMatch = String(sourceValue) === String(targetValue); break;
                case "not_equals": isMatch = String(sourceValue) !== String(targetValue); break;
                case "contains": isMatch = String(sourceValue).includes(String(targetValue)); break;
                case "gt": isMatch = Number(sourceValue) > Number(targetValue); break;
                case "lt": isMatch = Number(sourceValue) < Number(targetValue); break;
                default: isMatch = String(sourceValue) === String(targetValue);
            }
            return field.logic.action === "SHOW" ? isMatch : !isMatch;
        });
    }, [fields, formData]);

    const handleChange = useCallback((id: string, value: any) => {
        setFormData((prev) => ({ ...prev, [id]: value }));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const missing = visibleFields.filter(
            (f) => f.required && isMissing(formData[f.id])
        );
        if (missing.length > 0) {
            toast.error(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
            return;
        }

        setSubmitting(true);
        try {
            // Build separate payloads depending on module
            const leadPayload: Record<string, any> = {};
            const oppPayload: Record<string, any> = {};
            const activityPayload: Record<string, any> = {};
            const publicPayload: Record<string, any> = {};

            fields.forEach((f) => {
                if (formData[f.id] !== undefined) {
                    const mappingStr = f.mapping || f.label || "";
                    const parts = mappingStr.split('.');
                    const entityKey = parts.pop() || "";
                    const modulePrefix = parts.length > 0 ? parts[0].toLowerCase() : "";
                    
                    const source = modulePrefix || (f.sourceModule ? f.sourceModule.toLowerCase() : "");

                    publicPayload[f.mapping || f.label || f.id] = formData[f.id];
                    publicPayload[f.id] = formData[f.id];

                    if (source === "activity" || (!source && placement === "ACTIVITY_DETAIL")) {
                        activityPayload[entityKey] = formData[f.id];
                    } else if (source === "opportunity" || (!source && placement === "OPPORTUNITY_DETAIL")) {
                        oppPayload[entityKey] = formData[f.id];
                    } else if (source === "lead" || (!source && placement === "LEAD_DETAIL")) {
                        leadPayload[entityKey] = formData[f.id];
                    } else {
                        // Fallback
                        if (placement === "OPPORTUNITY_DETAIL") oppPayload[entityKey] = formData[f.id];
                        else if (placement === "ACTIVITY_DETAIL") activityPayload[entityKey] = formData[f.id];
                        else leadPayload[entityKey] = formData[f.id];
                    }
                }
            });

            const promises = [];
            
            if (Object.keys(leadPayload).length > 0 && context.leadId) {
                promises.push(
                    apiFetch(`/leads/${context.leadId}`, {
                        method: "PATCH",
                        body: JSON.stringify(leadPayload),
                    })
                );
            }
            if (Object.keys(oppPayload).length > 0 && context.opportunityId) {
                promises.push(
                    apiFetch(`/opportunities/${context.opportunityId}`, {
                        method: "PATCH",
                        body: JSON.stringify(oppPayload),
                    })
                );
            }
            if (Object.keys(activityPayload).length > 0 && context.activityId) {
                promises.push(
                    apiFetch(`/activities/${context.activityId}`, {
                        method: "PATCH",
                        body: JSON.stringify(activityPayload),
                    })
                );
            }

            if (promises.length > 0) {
                await Promise.all(promises);
                toast.success("Updated successfully!");
            } else {
                await apiFetch(`/public/forms/${formId}/submit`, {
                    method: "POST",
                    body: JSON.stringify({
                        ...publicPayload,
                        _context: context,
                    }),
                });
                toast.success("Saved successfully!");
            }

            window.localStorage.removeItem(draftKey);
            setSubmitted(true);
            setTimeout(onSuccess, 800);
        } catch (error: any) {
            toast.error(error.message || "Failed to save");
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <Box sx={{ textAlign: "center", py: 6 }}>
                <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
                <Typography variant="h6" fontWeight={700} gutterBottom>
                    Saved!
                </Typography>
                <Typography color="text.secondary">
                    Data has been updated successfully.
                </Typography>
            </Box>
        );
    }

    const clearDraft = () => {
        window.localStorage.removeItem(draftKey);
        setFormData({});
        toast.success("Draft cleared");
    };

    return (
        <form onSubmit={handleSubmit}>
            {Object.keys(formData).length > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, px: 1.25, py: 0.75, border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "background.default" }}>
                    <Typography variant="caption" color="text.secondary">Draft is saved automatically on this device.</Typography>
                    <Button type="button" size="small" onClick={clearDraft}>Clear draft</Button>
                </Stack>
            )}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: 1.5,
                }}
            >
                {visibleFields.map((field) => (
                    <Box key={field.id} sx={{ gridColumn: field.type === "TEXTAREA" ? "1 / -1" : undefined }}>
                        {field.type === "HIDDEN" ? (
                            <input type="hidden" value={formData[field.id] || ""} readOnly />
                        ) : field.type === "TEXTAREA" ? (
                            <TextField
                                label={field.label}
                                placeholder={field.placeholder}
                                value={formData[field.id] || ""}
                                onChange={(e) => handleChange(field.id, e.target.value)}
                                required={field.required}
                                fullWidth
                                size="small"
                                multiline
                                rows={3}
                                helperText={field.helpText}
                            />
                        ) : field.type === "SELECT" ? (
                            <TextField
                                select
                                label={field.label}
                                value={formData[field.id] || ""}
                                onChange={(e) => handleChange(field.id, e.target.value)}
                                required={field.required}
                                fullWidth
                                size="small"
                                helperText={field.helpText}
                            >
                                {field.options?.map((opt: string) => (
                                    <MenuItem key={opt} value={opt}>
                                        {opt}
                                    </MenuItem>
                                ))}
                            </TextField>
                        ) : field.type === "CHECKBOX" ? (
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {field.label}
                                    {field.required && <Box component="span" sx={{ color: "error.main", ml: 0.5 }}>*</Box>}
                                </Typography>
                                {field.options?.map((opt: string) => (
                                    <FormControlLabel
                                        key={opt}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={(formData[field.id] || []).includes(opt)}
                                                onChange={(e) => {
                                                    const current = formData[field.id] || [];
                                                    handleChange(
                                                        field.id,
                                                        e.target.checked
                                                            ? [...current, opt]
                                                            : current.filter((v: string) => v !== opt)
                                                    );
                                                }}
                                            />
                                        }
                                        label={opt}
                                    />
                                ))}
                                {field.helpText && (
                                    <Typography variant="caption" color="text.secondary">
                                        {field.helpText}
                                    </Typography>
                                )}
                            </Box>
                        ) : field.type === "RADIO" ? (
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {field.label}
                                    {field.required && <Box component="span" sx={{ color: "error.main", ml: 0.5 }}>*</Box>}
                                </Typography>
                                <RadioGroup
                                    value={formData[field.id] || ""}
                                    onChange={(e) => handleChange(field.id, e.target.value)}
                                >
                                    {field.options?.map((opt: string) => (
                                        <FormControlLabel
                                            key={opt}
                                            value={opt}
                                            control={<Radio size="small" />}
                                            label={opt}
                                        />
                                    ))}
                                </RadioGroup>
                            </Box>
                        ) : (
                            <TextField
                                label={field.label}
                                type={
                                    field.type === "NUMBER" ? "number"
                                        : field.type === "EMAIL" ? "email"
                                            : field.type === "DATE" ? "date"
                                                : "text"
                                }
                                placeholder={field.placeholder}
                                value={formData[field.id] || ""}
                                onChange={(e) => handleChange(field.id, e.target.value)}
                                required={field.required}
                                fullWidth
                                size="small"
                                helperText={field.helpText}
                                slotProps={{
                                    inputLabel: field.type === "DATE" ? { shrink: true } : undefined,
                                }}
                            />
                        )}
                    </Box>
                ))}

                <Box sx={{ gridColumn: "1 / -1" }}>
                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={submitting}
                        sx={{
                            py: 1.25,
                            fontWeight: 700,
                            borderRadius: "10px",
                            mt: 1,
                        }}
                    >
                        {submitting ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={18} color="inherit" />
                                <span>Saving…</span>
                            </Stack>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </Box>
            </Box>
        </form>
    );
}

function isMissing(value: unknown) {
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim().length === 0;
    return !value;
}

function parseDraft(value: string | null) {
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}
