'use client';

import React, { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormHelperText,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DynamicFormRenderer } from '@/components/common/DynamicFormRenderer';
import { apiFetch } from '@/lib/api';
import { PaginatedResponse } from '@/types/common';
import { Lead } from '@/types/leads';
import { OpportunityType, StageDefinition } from '@/types/opportunities';

interface OpportunityFormProps {
    initialData?: any;
    onSuccess?: (data: any) => void;
    onCancel?: () => void;
}

/**
 * Opportunity creation/edit form.
 *
 * Architecture: Stages come from the selected OpportunityType.
 * There is no pipeline — stages are configured per OpportunityType.
 */
export function OpportunityForm({ initialData, onSuccess, onCancel }: OpportunityFormProps) {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [types, setTypes] = useState<OpportunityType[]>([]);
    const [selectedType, setSelectedType] = useState<OpportunityType | null>(null);

    useEffect(() => {
        Promise.all([
            apiFetch<PaginatedResponse<Lead> | Lead[]>('/leads?limit=100'),
            apiFetch<OpportunityType[]>('/opportunity-types'),
        ]).then(([leadsResponse, typesResponse]) => {
            let leadsData: Lead[] = [];
            if ('data' in leadsResponse && Array.isArray(leadsResponse.data)) {
                leadsData = leadsResponse.data;
            } else if (Array.isArray(leadsResponse)) {
                leadsData = leadsResponse;
            }
            setLeads(leadsData);

            const typesData = Array.isArray(typesResponse) ? typesResponse : [];
            setTypes(typesData);

            // Pre-select the type if editing
            if (initialData?.opportunityTypeId) {
                const t = typesData.find(x => x.id === initialData.opportunityTypeId);
                setSelectedType(t || null);
            }
        });
    }, [initialData]);

    const fieldOverrides = {
        // Lead selector
        leadId: ({ control, errors }: any) => (
            <Controller
                name="leadId"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth error={!!errors.leadId}>
                        <InputLabel>Lead *</InputLabel>
                        <Select {...hookField} label="Lead *">
                            {leads.map(l => (
                                <MenuItem key={l.id} value={l.id}>{l.name} ({l.email})</MenuItem>
                            ))}
                        </Select>
                        {errors.leadId && <FormHelperText>{errors.leadId.message}</FormHelperText>}
                    </FormControl>
                )}
            />
        ),

        // Opportunity Type selector — drives available stages
        opportunityTypeId: ({ control, errors, setValue }: any) => (
            <Controller
                name="opportunityTypeId"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth error={!!errors.opportunityTypeId}>
                        <InputLabel>Opportunity Type *</InputLabel>
                        <Select
                            {...hookField}
                            label="Opportunity Type *"
                            onChange={(e) => {
                                const value = e.target.value;
                                hookField.onChange(value);
                                const type = types.find(t => t.id === value) || null;
                                setSelectedType(type);
                                // Auto-set first stage of the selected type
                                const firstStage = type?.stages?.[0];
                                if (firstStage) {
                                    setValue('stageId', firstStage.id);
                                } else {
                                    setValue('stageId', '');
                                }
                            }}
                        >
                            <MenuItem value="">None</MenuItem>
                            {types.map(t => (
                                <MenuItem key={t.id} value={t.id}>
                                    {t.name}
                                </MenuItem>
                            ))}
                        </Select>
                        {errors.opportunityTypeId && <FormHelperText>{errors.opportunityTypeId.message}</FormHelperText>}
                    </FormControl>
                )}
            />
        ),

        // Stage selector — shows stages from selected OpportunityType
        stageId: ({ control, errors }: any) => (
            <Controller
                name="stageId"
                control={control}
                render={({ field: hookField }) => (
                    <FormControl fullWidth error={!!errors.stageId}>
                        <InputLabel>Stage</InputLabel>
                        <Select {...hookField} label="Stage" disabled={!selectedType}>
                            {(selectedType?.stages || []).map((s: StageDefinition) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {s.label || s.name}
                                    {s.probability != null ? ` (${s.probability}%)` : ''}
                                    {s.isWon ? ' ✓ Won' : s.isClosed ? ' ✗ Closed' : ''}
                                </MenuItem>
                            ))}
                        </Select>
                        {errors.stageId && <FormHelperText>{errors.stageId.message}</FormHelperText>}
                    </FormControl>
                )}
            />
        ),

        // Expected close date picker
        expectedCloseDate: ({ control, errors }: any) => (
            <Controller
                name="expectedCloseDate"
                control={control}
                render={({ field: hookField }) => (
                    <DatePicker
                        label="Expected Close Date"
                        value={hookField.value ? new Date(hookField.value) : null}
                        onChange={(date) => hookField.onChange(date ? date.toISOString() : null)}
                        slotProps={{
                            textField: { fullWidth: true, error: !!errors.expectedCloseDate, helperText: errors.expectedCloseDate?.message },
                            popper: { sx: { zIndex: 1501 } }
                        }}
                    />
                )}
            />
        ),
    };

    return (
        <DynamicFormRenderer
            objectName="opportunity"
            initialData={initialData}
            fieldOverrides={fieldOverrides as any}
            onSuccess={onSuccess}
            onCancel={onCancel}
        />
    );
}
