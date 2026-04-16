"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CustomFieldDefinition } from "@/types/custom-fields";
import {
    Box,
    Button,
    Card,
    CardContent,
    Typography,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableContainer,
    Tabs,
    Tab,
    Chip,
    IconButton,
    Paper,
    useTheme,
    alpha
} from "@mui/material";
import { Delete as TrashIcon, Add as AddIcon } from "@mui/icons-material";
import { toast } from "sonner";
import { CreateCustomFieldDialog } from "./create-custom-field-dialog";

export default function CustomFieldsSettingsPage() {
    const theme = useTheme();
    const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("LEAD");

    const fetchFields = async (objectType: string) => {
        setLoading(true);
        try {
            const data = await apiFetch(`/custom-fields?objectType=${objectType}`);
            setFields(data);
        } catch (error) {
            toast.error("Failed to load custom fields");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFields(activeTab);
    }, [activeTab]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
        setActiveTab(newValue);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will not delete existing data but will hide the field.")) return;
        try {
            await apiFetch(`/custom-fields/${id}`, { method: 'DELETE' });
            toast.success("Field deleted");
            fetchFields(activeTab);
        } catch (error) {
            toast.error("Failed to delete field");
        }
    }

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Custom Fields</Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage custom fields for your CRM objects.
                    </Typography>
                </Box>
                <CreateCustomFieldDialog
                    objectType={activeTab}
                    onSuccess={() => fetchFields(activeTab)}
                />
            </Box>
            <Divider sx={{ mb: 4 }} />

            <Tabs
                value={activeTab}
                onChange={handleTabChange}
                sx={{
                    mb: 3,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minWidth: 120 }
                }}
            >
                <Tab label="Leads" value="LEAD" />
                <Tab label="Opportunities" value="OPPORTUNITY" />
                <Tab label="Activities" value="ACTIVITY" />
            </Tabs>

            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                            <TableRow>
                                <TableCell>Label</TableCell>
                                <TableCell>Key</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Required</TableCell>
                                <TableCell align="right" sx={{ width: 100 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {fields.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                        No custom fields defined.
                                    </TableCell>
                                </TableRow>
                            )}
                            {fields.map((field) => (
                                <TableRow key={field.id || field.key} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{field.label}</Typography>
                                            {field.isSystem && (
                                                <Chip label="System" size="small" variant="filled" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'primary.main', color: 'white' }} />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                                            {field.key}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={field.type}
                                            size="small"
                                            variant="outlined"
                                            sx={{ borderRadius: 1, fontSize: '0.75rem' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {field.required ? (
                                            <Chip label="Required" size="small" color="error" variant="outlined" />
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">Optional</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        {!field.isSystem && (
                                            <IconButton size="small" color="error" onClick={() => handleDelete(field.id)}>
                                                <TrashIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
