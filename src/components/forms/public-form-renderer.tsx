import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams } from "next/navigation";
import { matchesLogicRule, type LogicRule } from "@/lib/forms/visibility";
import { safeFormCss } from "@/lib/forms/custom-css";
import { storageGet, storageSet, storageRemove } from "@/lib/storage";

type FormField = { id: string; label: string; type?: string; tabId?: string; helpText?: string; [key: string]: any };

interface FormConfig {
    fields: any[];
    successMessage?: string;
    redirectUrl?: string;
    theme?: string;
    customCss?: string;
    submitButtonText?: string;
    layoutColumns?: number;
    tabs?: Array<{ id: string; label: string; logic?: LogicRule }>;
    sections?: Array<{ id: string; tabId: string; label: string; logic?: LogicRule }>;
    useMultiStep?: boolean;
    showSectionNames?: boolean;
}

interface RendererProps {
    slug: string;
    config: FormConfig;
}

// Options are usually plain strings (the string serves as both value and label), but the
// Opportunity Type selector stores {value, label} pairs (a real id plus a human-readable name).
// This normalizes either shape to a common {value, label} form for rendering.
function normalizeOptions(options: Array<string | { value: string; label: string }> | undefined) {
    if (!Array.isArray(options)) return [];
    return options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : { value: String(option.value ?? ""), label: String(option.label ?? option.value ?? "") }
    );
}

