import { Card, Box, Typography, Stack, IconButton, Divider, Chip, Tooltip, useTheme, alpha } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Label as LabelIcon, Delete as DeleteIcon } from '@mui/icons-material';
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
                borderRadius: '24px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'surfaceContainerLowest',
            }}
        >
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <LabelIcon sx={{ color: 'primary.main' }} />
                    <Typography variant="h6" fontWeight={700}>Custom Fields</Typography>
                </Stack>
                <IconButton size="small" onClick={onAdd} sx={{ bgcolor: 'primaryContainer', color: 'onPrimaryContainer' }}>
                    <AddIcon fontSize="small" />
                </IconButton>
            </Box>

            <Box sx={{ p: 3 }}>
                {fields.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4, opacity: 0.6 }}>
                        <Typography variant="body2" color="text.secondary">No custom fields defined</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2.5}>
                        {fields.map((field) => (
                            <Box key={field.id} className="group">
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {field.label}
                                    </Typography>
                                    <IconButton size="small" onClick={() => onEdit?.(field)} sx={{ opacity: 0, '.group:hover &': { opacity: 1 } }}>
                                        <EditIcon fontSize="small" sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Stack>
                                <Typography variant="body1" fontWeight={500}>
                                    {String(field.value)}
                                </Typography>
                                <Divider sx={{ mt: 1.5, opacity: 0.5 }} />
                            </Box>
                        ))}
                    </Stack>
                )}
            </Box>
        </Card>
    );
}
