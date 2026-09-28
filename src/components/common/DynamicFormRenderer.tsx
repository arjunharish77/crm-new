'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useObjectMetadata } from '@/hooks/use-object-metadata';
import { MuiDynamicField } from '@/components/forms/mui-dynamic-field';
import { apiFetch } from '@/lib/api';
import { ErrorState } from '@/components/common/error-state';
import { toast } from 'sonner';
import { useRetainedEditorDraft } from '@/providers/editor-draft-provider';
import { useEditorDismissGuard } from '@/hooks/use-editor-dismiss-guard';
import { useRegisterShortcut } from '@/lib/keyboard-shortcuts';

const RESOURCE_PATHS: Record<string, string> = {
    lead: '/leads',
    opportunity: '/opportunities',
    activity: '/activities',
    form: '/forms',
};

function getResourcePath(name?: string) {
    if (!name) return '/';
    return RESOURCE_PATHS[name.toLowerCase()] ?? `/${name.toLowerCase()}s`;
}

interface DynamicFormRendererProps {
    objectName?: string;
    metadata?: any;
    initialData?: any;
    onSuccess?: (data: any) => void;
    onCancel?: () => void;
    saveUrl?: string;
    fieldOverrides?: Record<string, (props: { field: any, control: any, errors: any, setValue: any, watch: any }) => React.ReactNode>;
}

