'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { Info } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DynamicFormRenderer } from '@/components/common/DynamicFormRenderer';
import { useObjectMetadata } from '@/hooks/use-object-metadata';
import { apiFetch } from '@/lib/api';
import { PaginatedResponse } from '@/types/common';
import { Lead } from '@/types/leads';
import { ActivityType } from '@/types/activities';
import { Opportunity } from '@/types/opportunities';

interface ActivityFormProps {
    initialData?: any;
    onSuccess?: (data: any) => void;
    onCancel?: () => void;
}

const NONE_VALUE = '__none__';

function toDatetimeLocalValue(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ActivityForm({ initialData, onSuccess, onCancel }: ActivityFormProps) {
    const { metadata: coreMetadata, loading: coreLoading } = useObjectMetadata('activity');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
    const [typeSpecificFields, setTypeSpecificFields] = useState<any[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState<string>(initialData?.typeId || '');
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);

    const fallbackMetadata = useMemo(() => ({
        name: 'activity',
        groups: [{ id: 'default', name: 'General Information' }],
        fields: [
            { id: 'activity_type_id', key: 'typeId', label: 'Activity Type', type: 'SELECT', isRequired: true, isCustom: false },
            { id: 'activity_lead_id', key: 'leadId', label: 'Lead', type: 'SELECT', isRequired: false, isCustom: false },
            { id: 'activity_opportunity_id', key: 'opportunityId', label: 'Opportunity', type: 'SELECT', isRequired: false, isCustom: false },
            { id: 'activity_outcome', key: 'outcome', label: 'Outcome', type: 'TEXT', isRequired: false, isCustom: false },
            { id: 'activity_notes', key: 'notes', label: 'Notes', type: 'TEXTAREA', isRequired: false, isCustom: false },
            { id: 'activity_due_at', key: 'dueAt', label: 'Due At', type: 'DATE', isRequired: false, isCustom: false },
        ],
    }), []);

    useEffect(() => {
        let cancelled = false;

        async function loadBootstrapData() {
            setBootstrapError(null);

            const [leadsResult, opportunitiesResult, typesResult] = await Promise.allSettled([
                apiFetch<PaginatedResponse<Lead> | Lead[]>("/leads?limit=100"),
                apiFetch<PaginatedResponse<Opportunity> | Opportunity[]>("/opportunities?limit=100"),
                apiFetch<ActivityType[]>("/activity-types"),
            ]);

            if (cancelled) return;

            if (leadsResult.status === 'fulfilled') {
                const leadsResponse = leadsResult.value;
                const leadsData =
                    'data' in leadsResponse && Array.isArray(leadsResponse.data)
                        ? leadsResponse.data
                        : Array.isArray(leadsResponse)
                            ? leadsResponse
                            : [];
                setLeads(leadsData);
            } else {
                setLeads([]);
            }

            if (opportunitiesResult.status === 'fulfilled') {
                const opportunitiesResponse = opportunitiesResult.value;
                const opportunitiesData =
                    'data' in opportunitiesResponse && Array.isArray(opportunitiesResponse.data)
                        ? opportunitiesResponse.data
                        : Array.isArray(opportunitiesResponse)
                            ? opportunitiesResponse
                            : [];
                setOpportunities(opportunitiesData);
            } else {
                setOpportunities([]);
            }

            if (typesResult.status === 'fulfilled') {
                setActivityTypes(Array.isArray(typesResult.value) ? typesResult.value : []);
            } else {
                setActivityTypes([]);
                setBootstrapError("Some activity setup data could not be loaded. You can still log a basic activity.");
            }
        }

        loadBootstrapData().catch(() => {
            if (!cancelled) {
                setBootstrapError("Some activity setup data could not be loaded. You can still log a basic activity.");
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (selectedTypeId) {
            apiFetch(`/type-custom-fields/by-type/ACTIVITY_TYPE/${selectedTypeId}`)
                .then((fields: any[]) => {
                    const transformedFields = fields.map(f => ({
                        id: f.id,
                        key: f.fieldKey,
                        label: f.fieldLabel,
                        type: f.fieldType,
                        isRequired: f.isRequired,
                        options: f.fieldConfig?.options || [],
                        order: f.order + 100, // Make sure they come after core fields
                        isCustom: true,
                    }));
                    setTypeSpecificFields(transformedFields);
                });
        } else {
            setTypeSpecificFields([]);
        }
    }, [selectedTypeId]);

    const mergedMetadata = useMemo(() => {
        const baseMetadata = coreMetadata || fallbackMetadata;
        if (!baseMetadata) return null;

        return {
            ...baseMetadata,
            fields: [...baseMetadata.fields, ...typeSpecificFields]
        };
    }, [coreMetadata, fallbackMetadata, typeSpecificFields]);

    const selectedType = activityTypes.find(t => t.id === selectedTypeId);

    const fieldOverrides = {
        typeId: ({ control, errors }: any) => (
            <Controller
                name="typeId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label>Activity Type *</Label>
                        <Select
                            value={hookField.value || undefined}
                            onValueChange={(value) => {
                                hookField.onChange(value);
                                setSelectedTypeId(value);
                            }}
                        >
                            <SelectTrigger className="w-full" aria-invalid={!!errors.typeId}>
                                <SelectValue placeholder="Select activity type" />
                            </SelectTrigger>
                            <SelectContent>
                                {activityTypes.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="size-3 shrink-0 rounded-full"
                                                style={{ backgroundColor: type.color || 'var(--border)' }}
                                            />
                                            {type.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.typeId && (
                            <p className="text-xs text-destructive">{errors.typeId.message}</p>
                        )}
                        {selectedType?.defaultSLA && (
                            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm text-foreground">
                                <Info className="size-3.5 shrink-0 text-primary" />
                                SLA: {selectedType.defaultSLA} min
                            </div>
                        )}
                    </div>
                )}
            />
        ),
        outcome: ({ control }: any) => (
            <Controller
                name="outcome"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label>Outcome</Label>
                        <Select
                            value={hookField.value || NONE_VALUE}
                            onValueChange={(value) => hookField.onChange(value === NONE_VALUE ? '' : value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select outcome" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>None</SelectItem>
                                <SelectItem value="SUCCESS">Success</SelectItem>
                                <SelectItem value="FOLLOW_UP_NEEDED">Follow-up Needed</SelectItem>
                                <SelectItem value="NO_ANSWER">No Answer</SelectItem>
                                <SelectItem value="VOICEMAIL">Voicemail</SelectItem>
                                <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        ),
        dueAt: ({ control }: any) => (
            <Controller
                name="dueAt"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label htmlFor="activity-due-at">Due Date (optional)</Label>
                        <Input
                            id="activity-due-at"
                            type="datetime-local"
                            value={toDatetimeLocalValue(hookField.value)}
                            onChange={(e) => {
                                const raw = e.target.value;
                                hookField.onChange(raw ? new Date(raw).toISOString() : null);
                            }}
                        />
                    </div>
                )}
            />
        ),
        leadId: ({ control }: any) => (
            <Controller
                name="leadId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label>Related Lead</Label>
                        <Select
                            value={hookField.value || NONE_VALUE}
                            onValueChange={(value) => hookField.onChange(value === NONE_VALUE ? '' : value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select lead" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>None</SelectItem>
                                {leads.map((l) => (
                                    <SelectItem key={l.id} value={l.id}>
                                        {l.name || l.email || l.company || "Lead"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        ),
        opportunityId: ({ control }: any) => (
            <Controller
                name="opportunityId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label>Related Opportunity</Label>
                        <Select
                            value={hookField.value || NONE_VALUE}
                            onValueChange={(value) => hookField.onChange(value === NONE_VALUE ? '' : value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select opportunity" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>None</SelectItem>
                                {opportunities.map((opportunity) => (
                                    <SelectItem key={opportunity.id} value={opportunity.id}>
                                        {opportunity.title || opportunity.lead?.name || "Opportunity"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        )
    };

    if (coreLoading && !mergedMetadata) {
        return <p className="text-sm text-muted-foreground">Loading activity form...</p>;
    }

    return (
        <div>
            {bootstrapError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                    <Info className="size-4 shrink-0" />
                    {bootstrapError}
                </div>
            )}
            <DynamicFormRenderer
                metadata={mergedMetadata}
                initialData={initialData}
                fieldOverrides={fieldOverrides as any}
                onSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
}
