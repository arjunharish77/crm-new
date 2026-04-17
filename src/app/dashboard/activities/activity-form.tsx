'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Controller } from 'react-hook-form';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormHelperText,
    Box,
    Typography,
    Alert
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
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
            { id: 'activity_type_id', key: 'typeId', label: 'Activity Type', type: 'TEXT', isRequired: true, isCustom: false },
            { id: 'activity_lead_id', key: 'leadId', label: 'Lead', type: 'TEXT', isRequired: false, isCustom: false },
            { id: 'activity_opportunity_id', key: 'opportunityId', label: 'Opportunity', type: 'TEXT', isRequired: false, isCustom: false },
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
        typeId: ({ control, errors, setValue }: any) => (
            <Controller
                name="typeId"
                control={control}
                render={({ field: hookField }) => (
                    <Box>
                        <FormControl fullWidth error={!!errors.typeId}>
                            <InputLabel>Activity Type *</InputLabel>
                            <Select
                                {...hookField}
                                label="Activity Type *"
                                onChange={(e) => {
                                    hookField.onChange(e.target.value);
                                    setSelectedTypeId(e.target.value);
                                }}
                            >
                                {activityTypes.map((type) => (
                                    <MenuItem key={type.id} value={type.id}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: type.color || 'divider' }} />
                                            {type.name}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.typeId && <FormHelperText>{errors.typeId.message}</FormHelperText>}
                        </FormControl>
                        {selectedType?.defaultSLA && (
                            <Alert severity="info" sx={{ mt: 1, py: 0.5 }}>
                                SLA: {selectedType.defaultSLA} min
                            </Alert>
                        )}
                    </Box>
                )}
            />
        ),
        outcome: ({ control }: any) => (
            <Controller
                name="outcome"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth>
                        <InputLabel>Outcome</InputLabel>
                        <Select {...hookField} label="Outcome">
                            <MenuItem value="">None</MenuItem>
                            <MenuItem value="SUCCESS">Success</MenuItem>
                            <MenuItem value="FOLLOW_UP_NEEDED">Follow-up Needed</MenuItem>
                            <MenuItem value="NO_ANSWER">No Answer</MenuItem>
                            <MenuItem value="VOICEMAIL">Voicemail</MenuItem>
                            <MenuItem value="NOT_INTERESTED">Not Interested</MenuItem>
                        </Select>
                    </FormControl>
                )}
            />
        ),
        dueAt: ({ control }: any) => (
            <Controller
                name="dueAt"
                control={control}
                render={({ field: hookField }) => (
                    <DateTimePicker
                        label="Due Date (optional)"
                        value={hookField.value ? new Date(hookField.value) : null}
                        onChange={(date) => hookField.onChange(date ? date.toISOString() : null)}
                        slotProps={{
                            textField: { fullWidth: true },
                            popper: { sx: { zIndex: 1501 } }
                        }}
                    />
                )}
            />
        ),
        leadId: ({ control }: any) => (
            <Controller
                name="leadId"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth>
                        <InputLabel>Related Lead</InputLabel>
                        <Select {...hookField} label="Related Lead">
                            <MenuItem value="">None</MenuItem>
                            {leads.map((l) => (
                                <MenuItem key={l.id} value={l.id}>
                                    {l.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            />
        ),
        opportunityId: ({ control }: any) => (
            <Controller
                name="opportunityId"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth>
                        <InputLabel>Related Opportunity</InputLabel>
                        <Select {...hookField} label="Related Opportunity">
                            <MenuItem value="">None</MenuItem>
                            {opportunities.map((opportunity) => (
                                <MenuItem key={opportunity.id} value={opportunity.id}>
                                    {opportunity.title}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            />
        )
    };

    if (coreLoading && !mergedMetadata) {
        return <Typography>Loading activity form...</Typography>;
    }

    return (
        <Box>
            {bootstrapError && (
                <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
                    {bootstrapError}
                </Alert>
            )}
            <DynamicFormRenderer
                metadata={mergedMetadata}
                initialData={initialData}
                fieldOverrides={fieldOverrides as any}
                onSuccess={onSuccess}
                onCancel={onCancel}
            />
        </Box>
    );
}
