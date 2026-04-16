"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardActions,
    Typography,
    Grid,
    IconButton,
    InputAdornment,
    TextField,
    Menu,
    MenuItem,
    Chip,
    Stack,
    CircularProgress,
    Divider,
    Container,
    Paper,
    useTheme,
    alpha
} from "@mui/material";
import {
    Add as PlusIcon,
    Search as SearchIcon,
    MoreVert as MoreVertIcon,
    Description as DescriptionIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    FilterList as FilterListIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions
} from "@mui/material";

interface Form {
    id: string;
    name: string;
    description?: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    _count?: {
        submissions: number;
    };
}

export default function FormsPage() {
    const theme = useTheme();
    const [forms, setForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newFormName, setNewFormName] = useState("");
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();

    // Menu state
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

    const fetchForms = async () => {
        setLoading(true);
        try {
            const data: any = await apiFetch("/forms");
            setForms(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load forms");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchForms();
    }, []);

    const handleCreate = async () => {
        if (!newFormName.trim()) return;
        setCreating(true);
        try {
            const newForm: any = await apiFetch("/forms", {
                method: "POST",
                body: JSON.stringify({ name: newFormName, isActive: true }),
            });
            toast.success("Form created");
            setCreateOpen(false);
            setNewFormName("");
            router.push(`/dashboard/forms/${newForm.id}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to create form");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedFormId) return;
        if (!confirm("Are you sure? This will delete the form and all submissions.")) return;

        try {
            await apiFetch(`/forms/${selectedFormId}`, { method: "DELETE" });
            toast.success("Form deleted");
            fetchForms();
        } catch (error) {
            toast.error("Failed to delete form");
        } finally {
            handleMenuClose();
        }
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, id: string) => {
        event.stopPropagation();
        setMenuAnchor(event.currentTarget);
        setSelectedFormId(id);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
        setSelectedFormId(null);
    };

    const filteredForms = forms.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getFormSlug = (slug: string) => {
        // Use window.location.origin if available, otherwise just relative
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/f/${slug}`;
        }
        return `/f/${slug}`;
    };

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header Section */}
            <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'start', md: 'center' }, gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight={700} gutterBottom>
                        Forms
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Create and manage lead capture forms for your campaigns.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<PlusIcon />}
                    onClick={() => setCreateOpen(true)}
                    sx={{ borderRadius: 20, px: 3 }}
                >
                    Create Form
                </Button>
            </Box>

            {/* Filter Bar */}
            <Paper
                elevation={0}
                variant="outlined"
                sx={{
                    p: 2,
                    mb: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    borderRadius: 3,
                    bgcolor: 'background.paper'
                }}
            >
                <TextField
                    placeholder="Search forms..."
                    size="small"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon color="action" />
                            </InputAdornment>
                        ),
                    }}
                    sx={{ flexGrow: 1, maxWidth: 400 }}
                />
                <Button variant="outlined" startIcon={<FilterListIcon />} sx={{ borderRadius: 20 }}>
                    Filters
                </Button>
            </Paper>

            {/* Content Area */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : filteredForms.length === 0 ? (
                <Paper
                    variant="outlined"
                    sx={{
                        p: 8,
                        textAlign: 'center',
                        borderRadius: 3,
                        borderStyle: 'dashed',
                        bgcolor: alpha(theme.palette.primary.main, 0.02)
                    }}
                >
                    <DescriptionIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
                    <Typography variant="h6" gutterBottom>No forms found</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        {searchQuery ? "Try adjusting your search terms" : "Create your first form to start collecting leads"}
                    </Typography>
                    {!searchQuery && (
                        <Button variant="contained" onClick={() => setCreateOpen(true)} sx={{ borderRadius: 20 }}>
                            Create Form
                        </Button>
                    )}
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filteredForms.map((form) => (
                        <Grid size={{ xs: 12, md: 6, lg: 4 }} key={form.id}>
                            <Card
                                variant="outlined"
                                sx={{
                                    borderRadius: 3,
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        boxShadow: theme.shadows[4],
                                        borderColor: 'primary.main',
                                        transform: 'translateY(-2px)'
                                    },
                                    cursor: 'pointer'
                                }}
                                onClick={() => router.push(`/dashboard/forms/${form.id}`)}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                        <Box>
                                            <Typography variant="h6" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                                                {form.name}
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                                <Chip
                                                    label={form.isActive ? "Active" : "Draft"}
                                                    size="small"
                                                    color={form.isActive ? "success" : "default"}
                                                    variant={form.isActive ? "filled" : "outlined"}
                                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                                />
                                                <Typography variant="caption" color="text.secondary">
                                                    • {formatDistanceToNow(new Date(form.createdAt), { addSuffix: true })}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, form.id)}>
                                            <MoreVertIcon />
                                        </IconButton>
                                    </Box>

                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, minHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                        {form.description || "No description provided."}
                                    </Typography>

                                    <Divider sx={{ mb: 2 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">
                                            <b>{form._count?.submissions || 0}</b> Submissions
                                        </Typography>
                                        <Button
                                            size="small"
                                            endIcon={<EditIcon sx={{ fontSize: 16 }} />}
                                            sx={{ borderRadius: 20 }}
                                        >
                                            Edit
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Create Dialog */}
            <Dialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, width: '100%', maxWidth: 400 } }}
            >
                <DialogTitle>Create New Form</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 3 }}>
                        Give your form a name to get started. You can configure fields later.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        label="Form Name"
                        placeholder="e.g. Contact Us"
                        fullWidth
                        value={newFormName}
                        onChange={(e) => setNewFormName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setCreateOpen(false)} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        disabled={!newFormName.trim() || creating}
                        sx={{ borderRadius: 20 }}
                    >
                        {creating ? "Creating..." : "Create & Edit"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Action Menu */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={handleMenuClose}
                PaperProps={{ sx: { borderRadius: 2, minWidth: 150 } }}
            >
                <MenuItem onClick={() => {
                    router.push(`/dashboard/forms/${selectedFormId}`);
                    handleMenuClose();
                }}>
                    <EditIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} /> Edit
                </MenuItem>
                <MenuItem onClick={() => {
                    const form = forms.find(f => f.id === selectedFormId);
                    if (form) window.open(getFormSlug(form.slug), '_blank');
                    handleMenuClose();
                }}>
                    <VisibilityIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} /> View Public
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                    <DeleteIcon fontSize="small" sx={{ mr: 1.5 }} /> Delete
                </MenuItem>
            </Menu>
        </Container>
    );
}
