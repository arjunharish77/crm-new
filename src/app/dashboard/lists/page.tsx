"use client";

import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { Add as AddIcon, FormatListBulleted as ListIcon } from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { AdvancedFilterModal, FilterGroup } from "@/components/filters/advanced-filter-modal";

const LEAD_FILTER_FIELDS = [
    { label: "Name", key: "name", type: "text" },
    { label: "Email", key: "email", type: "text" },
    {
        label: "Status",
        key: "status",
        type: "select",
        options: [
            { label: "New", value: "NEW" },
            { label: "Qualified", value: "QUALIFIED" },
            { label: "Contacted", value: "CONTACTED" },
            { label: "Lost", value: "LOST" },
            { label: "Converted", value: "CONVERTED" },
        ],
    },
    { label: "Source", key: "source", type: "text" },
    { label: "Score", key: "score", type: "number" },
];

export default function LeadListsPage() {
    const [lists, setLists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [form, setForm] = useState({ name: "", description: "", type: "SMART" });
    const [filters, setFilters] = useState<FilterGroup[]>([]);

    const fetchLists = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/lead-lists");
            setLists(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load lists");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLists();
    }, []);

    const createList = async () => {
        if (!form.name.trim()) {
            toast.error("List name is required");
            return;
        }
        try {
            await apiFetch("/lead-lists", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    filters: form.type === "SMART" ? filters : [],
                }),
            });
            toast.success("List created");
            setOpen(false);
            setForm({ name: "", description: "", type: "SMART" });
            setFilters([]);
            fetchLists();
        } catch {
            toast.error("Failed to create list");
        }
    };

    return (
        <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1400, mx: "auto" }}>
            <Stack spacing={2}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>Lead Lists</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Create static lists and smart lists for segmentation, follow-up, and automation enrollment.
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: "10px" }}>
                        New List
                    </Button>
                </Stack>

                <Stack spacing={1.25}>
                    {lists.length === 0 && !loading ? (
                        <Card sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
                            <ListIcon sx={{ fontSize: 42, color: "text.disabled", mb: 1 }} />
                            <Typography fontWeight={800}>No lists yet</Typography>
                            <Typography variant="body2" color="text.secondary">Create a smart list from filters or a static list for manual membership.</Typography>
                        </Card>
                    ) : lists.map((list) => (
                        <Card key={list.id} sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                                <Box>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Typography fontWeight={800}>{list.name}</Typography>
                                        <Chip size="small" label={list.type === "SMART" ? "Smart list" : "Static list"} color={list.type === "SMART" ? "primary" : "default"} />
                                    </Stack>
                                    {list.description && <Typography variant="body2" color="text.secondary">{list.description}</Typography>}
                                </Box>
                                <Typography variant="body2" fontWeight={800}>{list.count ?? 0} leads</Typography>
                            </Stack>
                        </Card>
                    ))}
                </Stack>
            </Stack>

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>New lead list</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label="Name" size="small" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                        <TextField label="Description" size="small" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                        <FormControl size="small">
                            <InputLabel>Type</InputLabel>
                            <Select value={form.type} label="Type" onChange={(event) => setForm({ ...form, type: event.target.value })}>
                                <MenuItem value="SMART">Smart list</MenuItem>
                                <MenuItem value="STATIC">Static list</MenuItem>
                            </Select>
                        </FormControl>
                        {form.type === "SMART" && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button variant="outlined" size="small" onClick={() => setFilterOpen(true)}>Configure filters</Button>
                                <Typography variant="caption" color="text.secondary">{filters.reduce((sum, group) => sum + group.conditions.length, 0)} conditions</Typography>
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={createList}>Create</Button>
                </DialogActions>
            </Dialog>

            <AdvancedFilterModal
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                fields={LEAD_FILTER_FIELDS}
                onApply={setFilters}
            />
        </Box>
    );
}
