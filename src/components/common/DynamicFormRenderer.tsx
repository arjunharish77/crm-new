'use client';

import React, { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Box,
    Button,
    Grid,
    Typography,
    Divider,
    Paper,
    CircularProgress,
    Stack
} from '@mui/material';
import { useObjectMetadata } from '@/hooks/use-object-metadata';
import { MuiDynamicField } from '@/components/forms/mui-dynamic-field';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

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
    const { metadata: fetchedMetadata, loading: metadataLoading } = useObjectMetadata(objectName || '');
    const metadata = externalMetadata || fetchedMetadata;
    const [isSaving, setIsSaving] = useState(false);
    const fields = Array.isArray(metadata?.fields) ? metadata.fields : [];

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
        formState: { errors },
        reset,
        setValue,
        watch,
    } = useForm({
        resolver: zodResolver(schema),
        defaultValues,
    });

    const onSubmit = async (values: any) => {
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

            await apiFetch(url, {
                method,
                body: JSON.stringify(payload),
            });

            toast.success(`${name} saved successfully`);
            onSuccess?.(values);
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || `Failed to save ${objectName || metadata?.name}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (metadataLoading) {
        return (
            <Box display="flex" justifyContent="center" p={8}>
                <CircularProgress />
            </Box>
        );
    }

    if (!metadata) return <Typography>No metadata found for {objectName}</Typography>;

    // 2. Group fields for rendering
    const groups = Array.isArray(metadata.groups) && metadata.groups.length > 0
        ? metadata.groups
        : [{ id: 'default', name: 'General Information' }];

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={4}>
                {groups.map((group: any) => {
                    const groupFields = group.id === 'default'
                        ? (Array.isArray(group.fields) ? group.fields : fields)
                        : fields.filter((f: any) => f.groupId === group.id);

                    if (!Array.isArray(groupFields) || groupFields.length === 0) return null;

                    return (
                        <Box key={group.id}>
                            <Typography variant="h6" gutterBottom>{group.name}</Typography>
                            <Divider sx={{ mb: 2 }} />
                            <Grid container spacing={2.5}>
                                {groupFields.map((field: any) => (
                                    <Grid size={{ xs: 12, sm: field.type === 'TEXTAREA' ? 12 : 6 }} key={field.id}>
                                        {fieldOverrides && fieldOverrides[field.key] ? (
                                            fieldOverrides[field.key]({ field, control, errors, setValue, watch })
                                        ) : (
                                            <Controller
                                                name={field.key}
                                                control={control}
                                                render={({ field: hookField }) => (
                                                    <MuiDynamicField
                                                        field={field}
                                                        value={hookField.value}
                                                        onChange={hookField.onChange}
                                                        error={errors[field.key]?.message as string}
                                                    />
                                                )}
                                            />
                                        )}
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    );
                })}

                <Box display="flex" justifyContent="flex-end" gap={2} pt={2}>
                    {onCancel && (
                        <Button variant="outlined" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={isSaving}
                        sx={{ px: 4 }}
                    >
                        {isSaving ? 'Saving...' : `Save ${objectName}`}
                    </Button>
                </Box>
            </Stack>
        </form>
    );
}
