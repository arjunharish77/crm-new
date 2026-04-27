"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    Autocomplete,
    Box,
    Button,
    Card,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    ArrowBack as ArrowBackIcon,
    DeleteOutline as RemoveIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon,
    Visibility as ViewIcon,
} from "@mui/icons-material";
import { GridColDef, GridRowId } from "@mui/x-data-grid";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { formatWorkspaceDate } from "@/lib/date-format";

type LeadRecord = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    source?: string | null;
    status?: string | null;
    score?: number | null;
    createdAt?: string;
    updatedAt?: string;
};

type LeadListDetail = {
    id: string;
    name: string;
    description?: string | null;
    type: "SMART" | "STATIC";
    leads: LeadRecord[];
    count: number;
    updatedAt?: string;
};

export default function LeadListDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const listId = params.id;
    const [list, setList] = useState<LeadListDetail | null>(null);
    const [allLeads, setAllLeads] = useState<LeadRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [selectedToAdd, setSelectedToAdd] = useState<LeadRecord[]>([]);
    const [search, setSearch] = useState("");
    const [selectedRows, setSelectedRows] = useState<GridRowId[]>([]);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<LeadListDetail>(`/lead-lists/${listId}`);
            setList(data);
        } catch {
            toast.error("Failed to load list");
        } finally {
            setLoading(false);
        }
    }, [listId]);

    const fetchAllLeads = useCallback(async () => {
        try {
            const response = await apiFetch<any>("/leads?page=1&limit=5000");
            setAllLeads(Array.isArray(response) ? response : response.data ?? []);
        } catch {
            toast.error("Failed to load leads");
        }
    }, []);

    useEffect(() => {
        fetchList();
        fetchAllLeads();
    }, [fetchList, fetchAllLeads]);

    const existingLeadIds = useMemo(() => new Set((list?.leads ?? []).map((lead) => lead.id)), [list?.leads]);
    const addableLeads = useMemo(() => allLeads.filter((lead) => !existingLeadIds.has(lead.id)), [allLeads, existingLeadIds]);
    const visibleLeads = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return list?.leads ?? [];
        return (list?.leads ?? []).filter((lead) =>
            `${lead.name} ${lead.email ?? ""} ${lead.phone ?? ""} ${lead.company ?? ""} ${lead.source ?? ""} ${lead.status ?? ""}`
                .toLowerCase()
                .includes(term)
        );
    }, [list?.leads, search]);

    const addLeads = async () => {
        const leadIds = selectedToAdd.map((lead) => lead.id);
        if (leadIds.length === 0) {
            toast.error("Select at least one lead");
            return;
        }
        try {
            await apiFetch(`/lead-lists/${listId}/members`, {
                method: "POST",
                body: JSON.stringify({ leadIds }),
            });
            toast.success(`${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} added`);
            setAddOpen(false);
            setSelectedToAdd([]);
            fetchList();
        } catch {
            toast.error("Failed to add leads");
        }
    };

    const removeLead = async (leadId: string) => {
        if (!confirm("Remove this lead from the list?")) return;
        try {
            await apiFetch(`/lead-lists/${listId}/members/${leadId}`, { method: "DELETE" });
            toast.success("Lead removed from list");
            setSelectedRows((current) => current.filter((id) => id !== leadId));
            fetchList();
        } catch {
            toast.error("Failed to remove lead");
        }
    };

    const removeSelected = async () => {
        if (!list || list.type !== "STATIC" || selectedRows.length === 0) return;
        if (!confirm(`Remove ${selectedRows.length} selected lead${selectedRows.length === 1 ? "" : "s"} from this list?`)) return;
        try {
            await Promise.all(selectedRows.map((leadId) => apiFetch(`/lead-lists/${listId}/members/${leadId}`, { method: "DELETE" })));
            toast.success("Selected leads removed");
            setSelectedRows([]);
            fetchList();
        } catch {
            toast.error("Failed to remove selected leads");
        }
    };

    const columns: GridColDef[] = [
        {
            field: "name",
            headerName: "Lead Name",
            flex: 1,
            minWidth: 220,
            renderCell: (params) => (
                <Box component={Link} href={`/dashboard/leads/${params.row.id}`} sx={{ color: "primary.main", textDecoration: "none", fontWeight: 800 }}>
                    {params.value || "Untitled Lead"}
                </Box>
            ),
        },
        { field: "email", headerName: "Email", flex: 1, minWidth: 190 },
        { field: "phone", headerName: "Phone", width: 150 },
        { field: "company", headerName: "Company", width: 160 },
        {
            field: "status",
            headerName: "Stage",
            width: 130,
            renderCell: (params) => (
                <Chip size="small" label={params.value || "-"} sx={{ fontWeight: 800 }} />
            ),
        },
        { field: "source", headerName: "Source", width: 130 },
        {
            field: "createdAt",
            headerName: "Created On",
            width: 160,
            renderCell: (params) => (
                <Typography variant="body2" color="text.secondary">
                    {formatWorkspaceDate(params.value as string)}
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
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Open lead">
                        <IconButton size="small" component={Link} href={`/dashboard/leads/${params.row.id}`} onClick={(event) => event.stopPropagation()}>
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {list?.type === "STATIC" ? (
                        <Tooltip title="Remove from list">
                            <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); removeLead(params.row.id); }}>
                                <RemoveIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    ) : null}
                </Stack>
            ),
        },
    ];

    return (
        <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1500, mx: "auto" }}>
            <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} justifyContent="space-between" alignItems={{ md: "center" }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <IconButton onClick={() => router.push("/dashboard/lists")} size="small">
                            <ArrowBackIcon />
                        </IconButton>
                        <Box>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="h6" sx={{ fontWeight: 900 }}>{list?.name ?? "Lead List"}</Typography>
                                <Chip size="small" label={list?.type === "SMART" ? "Smart list" : "Static list"} color={list?.type === "SMART" ? "primary" : "default"} sx={{ fontWeight: 800 }} />
                                <Chip size="small" label={`${list?.count ?? 0} leads`} variant="outlined" sx={{ fontWeight: 800 }} />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                {list?.description || "Search, review, and manage leads in this list."}
                            </Typography>
                        </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchList}>Refresh</Button>
                        {list?.type === "STATIC" ? (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                                Add Leads
                            </Button>
                        ) : null}
                    </Stack>
                </Stack>

                <Card sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search leads in this list"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> }}
                    />
                </Card>

                <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                    <StandardDataGrid
                        rows={visibleLeads}
                        columns={columns}
                        loading={loading}
                        getRowId={(row) => row.id}
                        checkboxSelection
                        disableRowSelectionOnClick
                        rowSelectionModel={selectedRows}
                        onRowSelectionModelChange={(rows) => setSelectedRows(rows)}
                        hideFooterSelectedRowCount
                        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }}
                        pageSizeOptions={[25, 50, 100]}
                        sx={{ minHeight: 520 }}
                    />
                </Card>
            </Stack>

            <BulkActionsToolbar
                selectedCount={selectedRows.length}
                onClearSelection={() => setSelectedRows([])}
                module="leads"
                onDelete={list?.type === "STATIC" ? removeSelected : undefined}
            />

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Add leads to {list?.name}</DialogTitle>
                <DialogContent>
                    <Autocomplete
                        multiple
                        options={addableLeads}
                        value={selectedToAdd}
                        onChange={(_, value) => setSelectedToAdd(value)}
                        getOptionLabel={(option) => `${option.name || "Untitled Lead"}${option.email ? ` (${option.email})` : ""}`}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderInput={(params) => <TextField {...params} label="Leads" placeholder="Search leads to add" sx={{ mt: 1 }} />}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        Smart lists are filter-based; manual additions are available for static lists only.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={addLeads} disabled={selectedToAdd.length === 0}>Add To List</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
