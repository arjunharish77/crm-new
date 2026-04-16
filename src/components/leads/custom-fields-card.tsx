import { Card, Box, Typography, Stack, IconButton, Divider, useTheme } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Label as LabelIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';

export interface CustomField {
    id: string;
    key: string;
    label: string;
    value: string | number | boolean;
    type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

interface CustomFieldsCardProps {
    fields: CustomField[];
    onAdd?: () => void;
    onEdit?: (field: CustomField) => void;
}

export function CustomFieldsCard({ fields, onAdd, onEdit }: CustomFieldsCardProps) {
    const theme = useTheme();

    return (
        <Card
            elevation={0}
            sx={{
                borderRadius: '16px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'surfaceContainerLowest',
            }}
        >
            <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <LabelIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                    <Typography variant="subtitle1" fontWeight={800}>Custom Fields</Typography>
                </Stack>
                <IconButton size="small" onClick={onAdd} sx={{ bgcolor: 'primaryContainer', color: 'onPrimaryContainer', width: 30, height: 30 }}>
                    <AddIcon fontSize="small" />
                </IconButton>
            </Box>

            <Box sx={{ p: 1.5 }}>
                {fields.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 2.5, opacity: 0.6 }}>
                        <Typography variant="body2" color="text.secondary">No custom fields defined</Typography>
                    </Box>
                ) : (
                    <Stack spacing={1.25}>
                        {fields.map((field) => (
                            <Box key={field.id} className="group">
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.375 }}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {field.label}
                                    </Typography>
                                    <IconButton size="small" onClick={() => onEdit?.(field)} sx={{ opacity: 0, '.group:hover &': { opacity: 1 }, width: 28, height: 28 }}>
                                        <EditIcon fontSize="small" sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Stack>
                                <Typography variant="body1" fontWeight={500}>
                                    {String(field.value)}
                                </Typography>
                                <Divider sx={{ mt: 1.125, opacity: 0.5 }} />
                            </Box>
                        ))}
                    </Stack>
                )}
            </Box>
        </Card>
    );
}