export function DynamicFormRenderer({
    objectName,
    metadata: externalMetadata,
    initialData,
    onSuccess,
    onCancel,
    saveUrl,
    fieldOverrides
}: DynamicFormRendererProps) {
    const { metadata: fetchedMetadata, loading: metadataLoading, error: metadataError, retry: retryMetadata } = useObjectMetadata(objectName || '');
    const metadata = externalMetadata || fetchedMetadata;
    const isMetadataLoading = externalMetadata ? false : metadataLoading;
    const draftKey = `form:${saveUrl || objectName || metadata?.name || 'unknown'}:${initialData?.id || `new:${JSON.stringify(initialData ?? {})}`}`;
    const { draft, update: updateDraft, current: currentDraft } = useRetainedEditorDraft(draftKey);
    const isSaving = draft.pending;
    const saveError = draft.error;
    const setIsSaving = (pending: boolean) => updateDraft({ pending });
    const setSaveError = (error: string) => updateDraft({ error });
    const version = useRef(0);
    useEffect(() => { version.current += 1; return () => { version.current += 1; }; }, [draftKey]);
    const savingRef = useRef(false);
    const fields = useMemo(() => Array.isArray(metadata?.fields) ? metadata.fields : [], [metadata]);

    // 1. Generate Schema and Default Values
    const { schema, defaultValues } = useMemo(() => {
        if (!metadata) return { schema: z.object({}), defaultValues: {} };

        const shape: any = {};
        const defaults: any = {};

        fields.forEach((field: any) => {
            let fieldSchema: any = z.any();

            if (field.isRequired) {
                if (field.type === 'NUMBER') {
                    fieldSchema = z.coerce.number();
                } else if (field.type === 'BOOLEAN') {
                    fieldSchema = z.boolean();
                } else {
                    fieldSchema = z.string().min(1, `${field.label} is required`);
                }
            } else {
                if (field.type === 'TEXT' || field.type === 'TEXTAREA') {
                    fieldSchema = z.string().optional().or(z.literal(""));
                } else if (field.type === 'NUMBER') {
                    fieldSchema = z.coerce.number().optional();
                } else {
                    fieldSchema = z.any().optional();
                }
            }

            shape[field.key] = fieldSchema;
            defaults[field.key] = initialData?.[field.key] ?? field.defaultValue ?? (field.type === 'BOOLEAN' ? false : "");
        });

        return { schema: z.object(shape), defaultValues: defaults };
    }, [metadata, fields, initialData]);

    const {
        control,
        handleSubmit,
        formState: { errors, isDirty },
        reset,
        setValue,
        watch,
    } = useForm({
        resolver: zodResolver(schema),
        defaultValues,
    });

    const baseline = useRef<Record<string, any>>(defaultValues);
    const canDismiss = useEditorDismissGuard(isDirty, isSaving, () => updateDraft({ values: null, dirty: false, error: "" }));

    useEffect(() => {
        baseline.current = defaultValues;
        reset(defaultValues);
        const retained = currentDraft();
        if (retained.values) {
            const restored = Object.fromEntries(Object.keys(defaultValues).map(key => [key, retained.values?.[key] ?? defaultValues[key]]));
            reset(restored, { keepDefaultValues: true });
        }
    }, [defaultValues, reset, currentDraft]);
    useEffect(() => {
        if (!metadata || isMetadataLoading) return;
        const subscription = watch(values => {
            const dirty = Object.keys(baseline.current).some(key => JSON.stringify(values[key]) !== JSON.stringify(baseline.current[key]));
            updateDraft({ values: dirty ? { ...values } : null, dirty });
        });
        return () => subscription.unsubscribe();
    }, [watch, defaultValues, metadata, isMetadataLoading, updateDraft]);

    useEffect(() => {
        if (!draft.savedValues || draft.pending) return;
        const saved = initialData?.id
            ? Object.fromEntries(Object.keys(defaultValues).map(key => [key, draft.savedValues?.[key] ?? defaultValues[key]]))
            : defaultValues;
        baseline.current = saved;
        reset(saved);
        updateDraft({ values: null, dirty: false, error: "", savedValues: null });
        toast.success("Your previous save completed successfully");
    }, [draft.savedValues, draft.pending, initialData?.id, defaultValues, reset, updateDraft]);

    const onSubmit = async (values: any) => {
        if (savingRef.current || currentDraft().pending || !metadata || isMetadataLoading || (!externalMetadata && metadataError)) return;
        const requestVersion = version.current;
        savingRef.current = true;
        setSaveError('');
        setIsSaving(true);
        try {
            const name = objectName || metadata?.name;
            const basePath = getResourcePath(name);
            const url = saveUrl || (initialData?.id ? `${basePath}/${initialData.id}` : basePath);
            const method = initialData?.id ? 'PATCH' : 'POST';

            // Split into core and hybrid data
            const payload: any = {};
            const hybridData: any = {};

            metadata.fields.forEach((f: any) => {
                if (f.isCustom) {
                    hybridData[f.key] = values[f.key];
                } else {
                    payload[f.key] = values[f.key];
                }
            });

            if (Object.keys(hybridData).length > 0) {
                payload.data = hybridData;
            }

            const response = await apiFetch(url, {
                method,
                body: JSON.stringify(payload),
            });

            updateDraft({ values: null, dirty: false, error: "", savedValues: requestVersion !== version.current ? response : null });
            if (requestVersion !== version.current) return;
            baseline.current = values;
            reset(values);
            updateDraft({ values: null, dirty: false, error: "" });
            toast.success(`${name} saved successfully`);
            onSuccess?.(response);
        } catch (error: any) {
            setSaveError(error.message || `Failed to save ${objectName || metadata?.name}`);
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    // Gap checklist Module 10's keyboard shortcut system, "save" sub-item -- this component
    // backs every entity's create/edit form (Lead/Opportunity/Activity today), so wiring it here
    // once covers all of them rather than each dialog re-implementing its own save shortcut.
    // Registered only while this form is actually mounted (a create dialog while open, an edit
    // dialog while open) -- Radix Dialog unmounts its content on close, so no extra open-state
    // tracking is needed here.
    useRegisterShortcut({
        id: `save-${objectName || metadata?.name || 'form'}`,
        combo: { key: 's', meta: true },
        description: `Save ${initialData?.id ? 'changes' : `new ${objectName || metadata?.name || 'record'}`}`,
        group: objectName ? objectName.charAt(0).toUpperCase() + objectName.slice(1) : 'Form',
        handler: () => handleSubmit(onSubmit)(),
    });

    if (isMetadataLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if ((!externalMetadata && metadataError) || !metadata) return <ErrorState description="Form fields could not be loaded." onRetry={retryMetadata} />;

    // 2. Group fields for rendering
    const groups = Array.isArray(metadata.groups) && metadata.groups.length > 0
        ? metadata.groups
        : [{ id: 'default', name: 'General Information' }];

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="@container/record-form min-w-0" aria-busy={isSaving}>
            {draft.dirty && <p role="status" className="mb-3 text-xs text-muted-foreground">Unsaved changes are kept while you navigate in this app. Refreshing or signing out clears them.</p>}
            <fieldset disabled={isSaving} className="min-w-0">
            <div className="flex flex-col gap-8">
                {groups.map((group: any) => {
                    const groupFields = group.id === 'default'
                        ? (Array.isArray(group.fields) ? group.fields : fields)
                        : fields.filter((f: any) => f.groupId === group.id);

                    if (!Array.isArray(groupFields) || groupFields.length === 0) return null;

                    return (
                        <div key={group.id} className="min-w-0">
                            <h3 className="break-words text-base font-semibold text-foreground">{group.name}</h3>
                            <div className="mt-1 mb-4 h-px w-full bg-border" />
                            <div className="grid min-w-0 grid-cols-1 gap-5 @min-[520px]/record-form:grid-cols-2">
                                {groupFields.map((field: any) => (
                                    <div
                                        key={field.id}
                                        className={field.type === 'TEXTAREA' ? 'min-w-0 col-span-1 @min-[520px]/record-form:col-span-2' : 'min-w-0 col-span-1'}
                                    >
                                        {fieldOverrides && fieldOverrides[field.key] ? (
                                            fieldOverrides[field.key]({ field, control, errors, setValue, watch })
                                        ) : (
                                            <Controller
                                                name={field.key}
                                                control={control}
                                                render={({ field: hookField }) => (
                                                    <MuiDynamicField
                                                        field={{ ...field, required: field.isRequired ?? field.required }}
                                                        value={hookField.value}
                                                        onChange={hookField.onChange}
                                                        error={errors[field.key]?.message as string}
                                                    />
                                                )}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                    {onCancel && (
                        <Button type="button" variant="outline" onClick={() => { if (canDismiss()) onCancel(); }}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" disabled={isSaving} className="px-6">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isSaving ? 'Saving...' : `Save ${objectName}`}
                    </Button>
                </div>
            </div>
            </fieldset>
        </form>
    );
}
