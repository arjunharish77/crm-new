'use client';

import React, { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { DynamicFormRenderer } from '@/components/common/DynamicFormRenderer';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { formatWorkspaceDateInput, workspaceDateInputToIso } from '@/lib/date-format';
import { PaginatedResponse } from '@/types/common';
import { Lead } from '@/types/leads';
import { OpportunityType, StageDefinition } from '@/types/opportunities';

interface OpportunityFormProps {
    initialData?: any;
    onSuccess?: (data: any) => void;
    onCancel?: () => void;
}

// Radix Select doesn't allow an empty string as an item value, so "no
// selection" is represented with this sentinel and translated back to "" at
// the react-hook-form boundary.
const NONE_VALUE = '__none__';

/**
 * Opportunity creation/edit form.
 *
 * Architecture: Stages come from the selected OpportunityType.
 * Stages are configured per OpportunityType.
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
                    <div className="space-y-2">
                        <Label>Lead *</Label>
                        <Select value={hookField.value || undefined} onValueChange={hookField.onChange}>
                            <SelectTrigger aria-invalid={!!errors.leadId} className="w-full">
                                <SelectValue placeholder="Select a lead" />
                            </SelectTrigger>
                            <SelectContent>
                                {leads.map(l => (
                                    <SelectItem key={l.id} value={l.id}>{l.name} ({l.email})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.leadId && <p className="text-xs text-destructive">{errors.leadId.message}</p>}
                    </div>
                )}
            />
        ),

        // Opportunity Type selector — drives available stages
        opportunityTypeId: ({ control, errors, setValue }: any) => (
            <Controller
                name="opportunityTypeId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-2">
                        <Label>Opportunity Type *</Label>
                        <Select
                            value={hookField.value || NONE_VALUE}
                            onValueChange={(value) => {
                                const nextValue = value === NONE_VALUE ? '' : value;
                                hookField.onChange(nextValue);
                                const type = types.find(t => t.id === nextValue) || null;
                                setSelectedType(type);
                                // Auto-set first stage of the selected type
                                const firstStage = type?.stages?.[0];
                                setValue('stageId', firstStage ? firstStage.id : '');
                            }}
                        >
                            <SelectTrigger aria-invalid={!!errors.opportunityTypeId} className="w-full">
                                <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>None</SelectItem>
                                {types.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.opportunityTypeId && <p className="text-xs text-destructive">{errors.opportunityTypeId.message}</p>}
                    </div>
                )}
            />
        ),

        // Stage selector — shows stages from selected OpportunityType
        stageId: ({ control, errors }: any) => (
            <Controller
                name="stageId"
                control={control}
                render={({ field: hookField }) => (
                    <div className="space-y-2">
                        <Label>Stage</Label>
                        <Select
                            value={hookField.value || undefined}
                            onValueChange={hookField.onChange}
                            disabled={!selectedType}
                        >
                            <SelectTrigger aria-invalid={!!errors.stageId} className="w-full">
                                <SelectValue placeholder="Select a stage" />
                            </SelectTrigger>
                            <SelectContent>
                                {(selectedType?.stages || []).map((s: StageDefinition) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.label || s.name}
                                        {s.probability != null ? ` (${s.probability}%)` : ''}
                                        {s.isWon ? ' ✓ Won' : s.isClosed ? ' ✗ Closed' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.stageId && <p className="text-xs text-destructive">{errors.stageId.message}</p>}
                    </div>
                )}
            />
        ),

        // Expected close date picker — plain shadcn-styled date input, no
        // calendar-popover component exists in this repo yet.
        expectedCloseDate: ({ control, errors }: any) => (
            <Controller
                name="expectedCloseDate"
                control={control}
                render={({ field: hookField }) => {
                    const inputValue = formatWorkspaceDateInput(hookField.value);

                    return (
                        <div className="space-y-2">
                            <Label>Expected Close Date</Label>
                            <Input
                                type="date"
                                value={inputValue}
                                aria-invalid={!!errors.expectedCloseDate}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    hookField.onChange(workspaceDateInputToIso(value));
                                }}
                            />
                            {errors.expectedCloseDate && (
                                <p className="text-xs text-destructive">{errors.expectedCloseDate.message}</p>
                            )}
                        </div>
                    );
                }}
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
