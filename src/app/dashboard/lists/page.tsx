"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    FormatListBulleted as ListIcon,
    Search as SearchIcon,
    Visibility as ViewIcon,
} from "@mui/icons-material";
import { GridColDef } from "@mui/x-data-grid";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { AdvancedFilterModal, FilterGroup } from "@/components/filters/advanced-filter-modal";
import { formatWorkspaceDateTime } from "@/lib/date-format";

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

type LeadListSummary = {
    id: string;
    name: string;
    description?: string | null;
    type: "SMART" | "STATIC";
    count?: number;
    isActive?: boolean;
    updatedAt?: string;
    createdAt?: string;
};

export default function LeadListsPage() {
    const router = useRouter();
    const mountedRef = useRef(false);
    const [lists, setLists] = useState<LeadListSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [form, setForm] = useState({ name: "", description: "", type: "SMART" });
    const [filters, setFilters] = useState<FilterGroup[]>([]);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<"ALL" | "SMART" | "STATIC">("ALL");

    const fetchLists = useCallback(async () => {
        if (mountedRef.current) {
            setLoading(true);
        }
        try {
            const data = await apiFetch("/lead-lists");
            if (mountedRef.current) {
                setLists(Array.isArray(data) ? data : []);
            }
        } catch {
            if (mountedRef.current) {
                toast.error("Failed to load lists");
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        fetchLists();
        return () => {
            mountedRef.current = false;
        };
    }, [fetchLists]);

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

    const filteredLists = useMemo(() => {
        const term = search.trim().toLowerCase();
        return lists.filter((list) => {
            if (typeFilter !== "ALL" && list.type !== typeFilter) return false;
            if (!term) return true;
            return `${list.name} ${list.description ?? ""}`.toLowerCase().includes(term);
        });
    }, [lists, search, typeFilter]);

    const columns: GridColDef[] = [
        {
            field: "name",
            headerName: "List Name",
            flex: 1.2,
            minWidth: 260,
            renderCell: (params) => (
                <Box component={Link} href={`/dashboard/lists/${params.row.id}`} sx={{ textDecoration: "none", color: "inherit" }}>
                    <Typography sx={{ fontWeight: 800, color: "primary.main", lineHeight: 1.25 }}>
                        {params.value}
                    </Typography>
                    {params.row.description ? (
                        <Typography variant="caption" color="text.secondary" noWrap>
                            {params.row.description}
                        </Typography>
                    ) : null}
                </Box>
            ),
        },
        {
            field: "type",
            headerName: "Type",
            width: 150,
            renderCell: (params) => (
                <Chip
                    size="small"
                    label={params.value === "SMART" ? "Smart list" : "Static list"}
                    color={params.value === "SMART" ? "primary" : "default"}
                    sx={{ fontWeight: 800 }}
                />
            ),
        },
        {
            field: "count",
            headerName: "Leads",
            width: 120,
            renderCell: (params) => (
                <Typography sx={{ fontWeight: 800 }}>{params.value ?? 0}</Typography>
            ),
        },
        {
            field: "updatedAt",
            headerName: "Modified On",
            width: 170,
            renderCell: (params) => (
                <Typography variant="body2" color="text.secondary">
                    {formatWorkspaceDateTime(params.value as string)}
                </Typography>
            ),
        },
        {
            field: "actions",
            headerName: "",
            width: 120,
            sortable: false,
            filterable: false,
            renderCell: (params) => (
                <Button
                    component={Link}
                    href={`/dashboard/lists/${params.row.id}`}
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={(event) => event.stopPropagation()}
                >
                    View
                </Button>
            ),
        },
    ];

    return (
        <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1480, mx: "auto" }}>
            <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>Lead Lists</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Create static and smart lead views for segmentation, follow-up, and automation enrollment.
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: "10px" }}>
                        New List
                    </Button>
                </Stack>

                <Card sx={{ p: 1.25, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
                        <TextField
                            size="small"
                            placeholder="Search lists"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ minWidth: { md: 320 } }}
                        />
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                            <InputLabel>List Type</InputLabel>
                            <Select value={typeFilter} label="List Type" onChange={(event) => setTypeFilter(event.target.value as any)}>
                                <MenuItem value="ALL">All lists</MenuItem>
                                <MenuItem value="SMART">Smart lists</MenuItem>
                                <MenuItem value="STATIC">Static lists</MenuItem>
                            </Select>
                        </FormControl>
                        <Box sx={{ flexGrow: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                            {filteredLists.length} lists
                        </Typography>
                    </Stack>
                </Card>

                <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                    {filteredLists.length === 0 && !loading ? (
                        <Box sx={{ p: 5, textAlign: "center" }}>
                            <ListIcon sx={{ fontSize: 42, color: "text.disabled", mb: 1 }} />
                            <Typography fontWeight={800}>No lists found</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Create a smart list from filters or a static list for manual membership.
                            </Typography>
                        </Box>
                    ) : (
                        <StandardDataGrid
                            rows={filteredLists}
                            columns={columns}
                            loading={loading}
                            getRowId={(row) => row.id}
                            disableRowSelectionOnClick
                            hideFooterSelectedRowCount
                            initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }}
                            pageSizeOptions={[25, 50, 100]}
                            onRowClick={(params) => {
                                router.push(`/dashboard/lists/${params.row.id}`);
                            }}
                            sx={{ minHeight: 420 }}
                        />
                    )}
                </Card>
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
