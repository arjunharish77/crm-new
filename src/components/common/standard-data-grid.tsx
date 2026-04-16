"use client";

import React from "react";
import {
    DataGrid,
    DataGridProps,
    GridRowId,
    GridRowSelectionModel,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
} from "@mui/x-data-grid";
import { Box, Typography, Button, alpha, useTheme } from "@mui/material";

export interface StandardDataGridProps extends Omit<DataGridProps, 'rowSelectionModel' | 'onRowSelectionModelChange'> {
    rowSelectionModel?: GridRowId[] | GridRowSelectionModel;
    onRowSelectionModelChange?: (model: GridRowId[], details: any) => void;
    title?: string;
    description?: string;
    onSelectAllFiltered?: () => void;
    isAllSelected?: boolean;
    totalItems?: number;
    currentCount?: number;
    selectedCount?: number;
    onClearSelection?: () => void;
}

export function StandardDataGrid({
    title,
    description,
    onSelectAllFiltered,
    isAllSelected,
    totalItems,
    currentCount,
    onClearSelection,
    sx,
    slots,
    slotProps,
    ...props
}: StandardDataGridProps) {
    const theme = useTheme();

    const normalizedSelection = React.useMemo(() => {
        if (Array.isArray(props.rowSelectionModel)) {
            return {
                type: 'include',
                ids: new Set(props.rowSelectionModel)
            } as any;
        }
        return props.rowSelectionModel;
    }, [props.rowSelectionModel]);

    const handleSelectionChange = React.useCallback((selection: any) => {
        if (props.onRowSelectionModelChange) {
            const ids = selection?.ids ? Array.from(selection.ids) : [];
            props.onRowSelectionModelChange(ids as any, {} as any);
        }
    }, [props.onRowSelectionModelChange]);

    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div style={{ height: 400, width: '100%' }} />;

    return (
        <DataGrid
            {...props}
            rowSelectionModel={normalizedSelection}
            onRowSelectionModelChange={handleSelectionChange}
            slots={{
                toolbar: slots?.toolbar || CustomToolbar,
                ...slots,
            }}
            slotProps={{
                toolbar: {
                    onSelectAllFiltered,
                    isAllSelected,
                    totalItems,
                    currentCount,
                    onClear: onClearSelection,
                    ...slotProps?.toolbar,
                } as any,
                ...slotProps,
            }}
            sx={{
                border: 'none',
                cursor: 'pointer',
                '--DataGrid-containerBackground': 'transparent',
                '& .MuiDataGrid-columnHeaders': {
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'transparent',
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 700,
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'text.secondary'
                },
                '& .MuiDataGrid-row': {
                    transition: theme.transitions.create(['background-color'], {
                        duration: theme.transitions.duration.shorter,
                    }),
                    '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        cursor: 'pointer',
                    },
                    '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                        },
                    },
                },
                '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.5),
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                },
                '& .MuiDataGrid-footerContainer': {
                    borderTop: '1px solid',
                    borderColor: 'divider',
                },
                minHeight: 400,
                ...sx,
            }}
            autoHeight
        />
    );
}

function CustomToolbar({
    onSelectAllFiltered,
    isAllSelected,
    totalItems,
    currentCount,
    onClear
}: any) {
    const showSelectAllOption = !isAllSelected && currentCount > 0 && totalItems > currentCount;

    return (
        <GridToolbarContainer sx={{ p: 0, flexDirection: 'column', alignItems: 'stretch' }}>
            <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <GridToolbarColumnsButton />
                <GridToolbarFilterButton />
                <GridToolbarDensitySelector />
                <Box sx={{ flexGrow: 1 }} />
                <GridToolbarExport />
            </Box>

            {showSelectAllOption && (
                <Box sx={{
                    p: 1.5,
                    bgcolor: alpha('#1b6c31', 0.08), // Using a soft primary container tint
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        All {currentCount} items on this page are selected.
                        <Button
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectAllFiltered();
                            }}
                            sx={{ ml: 1, textTransform: 'none', fontWeight: 700 }}
                        >
                            Select all {totalItems} items
                        </Button>
                    </Typography>
                </Box>
            )}

            {isAllSelected && (
                <Box sx={{
                    p: 1.5,
                    bgcolor: alpha('#1b6c31', 0.12),
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2" fontWeight={700} color="primary.main">
                        All {totalItems} items are selected.
                        <Button
                            size="small"
                            onClick={onClear}
                            sx={{ ml: 1, textTransform: 'none', fontWeight: 700 }}
                        >
                            Clear selection
                        </Button>
                    </Typography>
                </Box>
            )}
        </GridToolbarContainer>
    );
}
