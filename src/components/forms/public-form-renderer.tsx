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

interface FormConfig {
    fields: any[];
    successMessage?: string;
    redirectUrl?: string;
    theme?: string;
    customCss?: string;
    submitButtonText?: string;
    layoutColumns?: number;
    tabs?: Array<{ id: string; label: string }>;
    sections?: Array<{ id: string; tabId: string; label: string }>;
    useMultiStep?: boolean;
    showSectionNames?: boolean;
}

interface RendererProps {
    slug: string;
    config: FormConfig;
}

export function PublicFormRenderer({ slug, config }: RendererProps) {
    const searchParams = useSearchParams();
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [activeTabId, setActiveTabId] = useState(config.tabs?.[0]?.id || "tab_1");
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

        const savedDraft = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
        const draftData = parseDraft(savedDraft);
        setFormData(prev => ({ ...prev, ...initialData, ...draftData }));
    }, [fields, searchParams]);

    useEffect(() => {
        if (submitted || Object.keys(formData).length === 0) return;
        window.localStorage.setItem(draftKey, JSON.stringify(formData));
    }, [draftKey, formData, submitted]);

    // Conditional Logic Evaluation
    const visibleFields = useMemo(() => {
        return fields.filter(field => {
            if (!field.logic || !field.logic.fieldId) return true;

            const sourceValue = formData[field.logic.fieldId];
            const targetValue = field.logic.value;
            let isMatch = false;

            switch (field.logic.operator) {
                case 'equals': isMatch = String(sourceValue) === String(targetValue); break;
                case 'not_equals': isMatch = String(sourceValue) !== String(targetValue); break;
                case 'contains': isMatch = String(sourceValue).includes(String(targetValue)); break;
                case 'gt': isMatch = Number(sourceValue) > Number(targetValue); break;
                case 'lt': isMatch = Number(sourceValue) < Number(targetValue); break;
                default: isMatch = String(sourceValue) === String(targetValue);
            }

            return field.logic.action === 'SHOW' ? isMatch : !isMatch;
        });
    }, [fields, formData]);

    const isMissingRequiredValue = (value: unknown) => {
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === "string") return value.trim().length === 0;
        return !value;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate required fields (only visible ones)
        const missing = visibleFields.filter(f => f.required && isMissingRequiredValue(formData[f.id]));
        if (missing.length > 0) {
            toast.error(`Please fill in required fields: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const payload: Record<string, any> = {};

            // Map form fields
            fields.forEach(f => {
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

            await apiFetch(`/public/forms/${slug}/submit`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            window.localStorage.removeItem(draftKey);
            setSubmitted(true);
            if (config.redirectUrl) {
                setTimeout(() => {
                    window.location.href = config.redirectUrl!;
                }, 2000);
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to submit form");
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="text-center py-12 animate-in fade-in zoom-in duration-300">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Success!</h2>
                <p className="text-gray-600 text-lg">{config.successMessage || "Thank you for your submission."}</p>
            </div>
        );
    }

    const handleChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const clearDraft = () => {
        window.localStorage.removeItem(draftKey);
        setFormData({});
        toast.success("Draft cleared");
    };

    return (
        <>
            {config.customCss && <style dangerouslySetInnerHTML={{ __html: config.customCss }} />}
            <form onSubmit={handleSubmit} className={`space-y-4 form-theme-${config.theme || 'default'}`}>
                {Object.keys(formData).length > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <span>Draft is saved automatically on this device.</span>
                        <button type="button" className="font-semibold text-primary" onClick={clearDraft}>Clear draft</button>
                    </div>
                )}
                {fields.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                        This form does not have any fields yet.
                    </div>
                )}
                {tabs.length > 1 && (
                    <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTabId(tab.id)}
                                className={`px-3 py-2 text-sm font-semibold border-b-2 ${activeTabId === tab.id ? "border-primary text-primary" : "border-transparent text-gray-500"}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}
                {sections.filter((section) => section.tabId === activeTabId).map((section) => {
                    const sectionFields = visibleFields.filter((field) => (field.tabId || tabs[0].id) === activeTabId && (field.sectionId || sections.find((item) => item.tabId === activeTabId)?.id) === section.id);
                    if (sectionFields.length === 0) return null;
                    return (
                        <div key={section.id} className="space-y-3">
                            {config.showSectionNames !== false && <h3 className="text-sm font-bold text-gray-800">{section.label}</h3>}
                            <div className={config.layoutColumns === 1 ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                {sectionFields.map((field) => (
                    <div key={field.id} className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {field.type !== 'HIDDEN' && (
                            <Label htmlFor={field.id} className="text-sm font-semibold text-gray-700">
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                        )}

                        <div className="relative">
                            {field.type === 'HIDDEN' ? (
                                <input id={field.id} type="hidden" value={formData[field.id] || ''} readOnly />
                            ) : field.type === 'TEXTAREA' ? (
                                <Textarea
                                    id={field.id}
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ''}
                                    onChange={e => handleChange(field.id, e.target.value)}
                                    className="min-h-[120px] resize-y"
                                />
                            ) : field.type === 'SELECT' ? (
                                <Select onValueChange={val => handleChange(field.id, val)} value={formData[field.id] || ''}>
                                    <SelectTrigger id={field.id} className="w-full">
                                        <SelectValue placeholder={field.placeholder || "Select option..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {field.options?.map((opt: string) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : field.type === 'CHECKBOX' ? (
                                <div className="space-y-2 pt-1">
                                    {field.options && field.options.length > 0 ? (
                                        field.options.map((opt: string) => (
                                            <div key={opt} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`${field.id}-${opt}`}
                                                    checked={(formData[field.id] || []).includes(opt)}
                                                    onCheckedChange={(checked) => {
                                                        const current = formData[field.id] || [];
                                                        if (checked) {
                                                            handleChange(field.id, [...current, opt]);
                                                        } else {
                                                            handleChange(field.id, current.filter((v: string) => v !== opt));
                                                        }
                                                    }}
                                                />
                                                <label htmlFor={`${field.id}-${opt}`} className="text-sm font-medium leading-none cursor-pointer">
                                                    {opt}
                                                </label>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id={field.id}
                                                checked={formData[field.id] || false}
                                                onCheckedChange={(checked) => handleChange(field.id, checked)}
                                            />
                                            <label htmlFor={field.id} className="text-sm font-medium leading-none cursor-pointer">
                                                {field.placeholder || "Confirm"}
                                            </label>
                                        </div>
                                    )}
                                </div>
                            ) : field.type === 'RADIO' ? (
                                <div className="space-y-2 pt-1">
                                    {field.options?.map((opt: string) => (
                                        <div key={opt} className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id={`${field.id}-${opt}`}
                                                name={field.id}
                                                value={opt}
                                                checked={formData[field.id] === opt}
                                                onChange={e => handleChange(field.id, e.target.value)}
                                                className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <label htmlFor={`${field.id}-${opt}`} className="text-sm font-medium leading-none cursor-pointer text-gray-700">
                                                {opt}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            ) : field.type === 'FILE' ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
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
                                    type={field.type === 'NUMBER' ? 'number' : field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : 'text'}
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ''}
                                    onChange={e => handleChange(field.id, e.target.value)}
                                    className="w-full"
                                />
                            )}
                        </div>
                        {field.type !== 'HIDDEN' && field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
                    </div>
                ))}
                            </div>
                        </div>
                    );
                })}

                <div className="flex gap-2">
                    {tabs.findIndex((tab) => tab.id === activeTabId) > 0 && (
                        <Button type="button" variant="outline" className="w-full py-4 text-base font-bold" onClick={() => setActiveTabId(tabs[tabs.findIndex((tab) => tab.id === activeTabId) - 1].id)}>
                            Previous
                        </Button>
                    )}
                    {config.useMultiStep && tabs.findIndex((tab) => tab.id === activeTabId) < tabs.length - 1 ? (
                        <Button type="button" className="w-full py-4 text-base font-bold" onClick={() => setActiveTabId(tabs[tabs.findIndex((tab) => tab.id === activeTabId) + 1].id)}>
                            Next
                        </Button>
                    ) : (
                <Button type="submit" className="w-full py-4 text-base font-bold shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]" disabled={submitting}>
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
