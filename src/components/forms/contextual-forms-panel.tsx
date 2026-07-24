"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
    CheckCircle2 as CheckCircleIcon,
    ChevronDown as KeyboardArrowDownIcon,
    FileText as DescriptionIcon,
    Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const formsCache = new Map<string, any[]>();
const formsRequests = new Map<string, Promise<any[]>>();

function loadAvailableForms(placement: ContextualFormsPanelProps["placement"]) {
    const key = placement;
    const cached = formsCache.get(key);
    if (cached) return Promise.resolve(cached);

    const pending = formsRequests.get(key);
    if (pending) return pending;

    const request = apiFetch(`/forms/available?placement=${encodeURIComponent(placement)}`)
        .then((data: any) => {
            const forms = Array.isArray(data) ? data : [];
            formsCache.set(key, forms);
            return forms;
        })
        .finally(() => {
            formsRequests.delete(key);
        });
    formsRequests.set(key, request);
    return request;
}

/**
 * Renders a "Forms" dropdown button.  Clicking shows available forms.
 * Picking a form opens a dialog with entity data prefilled.
 * Saving calls PATCH on the entity (update, not new submission).
 */
export function ContextualFormsPanel({ placement, context, entityData, onSaved, showEmpty = false }: ContextualFormsPanelProps) {
    const [forms, setForms] = useState<any[]>([]);
    const [openFormId, setOpenFormId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        loadAvailableForms(placement)
            .then((all) => {
                if (mounted) setForms(all);
            })
            .catch(() => setForms([]));
        return () => {
            mounted = false;
        };
    }, [placement]);

    const availableForms = useMemo(() => {
        return forms
            .filter((form) => placementRuleMatches(form, placement, entityData))
            .sort((a, b) => placementRuleOrder(a, placement) - placementRuleOrder(b, placement));
    }, [entityData, forms, placement]);

    if (availableForms.length === 0) {
        if (!showEmpty) return null;
        return (
            <p className="text-xs text-muted-foreground">
                No forms are enabled for this CRM location.
            </p>
        );
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="secondary"
                        className="min-h-9 rounded-[10px] px-3.5"
                    >
                        <DescriptionIcon className="size-4" />
                        Forms
                        <KeyboardArrowDownIcon className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                    {availableForms.map((form) => {
                        const rule = placementRuleFor(form, placement);
                        return (
                            <DropdownMenuItem
                                key={form.id}
                                onClick={() => setOpenFormId(form.id)}
                                className="flex-col items-start gap-0 py-2"
                            >
                                <span className="text-sm font-semibold">{rule?.label || form.name}</span>
                                {rule?.label && (
                                    <span className="text-xs text-muted-foreground">{form.name}</span>
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

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
        <StandardDialog
            open
            onClose={onClose}
            title={form?.name || "Form"}
            subtitle={form?.description || undefined}
            maxWidth="sm"
        >
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-primary" />
                </div>
            ) : error ? (
                <p className="py-8 text-center text-destructive">{error}</p>
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
                <p className="py-8 text-center text-muted-foreground">
                    This form has no configured fields.
                </p>
            )}
        </StandardDialog>
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
            <div className="py-10 text-center">
                <CheckCircleIcon className="mx-auto mb-3 size-12 text-primary" />
                <h3 className="mb-1 text-lg font-bold">Saved!</h3>
                <p className="text-muted-foreground">
                    Data has been updated successfully.
                </p>
            </div>
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
                <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground">Draft is saved automatically on this device.</span>
                    <Button type="button" size="sm" variant="ghost" onClick={clearDraft}>Clear draft</Button>
                </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleFields.map((field) => (
                    <div
                        key={field.id}
                        className={field.type === "TEXTAREA" ? "col-span-1 sm:col-span-2" : "col-span-1"}
                    >
                        {field.type === "HIDDEN" ? (
                            <input type="hidden" value={formData[field.id] || ""} readOnly />
                        ) : field.type === "TEXTAREA" ? (
                            <div className="space-y-1.5">
                                <Label htmlFor={`ctx-field-${field.id}`}>{field.label}{field.required && " *"}</Label>
                                <Textarea
                                    id={`ctx-field-${field.id}`}
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ""}
                                    onChange={(e) => handleChange(field.id, e.target.value)}
                                    required={field.required}
                                    rows={3}
                                />
                                {field.helpText && (
                                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                                )}
                            </div>
                        ) : field.type === "SELECT" ? (
                            <div className="space-y-1.5">
                                <Label htmlFor={`ctx-field-${field.id}`}>{field.label}{field.required && " *"}</Label>
                                <Select value={formData[field.id] || undefined} onValueChange={(v) => handleChange(field.id, v)}>
                                    <SelectTrigger id={`ctx-field-${field.id}`} className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {field.options?.map((opt: string) => (
                                            <SelectItem key={opt} value={opt}>
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {field.helpText && (
                                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                                )}
                            </div>
                        ) : field.type === "CHECKBOX" ? (
                            <div className="space-y-1.5">
                                <p className="text-sm font-semibold">
                                    {field.label}
                                    {field.required && <span className="ml-0.5 text-destructive">*</span>}
                                </p>
                                <div className="space-y-1.5">
                                    {field.options?.map((opt: string) => (
                                        <label key={opt} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={(formData[field.id] || []).includes(opt)}
                                                onCheckedChange={(checked) => {
                                                    const current = formData[field.id] || [];
                                                    handleChange(
                                                        field.id,
                                                        checked
                                                            ? [...current, opt]
                                                            : current.filter((v: string) => v !== opt)
                                                    );
                                                }}
                                            />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                                {field.helpText && (
                                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                                )}
                            </div>
                        ) : field.type === "RADIO" ? (
                            <div className="space-y-1.5">
                                <p className="text-sm font-semibold">
                                    {field.label}
                                    {field.required && <span className="ml-0.5 text-destructive">*</span>}
                                </p>
                                <RadioGroup
                                    value={formData[field.id] || ""}
                                    onValueChange={(v) => handleChange(field.id, v)}
                                >
                                    {field.options?.map((opt: string) => (
                                        <label key={opt} className="flex items-center gap-2 text-sm">
                                            <RadioGroupItem value={opt} />
                                            {opt}
                                        </label>
                                    ))}
                                </RadioGroup>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <Label htmlFor={`ctx-field-${field.id}`}>{field.label}{field.required && " *"}</Label>
                                <Input
                                    id={`ctx-field-${field.id}`}
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
                                />
                                {field.helpText && (
                                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                <div className="col-span-1 mt-1 sm:col-span-2">
                    <Button type="submit" disabled={submitting} className="w-full font-bold">
                        {submitting ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </div>
            </div>
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
