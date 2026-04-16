"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Typography,
    Divider,
    Chip,
    Tabs,
    Tab,
    Paper,
    IconButton,
    Stack,
    CircularProgress,
    useTheme,
    alpha,
    Grid
} from "@mui/material";
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as TrashIcon,
    Code as CodeIcon,
    Settings as SettingsIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { CustomFieldDialog } from "./custom-field-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

interface CustomField {
    id: string;
    key: string;
    label: string;
    objectType: "LEAD" | "OPPORTUNITY" | "ACTIVITY";
    fieldType: string;
    required: boolean;
    metadata?: any;
    order: number;
}

type ObjectType = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

function TabPanel(props: { children?: React.ReactNode; index: number; value: number }) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
        </div>
    );
}

export default function CustomFieldsPage() {
    const theme = useTheme();
    const [fields, setFields] = useState<CustomField[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [editingField, setEditingField] = useState<CustomField | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const objectTypes: ObjectType[] = ["LEAD", "OPPORTUNITY", "ACTIVITY"];

    const fetchFields = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/custom-fields");
            setFields(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch custom fields");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFields();
    }, [fetchFields]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this custom field? Existing data will be lost.")) {
            return;
        }

        try {
            await apiFetch(`/custom-fields/${id}`, { method: "DELETE" });
            toast.success("Custom field deleted");
            fetchFields();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete custom field");
        }
    };

    const handleEdit = (field: CustomField) => {
        setEditingField(field);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingField(null);
        setDialogOpen(true);
    };

    const currentType = objectTypes[activeTab];
    const filteredFields = fields.filter((f) => f.objectType === currentType);

    const getFieldTypeStyle = (type: string) => {
        const styles: Record<string, { color: string; bgcolor: string }> = {
            TEXT: { color: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.08) },
            NUMBER: { color: theme.palette.secondary.main, bgcolor: alpha(theme.palette.secondary.main, 0.08) },
            DATE: { color: theme.palette.info.main, bgcolor: alpha(theme.palette.info.main, 0.08) },
            SELECT: { color: theme.palette.warning.main, bgcolor: alpha(theme.palette.warning.main, 0.08) },
            TEXTAREA: { color: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.08) },
            CHECKBOX: { color: theme.palette.success.main, bgcolor: alpha(theme.palette.success.main, 0.08) },
        };
        return styles[type] || { color: theme.palette.text.secondary, bgcolor: theme.palette.action.hover };
    };

    return (
        <Box
            component={motion.div}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}
        >
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -1 }}>Custom Fields</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Extend your CRM data model with custom attributes for leads and activities
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ borderRadius: '12px', px: 3, py: 1 }}
                >
                    Add Custom Field
                </Button>
            </Stack>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    sx={{
                        '& .MuiTab-root': {
                            fontWeight: 700,
                            textTransform: 'none',
                            fontSize: '0.925rem',
                            minWidth: 120
                        }
                    }}
                >
                    <Tab label="Leads" />
                    <Tab label="Opportunities" />
                    <Tab label="Activities" />
                </Tabs>
            </Box>

            {objectTypes.map((type, index) => (
                <TabPanel key={type} value={activeTab} index={index}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress />
                        </Box>
                    ) : filteredFields.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 8, textAlign: 'center', borderRadius: '24px', borderStyle: 'dashed' }}>
                            <SettingsIcon sx={{ fontSize: 64, color: 'text.disabled', opacity: 0.3, mb: 2 }} />
                            <Typography variant="h6" color="text.secondary">No fields for {type.toLowerCase()}s</Typography>
                            <Button variant="text" onClick={handleCreate} sx={{ mt: 1 }}>Add your first field</Button>
                        </Paper>
                    ) : (
                        <Grid container spacing={2}>
                            {filteredFields
                                .sort((a, b) => a.order - b.order)
                                .map((field) => {
                                    const style = getFieldTypeStyle(field.fieldType);
                                    return (
                                        <Grid size={{ xs: 12 }} key={field.id}>
                                            <Card
                                                elevation={0}
                                                sx={{
                                                    borderRadius: '20px',
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    '&:hover': {
                                                        bgcolor: alpha(theme.palette.primary.main, 0.02),
                                                        borderColor: alpha(theme.palette.primary.main, 0.2)
                                                    }
                                                }}
                                            >
                                                <CardContent sx={{ p: '16px !important' }}>
                                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                        <Stack direction="row" spacing={2} alignItems="center">
                                                            <Paper sx={{ p: 1, borderRadius: '10px', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                                                                <CodeIcon fontSize="small" />
                                                            </Paper>
                                                            <Box>
                                                                <Stack direction="row" spacing={1} alignItems="center">
                                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{field.label}</Typography>
                                                                    <Chip
                                                                        label={field.fieldType}
                                                                        size="small"
                                                                        sx={{
                                                                            height: 20,
                                                                            fontSize: '0.625rem',
                                                                            fontWeight: 800,
                                                                            bgcolor: style.bgcolor,
                                                                            color: style.color,
                                                                            border: '1px solid',
                                                                            borderColor: alpha(style.color, 0.2)
                                                                        }}
                                                                    />
                                                                    {field.required && (
                                                                        <Chip label="Required" color="error" size="small" sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }} />
                                                                    )}
                                                                </Stack>
                                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                                    Key: <Typography variant="caption" component="code" sx={{ bgcolor: 'action.hover', px: 0.5, borderRadius: '4px', fontWeight: 600 }}>{field.key}</Typography>
                                                                    {field.fieldType === "SELECT" && field.metadata?.options && (
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            • Options: {field.metadata.options.join(", ")}
                                                                        </Typography>
                                                                    )}
                                                                </Typography>
                                                            </Box>
                                                        </Stack>
                                                        <Stack direction="row" spacing={1}>
                                                            <IconButton size="small" onClick={() => handleEdit(field)}>
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" color="error" onClick={() => handleDelete(field.id)}>
                                                                <TrashIcon fontSize="small" />
                                                            </IconButton>
                                                        </Stack>
                                                    </Stack>
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    );
                                })}
                        </Grid>
                    )}
                </TabPanel>
            ))}

            <CustomFieldDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                customField={editingField}
                defaultObjectType={currentType}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchFields();
                }}
            />
        </Box>
    );
}