export function PublicFormRenderer({ slug, config }: RendererProps) {
    const searchParams = useSearchParams();
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    // Problems shown beside each field and summarised at the top (UI/UX plan §5.13; they were a
    // single toast listing field names).
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [activeTabId, setActiveTabId] = useState(config.tabs?.[0]?.id || "tab_1");
    // Stable per-page-load id, not tied to any user identity -- just enough to bucket
    // "did this same visit reach tab N" for the drop-off report without correlating to a
    // real person.
    const [sessionId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const tabs = config.tabs?.length ? config.tabs : [{ id: "tab_1", label: "Tab 1" }];
    const sections = config.sections?.length ? config.sections : [{ id: "section_1", tabId: tabs[0].id, label: "Section 1" }];
    const draftKey = `crm-form-draft:${slug}`;

    // Initialize pre-fill from URL params
    useEffect(() => {
        const initialData: Record<string, any> = {};

        fields.forEach(field => {
            // Check for mapping name or field label in URL params
            const mappingKey = field.mapping?.toLowerCase();
            const labelKey = field.label?.toLowerCase().replace(/\s+/g, '_');

            const value = searchParams.get(mappingKey || "") || searchParams.get(labelKey || "");
            if (value) {
                initialData[field.id] = value;
            } else if (field.defaultValue) {
                initialData[field.id] = field.defaultValue;
            }
        });

        const savedDraft = typeof window !== "undefined" ? storageGet(draftKey) : null;
        const draftData = parseDraft(savedDraft);
        setFormData(prev => ({ ...prev, ...initialData, ...draftData }));
    }, [fields, searchParams]);

    useEffect(() => {
        if (submitted || Object.keys(formData).length === 0) return;
        storageSet(draftKey, JSON.stringify(formData));
    }, [draftKey, formData, submitted]);

    // Drop-off telemetry: fires on mount (tab 0) and every subsequent tab change, completely
    // separate from the final submit call -- this is the only thing that can ever tell you
    // how far a real visitor got before abandoning a multi-tab form. sendBeacon is preferred
    // since it's designed to survive the page unloading immediately after (e.g. closing the
    // tab mid-abandon), which a normal fetch call is not guaranteed to.
    useEffect(() => {
        if (submitted) return;
        const tabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
        const payload = JSON.stringify({ sessionId, tabId: activeTabId, tabIndex });
        const url = `/api/public/forms/${slug}/progress`;
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        } else {
            fetch(url, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
        }
        // Deliberately scoped to activeTabId/submitted only -- sessionId/slug never change
        // after mount, and tabs is a fresh array reference every render in the single-tab
        // fallback case, which would otherwise re-fire the beacon on every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabId, submitted]);

    // A field's own visibility, ignoring whatever section/tab it lives in -- used both to
    // build the final visibleFields list and to decide whether a section/tab has anything
    // left to show at all (e.g. a section whose only fields were stripped server-side for a
    // disabled feature, or hidden by their own conditions, shouldn't render as an empty shell).
    const opportunityTypeSelector = fields.find(f => f.mapping === "opportunity.opportunityTypeId");
    const selectedOpportunityTypeId = opportunityTypeSelector ? formData[opportunityTypeSelector.id] : undefined;
    const isFieldSelfVisible = (field: any) => {
        if (field.sourceModule === "opportunity" && field.opportunityTypeId && field.opportunityTypeId !== selectedOpportunityTypeId) {
            return false;
        }
        return matchesLogicRule(formData, field.logic);
    };
    const effectiveFieldTabId = (field: any) => field.tabId || tabs[0]?.id;
    const effectiveFieldSectionId = (field: any) => field.sectionId || sections.find((section) => section.tabId === effectiveFieldTabId(field))?.id;

    // Section/tab-level conditions -- same rule shape and evaluator as fields. A section/tab
    // also needs at least one field that would actually be shown; otherwise it's an empty
    // shell (e.g. every field in it stripped or independently hidden) with nothing to render.
    const visibleSections = useMemo(
        () =>
            sections.filter(
                (section) =>
                    matchesLogicRule(formData, section.logic) &&
                    fields.some((field) => isFieldSelfVisible(field) && effectiveFieldSectionId(field) === section.id),
            ),
        [sections, fields, formData],
    );
    const visibleTabs = useMemo(() => {
        return tabs.filter((tab) => {
            if (!matchesLogicRule(formData, tab.logic)) return false;
            // A tab whose own condition passes but whose every section is hidden has
            // nothing to show either -- skip it from the tab strip and stepper nav.
            const tabSectionIds = visibleSections.filter((section) => section.tabId === tab.id).map((section) => section.id);
            return tabSectionIds.length > 0;
        });
    }, [tabs, visibleSections, formData]);

    // Conditional Logic Evaluation. A field inside a hidden section/tab is suppressed
    // too -- not just the section/tab header -- so a required field that's only reachable
    // through a hidden section can't block submission, and a value entered before a
    // section/tab was hidden can't leak into the payload.
    const visibleFields = useMemo(() => {
        const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));
        const visibleSectionIds = new Set(visibleSections.map((section) => section.id));
        return fields.filter(field => {
            if (!isFieldSelfVisible(field)) return false;

            const effectiveTabId = effectiveFieldTabId(field);
            if (effectiveTabId !== undefined && !visibleTabIds.has(effectiveTabId)) return false;
            const effectiveSectionId = effectiveFieldSectionId(field);
            if (effectiveSectionId !== undefined && !visibleSectionIds.has(effectiveSectionId)) return false;

            return true;
        });
    }, [fields, formData, visibleTabs, visibleSections, tabs, sections]);

    useEffect(() => {
        if (visibleTabs.length && !visibleTabs.some((tab) => tab.id === activeTabId)) {
            setActiveTabId(visibleTabs[0].id);
        }
    }, [visibleTabs, activeTabId]);

    const activeTabIndex = visibleTabs.findIndex((tab) => tab.id === activeTabId);

    const isMissingRequiredValue = (value: unknown) => {
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === "string") return value.trim().length === 0;
        return !value;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check the visible fields only: required ones are filled in, email addresses look right.
        const found: Record<string, string> = {};
        for (const field of visibleFields) {
            const value = formData[field.id];
            if (field.required && isMissingRequiredValue(value)) found[field.id] = `Enter ${field.label}.`;
            else if (field.type === 'EMAIL' && typeof value === 'string' && value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) found[field.id] = `Enter a valid email address, like name@example.com.`;
        }
        setErrors(found);
        setSubmitError(null);
        const firstInvalid = visibleFields.find((field) => found[field.id]);
        if (firstInvalid) {
            focusField(firstInvalid);
            return;
        }

        setSubmitting(true);
        try {
            const payload: Record<string, any> = {};

            // Map form fields -- only currently-visible ones, so a value entered for a field
            // that's since become hidden (e.g. switching the Opportunity Type selector) doesn't
            // leak into the submission.
            visibleFields.forEach(f => {
                const key = f.mapping || f.label;
                if (formData[f.id] !== undefined) {
                    payload[key] = formData[f.id];
                }
            });

            // Capture UTM Parameters
            const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
            utms.forEach(utm => {
                const val = searchParams.get(utm);
                if (val) payload[utm] = val;
            });

            // Add metadata
            payload._metadata = {
                url: window.location.href,
                referrer: document.referrer,
                timestamp: new Date().toISOString()
            };
            payload._context = {
                leadId: searchParams.get("leadId"),
                opportunityId: searchParams.get("opportunityId"),
                activityId: searchParams.get("activityId"),
            };

            const result = await apiFetch<{ warnings?: string[] }>(`/public/forms/${slug}/submit`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (Array.isArray(result?.warnings)) {
                result.warnings.forEach((warning) => toast.warning(warning));
            }

            storageRemove(draftKey);
            setSubmitted(true);
            if (config.redirectUrl) {
                setTimeout(() => {
                    window.location.href = config.redirectUrl!;
                }, 2000);
            }
        } catch (error: any) {
            setSubmitError(error?.message || "Your answers couldn't be sent. Try again.");
            setSubmitting(false);
        }
    };

    // Show the field's tab, then move focus to it.
    function focusField(field: FormField) {
        const tabId = field.tabId || tabs[0]?.id;
        if (tabId && tabId !== activeTabId) setActiveTabId(tabId);
        window.setTimeout(() => {
            const element = document.getElementById(field.id) ?? document.querySelector<HTMLElement>(`[name="${CSS.escape(field.id)}"]`) ?? document.getElementById(`${field.id}-error`);
            element?.focus();
            element?.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 0);
    }
    const errorEntries = visibleFields.filter((field) => errors[field.id]);
    const describedBy = (field: FormField) => [field.helpText ? `${field.id}-help` : null, errors[field.id] ? `${field.id}-error` : null].filter(Boolean).join(" ") || undefined;
    const fieldA11y = (field: FormField) => ({ "aria-invalid": errors[field.id] ? true : undefined, "aria-describedby": describedBy(field) });

    if (submitted) {
        return (
            <div className="text-center py-12 animate-in fade-in zoom-in duration-300">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-status-success mb-6">
                    <CheckCircle2 className="h-10 w-10 text-status-success-foreground" aria-hidden />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-2" role="status">Thank you</h2>
                <p className="text-muted-foreground text-lg">{config.successMessage || "Thank you for your submission."}</p>
            </div>
        );
    }

    const handleChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
        if (errors[id]) setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
    };

    const clearDraft = () => {
        storageRemove(draftKey);
        setFormData({});
        toast.success("Draft cleared");
    };

    return (
        <>
            {config.customCss && <style dangerouslySetInnerHTML={{ __html: safeFormCss(config.customCss) }} />}
            <form onSubmit={handleSubmit} noValidate className={`space-y-4 form-theme-${config.theme || 'default'}`}>
                {errorEntries.length > 0 && (
                    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                        <p className="font-semibold text-destructive">{errorEntries.length === 1 ? "One answer needs fixing" : `${errorEntries.length} answers need fixing`}</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                            {errorEntries.map((field) => (
                                <li key={field.id}>
                                    <button type="button" className="text-left underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => focusField(field)}>{errors[field.id]}</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {submitError && (
                    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{submitError}</div>
                )}
                {Object.keys(formData).length > 0 && (
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <span>Draft is saved automatically on this device.</span>
                        <button type="button" className="rounded-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={clearDraft}>Clear draft</button>
                    </div>
                )}
                {fields.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                        This form does not have any fields yet.
                    </div>
                )}
                {visibleTabs.length > 1 && (
                    <div className="flex min-w-0 max-w-full gap-2 border-b border-border overflow-x-auto">
                        {visibleTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTabId(tab.id)}
                                className={`min-w-0 shrink-0 max-w-full break-words px-3 py-2 text-sm font-semibold border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeTabId === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}
                {visibleSections.filter((section) => section.tabId === activeTabId).map((section) => {
                    const sectionFields = visibleFields.filter((field) => (field.tabId || tabs[0].id) === activeTabId && (field.sectionId || sections.find((item) => item.tabId === activeTabId)?.id) === section.id);
                    if (sectionFields.length === 0) return null;
                    return (
                        <div key={section.id} className="space-y-3">
                            {config.showSectionNames !== false && <h3 className="text-sm font-bold text-foreground">{section.label}</h3>}
                            <div className={config.layoutColumns === 1 ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 @min-[440px]/public-form:grid-cols-2 gap-4"}>
                {sectionFields.map((field) => (
                    <div key={field.id} className="min-w-0 break-words space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {field.type !== 'HIDDEN' && (
                            <Label htmlFor={field.id} className="text-sm font-semibold text-foreground">
                                {field.label}
                                {field.required && <span className="text-destructive ml-1" aria-hidden>*</span>}{field.required && <span className="sr-only"> (required)</span>}
                            </Label>
                        )}

                        <div className="relative">
                            {field.type === 'HIDDEN' ? (
                                <input id={field.id} type="hidden" value={formData[field.id] || ''} readOnly />
                            ) : field.type === 'TEXTAREA' ? (
                                <Textarea
                                    id={field.id}
                                    {...fieldA11y(field)}
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ''}
                                    onChange={e => handleChange(field.id, e.target.value)}
                                    className="min-h-[120px] resize-y"
                                />
                            ) : field.type === 'SELECT' ? (
                                <Select onValueChange={val => handleChange(field.id, val)} value={formData[field.id] || ''}>
                                    <SelectTrigger id={field.id} className="w-full" {...fieldA11y(field)}>
                                        <SelectValue placeholder={field.placeholder || "Select option..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {normalizeOptions(field.options).map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : field.type === 'CHECKBOX' ? (
                                <div className="space-y-2 pt-1">
                                    {field.options && field.options.length > 0 ? (
                                        normalizeOptions(field.options).map((opt) => (
                                            <div key={opt.value} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`${field.id}-${opt.value}`}
                                                    {...fieldA11y(field)}
                                                    checked={(formData[field.id] || []).includes(opt.value)}
                                                    onCheckedChange={(checked) => {
                                                        const current = formData[field.id] || [];
                                                        if (checked) {
                                                            handleChange(field.id, [...current, opt.value]);
                                                        } else {
                                                            handleChange(field.id, current.filter((v: string) => v !== opt.value));
                                                        }
                                                    }}
                                                />
                                                <label htmlFor={`${field.id}-${opt.value}`} className="min-w-0 break-words text-sm font-medium leading-snug cursor-pointer">
                                                    {opt.label}
                                                </label>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id={field.id}
                                                {...fieldA11y(field)}
                                                checked={formData[field.id] || false}
                                                onCheckedChange={(checked) => handleChange(field.id, checked)}
                                            />
                                            <label htmlFor={field.id} className="min-w-0 break-words text-sm font-medium leading-snug cursor-pointer">
                                                {field.placeholder || "Confirm"}
                                            </label>
                                        </div>
                                    )}
                                </div>
                            ) : field.type === 'RADIO' ? (
                                <div className="space-y-2 pt-1">
                                    {normalizeOptions(field.options).map((opt) => (
                                        <div key={opt.value} className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id={`${field.id}-${opt.value}`}
                                                name={field.id}
                                                {...fieldA11y(field)}
                                                value={opt.value}
                                                checked={formData[field.id] === opt.value}
                                                onChange={e => handleChange(field.id, e.target.value)}
                                                className="h-4 w-4 border-border text-primary focus:ring-primary"
                                            />
                                            <label htmlFor={`${field.id}-${opt.value}`} className="text-sm font-medium leading-none cursor-pointer text-foreground">
                                                {opt.label}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            ) : field.type === 'FILE' ? (
                                <div className="rounded-md bg-status-warning px-3 py-2 text-sm text-status-warning-foreground">
                                    File upload fields are not supported in this hosted form yet.
                                </div>
                            ) : field.type === 'FORMULA' ? (
                                <Input
                                    id={field.id}
                                    type="text"
                                    value={formData[field.id] || field.defaultValue || ''}
                                    readOnly
                                    className="w-full bg-muted/40"
                                />
                            ) : (
                                <Input
                                    id={field.id}
                                    {...fieldA11y(field)}
                                    type={field.type === 'NUMBER' ? 'number' : field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : 'text'}
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ''}
                                    onChange={e => handleChange(field.id, e.target.value)}
                                    className="w-full"
                                />
                            )}
                        </div>
                        {field.type !== 'HIDDEN' && field.helpText && <p id={`${field.id}-help`} className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
                        {errors[field.id] ? <p id={`${field.id}-error`} tabIndex={-1} className="text-xs font-medium text-destructive">{errors[field.id]}</p> : null}
                    </div>
                ))}
                            </div>
                        </div>
                    );
                })}

                <div className="flex flex-wrap gap-2">
                    {activeTabIndex > 0 && (
                        <Button type="button" variant="outline" className="w-full h-auto min-h-10 whitespace-normal py-3 text-base font-semibold" onClick={() => setActiveTabId(visibleTabs[activeTabIndex - 1].id)}>
                            Previous
                        </Button>
                    )}
                    {config.useMultiStep && activeTabIndex >= 0 && activeTabIndex < visibleTabs.length - 1 ? (
                        <Button type="button" className="w-full h-auto min-h-10 whitespace-normal py-3 text-base font-semibold" onClick={() => setActiveTabId(visibleTabs[activeTabIndex + 1].id)}>
                            Next
                        </Button>
                    ) : (
                <Button type="submit" className="w-full h-auto min-h-10 whitespace-normal py-3 text-base font-semibold shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]" disabled={submitting}>
                    {submitting ? (
                        <div className="flex items-center gap-2">
                            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Submitting...
                        </div>
                    ) : (config.submitButtonText || "Submit")}
                </Button>
                    )}
                </div>
            </form>
        </>
    );
}

function parseDraft(value: string | null) {
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}
