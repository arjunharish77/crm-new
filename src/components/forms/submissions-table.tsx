"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TablePagination,
    TableRow,
    Tooltip,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import {
    Download as DownloadIcon,
    MoreHoriz as MoreHorizIcon,
    OpenInNew as OpenInNewIcon,
    Refresh as RefreshIcon,
    ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface Submission {
    id: string;
    createdAt: string;
    status: "PROCESSED" | "SPAM" | "DUPLICATE" | "ERROR";
    spamScore: number;
    lead?: {
        id: string;
        name: string;
        email: string;
        status: string;
    };
    data: any;
}

interface SubmissionsTableProps {
    formId: string;
}

const STATUS_STYLES: Record<Submission["status"], { bg: string; color: string }> = {
    PROCESSED: { bg: "success.main", color: "success.main" },
    SPAM: { bg: "error.main", color: "error.main" },
    DUPLICATE: { bg: "warning.main", color: "warning.main" },
    ERROR: { bg: "error.main", color: "error.main" },
};

export function SubmissionsTable({ formId }: SubmissionsTableProps) {
    const theme = useTheme();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const limit = 20;
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

    const fetchSubmissions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch(`/forms/${formId}/submissions?limit=${limit}&offset=${page * limit}`);
            setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
            setTotal(typeof data.total === "number" ? data.total : 0);
        } catch (fetchError) {
            console.error(fetchError);
            setError("Failed to load submissions");
            toast.error("Failed to load submissions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubmissions();
    }, [formId, page]);

    const handleExport = async () => {
        try {
            toast.success("Preparing export...");
            const response = await apiFetch(`/forms/${formId}/export`, { method: "GET" });
            const blob = new Blob([response], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `submissions-${formId}-${format(new Date(), "yyyy-MM-dd")}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (exportError) {
            console.error(exportError);
            toast.error("Export failed. Please try again.");
        }
    };

    const summary = useMemo(() => {
        const processed = submissions.filter((submission) => submission.status === "PROCESSED").length;
        const flagged = submissions.filter((submission) => submission.status !== "PROCESSED").length;
        return { processed, flagged };
    }, [submissions]);

    return (
        <Stack spacing={2}>
            <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={1.5}
            >
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.3 }}>
                        Submissions ({total})
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Review captured form submissions, lead matches, and spam signals.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Tooltip title="Refresh">
                        <IconButton
                            onClick={fetchSubmissions}
                            disabled={loading}
                            sx={{
                                borderRadius: "10px",
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <DownloadIcon sx={{ fontSize: 16, mr: 1 }} />
                        Export CSV
                    </Button>
                </Stack>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Paper
                    variant="outlined"
                    sx={{
                        px: 1.5,
                        py: 1.25,
                        borderRadius: "12px",
                        minWidth: 180,
                        bgcolor: alpha(theme.palette.primary.main, 0.03),
                    }}
                >
                    <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Processed
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.25 }}>
                        {summary.processed}
                    </Typography>
                </Paper>
                <Paper
                    variant="outlined"
                    sx={{
                        px: 1.5,
                        py: 1.25,
                        borderRadius: "12px",
                        minWidth: 180,
                    }}
                >
                    <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Needs Review
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.25 }}>
                        {summary.flagged}
                    </Typography>
                </Paper>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            <Paper
                variant="outlined"
                sx={{
                    borderRadius: "14px",
                    overflow: "hidden",
                }}
            >
                <Table size="small">
                    <TableHead>
                        <TableRow
                            sx={{
                                "& th": {
                                    fontSize: "0.69rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    fontWeight: 800,
                                    color: "text.secondary",
                                    py: 1.25,
                                    bgcolor: "surfaceContainerLowest",
                                },
                            }}
                        >
                            <TableCell>Date</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Lead</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Spam Score</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && submissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <Stack alignItems="center" spacing={1}>
                                        <CircularProgress size={24} />
                                        <Typography variant="body2" color="text.secondary">
                                            Loading submissions...
                                        </Typography>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ) : submissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
                                        No submissions yet
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        New captures will appear here once this form starts receiving responses.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            submissions.map((submission) => {
                                const statusStyle = STATUS_STYLES[submission.status];
                                return (
                                    <TableRow
                                        key={submission.id}
                                        hover
                                        sx={{
                                            "& td": {
                                                py: 1.25,
                                                borderColor: alpha(theme.palette.divider, 0.55),
                                            },
                                        }}
                                    >
                                        <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                                            {format(new Date(submission.createdAt), "MMM d, h:mm a")}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={submission.status}
                                                size="small"
                                                sx={{
                                                    borderRadius: "8px",
                                                    fontWeight: 700,
                                                    fontSize: "0.67rem",
                                                    bgcolor: alpha(theme.palette[statusStyle.bg.split(".")[0] as "success" | "error" | "warning"].main, 0.08),
                                                    color: statusStyle.color,
                                                    border: "1px solid",
                                                    borderColor: alpha(theme.palette[statusStyle.bg.split(".")[0] as "success" | "error" | "warning"].main, 0.18),
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {submission.lead ? (
                                                <Stack direction="row" spacing={0.75} alignItems="center">
                                                    <Typography
                                                        component={Link}
                                                        href={`/dashboard/leads/${submission.lead.id}`}
                                                        sx={{
                                                            color: "primary.main",
                                                            fontWeight: 700,
                                                            textDecoration: "none",
                                                            "&:hover": { textDecoration: "underline" },
                                                        }}
                                                    >
                                                        {submission.lead.name}
                                                    </Typography>
                                                    <OpenInNewIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                                </Stack>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">-</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {submission.lead?.email || submission.data?.email || submission.data?.Email || "-"}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: submission.spamScore > 0.5 ? 700 : 500,
                                                    color: submission.spamScore > 0.5 ? "error.main" : "text.secondary",
                                                }}
                                            >
                                                {(submission.spamScore * 100).toFixed(0)}%
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton
                                                size="small"
                                                onClick={(event) => {
                                                    setMenuAnchor(event.currentTarget);
                                                    setActiveSubmission(submission);
                                                }}
                                                sx={{ borderRadius: "10px" }}
                                            >
                                                <MoreHorizIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>

                <TablePagination
                    component="div"
                    rowsPerPageOptions={[limit]}
                    rowsPerPage={limit}
                    page={page}
                    count={total}
                    onPageChange={(_, nextPage) => setPage(nextPage)}
                    sx={{
                        borderTop: "1px solid",
                        borderColor: "divider",
                        "& .MuiTablePagination-toolbar": {
                            minHeight: 52,
                            px: 1.5,
                        },
                    }}
                />
            </Paper>

            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => {
                    setMenuAnchor(null);
                    setActiveSubmission(null);
                }}
                PaperProps={{ sx: { borderRadius: "12px", minWidth: 180 } }}
            >
                <MenuItem
                    onClick={() => {
                        if (activeSubmission) {
                            navigator.clipboard.writeText(JSON.stringify(activeSubmission.data, null, 2));
                            toast.success("Submission JSON copied");
                        }
                        setMenuAnchor(null);
                    }}
                >
                    <ContentCopyIcon sx={{ fontSize: 16, mr: 1.25 }} />
                    Copy raw data
                </MenuItem>
                {activeSubmission?.lead && (
                    <MenuItem
                        component={Link}
                        href={`/dashboard/leads/${activeSubmission.lead.id}`}
                        onClick={() => setMenuAnchor(null)}
                    >
                        <OpenInNewIcon sx={{ fontSize: 16, mr: 1.25 }} />
                        Open lead
                    </MenuItem>
                )}
            </Menu>
        </Stack>
    );
}
