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
import { RecordPicker } from '@/components/common/record-picker';
import { useAuth } from '@/providers/auth-provider';
import { ActivityType } from '@/types/activities';

interface ActivityFormProps {
    initialData?: any;
    onSuccess?: (data: any) => void;
    onCancel?: () => void;
}

const NONE_VALUE = '__none__';
const LINK_REQUIRED_MESSAGE = 'Choose the lead or opportunity this activity is for';

function toDatetimeLocalValue(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ActivityForm({ initialData, onSuccess, onCancel }: ActivityFormProps) {
    const { user } = useAuth();
    // Mirrors the server rule (activities-postgres assertActivityLinksAllowed): users who only see
    // their own or their team's records must tie an activity to a lead or opportunity they can see.
    const rolePermissions = user?.role && typeof user.role === 'object' ? (user.role as any).permissions : null;
    const linkRequired = !!rolePermissions?.isPartnerRole || rolePermissions?.recordAccess === 'OWN' || rolePermissions?.recordAccess === 'TEAM';
    const { metadata: coreMetadata, loading: coreLoading } = useObjectMetadata('activity');
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

            // Leads and opportunities are searched in the pickers (RecordPicker), instead of
            // preloading the first 100 of each, which hid every record after that.
            const [typesResult] = await Promise.allSettled([
                apiFetch<ActivityType[]>("/activity-types"),
            ]);

            if (cancelled) return;

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

    // The link error is set on leadId; hide it as soon as either link is chosen.
    const isLinkMissing = (errors: any, watch: any) =>
        errors?.leadId?.type === 'validate' && !watch('leadId') && !watch('opportunityId');

    const validateLinks = (values: any) =>
        linkRequired && !values.leadId && !values.opportunityId ? { leadId: LINK_REQUIRED_MESSAGE } : null;

    const fieldOverrides = {
        typeId: ({ control, errors }: any) => (
            <Controller
                name="typeId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label htmlFor="activity-type">Activity Type *</Label>
                        <Select
                            value={hookField.value || undefined}
                            onValueChange={(value) => {
                                hookField.onChange(value);
                                setSelectedTypeId(value);
                            }}
                        >
                            <SelectTrigger id="activity-type" className="w-full" aria-invalid={!!errors.typeId}>
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
                        <Label htmlFor="activity-outcome">Outcome</Label>
                        <Select
                            value={hookField.value || NONE_VALUE}
                            onValueChange={(value) => hookField.onChange(value === NONE_VALUE ? '' : value)}
                        >
                            <SelectTrigger id="activity-outcome" className="w-full">
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
        leadId: ({ control, errors, watch }: any) => (
            <Controller
                name="leadId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label htmlFor="activity-lead">Related Lead</Label>
                        <RecordPicker
                            id="activity-lead"
                            entity="lead"
                            value={hookField.value || null}
                            onChange={(id) => hookField.onChange(id ?? '')}
                            placeholder="Search leads"
                            invalid={isLinkMissing(errors, watch)}
                            describedBy={isLinkMissing(errors, watch) ? 'activity-link-error' : undefined}
                        />
                        {isLinkMissing(errors, watch) ? (
                            <p id="activity-link-error" className="text-xs text-destructive">{errors.leadId.message}</p>
                        ) : linkRequired ? (
                            <p className="text-xs text-muted-foreground">Choose a lead, an opportunity, or both</p>
                        ) : null}
                    </div>
                )}
            />
        ),
        opportunityId: ({ control, errors, watch }: any) => (
            <Controller
                name="opportunityId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-1.5">
                        <Label htmlFor="activity-opportunity">Related Opportunity</Label>
                        <RecordPicker
                            id="activity-opportunity"
                            entity="opportunity"
                            value={hookField.value || null}
                            onChange={(id) => hookField.onChange(id ?? '')}
                            placeholder="Search opportunities"
                            invalid={isLinkMissing(errors, watch)}
                            describedBy={isLinkMissing(errors, watch) ? 'activity-link-error' : undefined}
                        />
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
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-status-warning bg-status-warning px-3 py-2 text-sm text-status-warning-foreground">
                    <Info className="size-4 shrink-0" />
                    {bootstrapError}
                </div>
            )}
            <DynamicFormRenderer
                metadata={mergedMetadata}
                initialData={initialData}
                fieldOverrides={fieldOverrides as any}
                validate={validateLinks}
                onSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
}
