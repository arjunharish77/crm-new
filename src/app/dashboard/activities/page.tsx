"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Activity } from "@/types/activities";
import { PaginatedResponse } from "@/types/common";
import { apiFetch } from "@/lib/api";
import {
    Box,
    Typography,
    Stack,
    Button,
    useTheme,
    alpha,
    Paper,
    IconButton,
    Tooltip
} from "@mui/material";
import {
    FilterAlt as FilterIcon,
    CalendarMonth as CalendarIcon,
    Refresh as RefreshIcon
} from "@mui/icons-material";
import { toast } from "sonner";
import { ActivitiesMobileList } from "./activities-mobile-list";
import { CreateActivityDialog } from "./create-activity-dialog";
import { StandardDataGrid } from "@/components/common/standard-data-grid";
import { columns } from "./columns";
import { FilterBuilder } from "@/components/filters/filter-builder";
import { FilterConfig, FilterField } from "@/types/filters";
import { ViewSwitcher } from "@/components/views/view-switcher";
import { EmptyState } from "@/components/common/empty-state";

const INITIAL_FILTER_FIELDS: FilterField[] = [
    { key: 'notes', label: 'Description', type: 'text' },
    {
        key: 'typeId',
        label: 'Activity Type',
        type: 'select',
        options: []
    },
    {
        key: 'outcome',
        label: 'Outcome',
        type: 'select',
        options: [
            { label: 'Success', value: 'SUCCESS' },
            { label: 'Follow-up Needed', value: 'FOLLOW_UP_NEEDED' },
            { label: 'No Answer', value: 'NO_ANSWER' },
            { label: 'Voicemail', value: 'VOICEMAIL' },
            { label: 'Not Interested', value: 'NOT_INTERESTED' },
        ]
    },
];

export default function ActivitiesPage() {
    const theme = useTheme();
    const [data, setData] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterFields, setFilterFields] = useState<FilterField[]>(INITIAL_FILTER_FIELDS);
    const [filters, setFilters] = useState<FilterConfig>({
        conditions: [],
        logic: 'AND',
    });

    useEffect(() => {
        apiFetch('/activity-types')
            .then((res) => {
                const typeOptions = res
                    .filter((t: any) => t.isActive)
                    .map((t: any) => ({ label: t.name, value: t.id }));

                setFilterFields(prev => prev.map(field => {
                    if (field.key === 'typeId') {
                        return { ...field, options: typeOptions };
                    }
                    return field;
                }));
            })
            .catch(() => toast.error('Failed to load activity types'));
    }, []);

    const buildQueryParams = useCallback(() => {
        const params = new URLSearchParams();
        if (filters.conditions.length > 0) {
            params.set('filters', JSON.stringify(filters));
        }
        return params.toString();
    }, [filters]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const queryString = buildQueryParams();
            const url = queryString ? `/activities?${queryString}` : '/activities';
            const response = await apiFetch<PaginatedResponse<Activity> | Activity[]>(url);

            if ('meta' in response && response.data) {
                setData(response.data);
            } else if (Array.isArray(response)) {
                setData(response);
            }
        } catch (error) {
            toast.error("Failed to fetch activities");
        } finally {
            setLoading(false);
        }
    }, [buildQueryParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
            {/* Header */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
                            Activities
                        </Typography>
                        <Box sx={{ ml: 2 }}>
                            <ViewSwitcher
                                module="ACTIVITIES"
                                currentFilters={filters}
                                onConfigChange={setFilters}
                            />
                        </Box>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Track and manage your sales interactions
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1.5}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchData} sx={{ bgcolor: 'action.hover' }}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    <Button
                        variant="outlined"
                        startIcon={<FilterIcon />}
                        onClick={() => setFilterOpen(!filterOpen)}
                        sx={{
                            borderRadius: '12px',
                            borderColor: filters.conditions.length > 0 ? 'primary.main' : 'divider',
                            bgcolor: filters.conditions.length > 0 ? alpha(theme.palette.primary.main, 0.05) : 'transparent'
                        }}
                    >
                        Filters
                        {filters.conditions.length > 0 && (
                            <Box sx={{
                                ml: 1,
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                borderRadius: '50%',
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700
                            }}>
                                {filters.conditions.length}
                            </Box>
                        )}
                    </Button>
                    <CreateActivityDialog onSuccess={fetchData} />
                </Stack>
            </Stack>

            {/* Filter Builder */}
            {filterOpen && (
                <Paper
                    elevation={0}
                    sx={{
                        p: 3,
                        mb: 3,
                        borderRadius: '16px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: alpha(theme.palette.primary.main, 0.02)
                    }}
                >
                    <FilterBuilder
                        fields={filterFields}
                        value={filters}
                        onChange={setFilters}
                    />
                </Paper>
            )}

            {/* Content */}
            {data.length === 0 && !loading ? (
                <EmptyState
                    icon={<CalendarIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />}
                    title="No activities found"
                    description="Log an activity or adjust your filters to see results."
                    action={<CreateActivityDialog onSuccess={fetchData} />}
                />
            ) : (
                <>
                    <Box sx={{ display: { xs: 'none', md: 'block' }, height: 'calc(100vh - 250px)', minHeight: 600 }}>
                        <StandardDataGrid
                            rows={data}
                            columns={columns}
                            loading={loading}
                            rowHeight={72}
                            checkboxSelection
                            disableRowSelectionOnClick
                        />
                    </Box>

                    <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 2 }}>
                        <ActivitiesMobileList data={data} />
                    </Box>
                </>
            )}
        </Box>
    );
}
