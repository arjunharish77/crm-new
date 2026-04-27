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
    selectedCount,
    onClearSelection,
    sx,
    slots,
    slotProps,
    ...props
}: StandardDataGridProps) {
    const theme = useTheme();
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        const frame = window.requestAnimationFrame(() => setIsMounted(true));
        return () => window.cancelAnimationFrame(frame);
    }, []);

    const normalizedSelection = React.useMemo((): GridRowSelectionModel => {
        if (Array.isArray(props.rowSelectionModel)) {
            return { type: 'include', ids: new Set(props.rowSelectionModel) };
        }
        if (props.rowSelectionModel && typeof props.rowSelectionModel === 'object') {
            const model = props.rowSelectionModel as GridRowSelectionModel;
            if (model.ids instanceof Set) return model;
        }
        return { type: 'include', ids: new Set() };
    }, [props.rowSelectionModel]);

    const handleSelectionChange = React.useCallback((selection: any, details: any) => {
        if (props.onRowSelectionModelChange) {
            let ids: GridRowId[] = [];
            if (Array.isArray(selection)) {
                ids = selection;
            } else if (selection?.ids instanceof Set) {
                ids = Array.from(selection.ids);
            } else if (selection?.ids && typeof selection.ids[Symbol.iterator] === "function") {
                ids = Array.from(selection.ids);
            }
            props.onRowSelectionModelChange(ids as any, details ?? ({} as any));
        }
    }, [props.onRowSelectionModelChange]);

    if (!isMounted) {
        return <Box sx={{ minHeight: (sx as any)?.minHeight ?? 360 }} />;
    }

    return (
        <DataGrid
            {...props}
            rowSelectionModel={normalizedSelection}
            onRowSelectionModelChange={handleSelectionChange}
            disableRowSelectionExcludeModel
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
                    selectedCount,
                    onClear: onClearSelection,
                    ...slotProps?.toolbar,
                } as any,
                ...slotProps,
            }}
            sx={{
                minHeight: 360,
                height: (sx as any)?.height ?? (sx as any)?.minHeight ?? 520,
                border: 'none',
                cursor: 'pointer',
                '& .MuiDataGrid-toolbarContainer': {
                    minHeight: 44,
                },
                '& .MuiDataGrid-columnHeaders': {
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    minHeight: '42px !important',
                },
                '& .MuiDataGrid-columnHeader': {
                    py: 0,
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 700,
                    fontSize: '0.64rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'text.secondary'
                },
                '& .MuiDataGrid-row': {
                    minHeight: '46px !important',
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
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.86rem',
                },
                '& .MuiDataGrid-cellCheckbox, & .MuiDataGrid-columnHeaderCheckbox': {
                    px: 0.75,
                },
                '& .MuiDataGrid-footerContainer': {
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    minHeight: 44,
                },
                ...sx,
            }}
        />
    );
}

function CustomToolbar({
    onSelectAllFiltered,
    isAllSelected,
    totalItems,
    currentCount,
    selectedCount,
    onClear
}: any) {
    const showSelectAllOption = !isAllSelected && selectedCount >= currentCount && currentCount > 0 && totalItems > currentCount;

    return (
        <GridToolbarContainer sx={{ p: 0, flexDirection: 'column', alignItems: 'stretch' }}>
            <Box sx={{ px: 1.25, py: 0.875, display: 'flex', gap: 0.75, alignItems: 'center' }}>
                <GridToolbarColumnsButton />
                <GridToolbarFilterButton />
                <GridToolbarDensitySelector />
                <Box sx={{ flexGrow: 1 }} />
                <GridToolbarExport />
            </Box>

            {showSelectAllOption && (
                <Box sx={{
                    px: 1.25,
                    py: 0.875,
                    bgcolor: alpha('#1b6c31', 0.08),
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2" component="div" sx={{ fontWeight: 500 }}>
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
                    px: 1.25,
                    py: 0.875,
                    bgcolor: alpha('#1b6c31', 0.12),
                    display: 'flex',
                    justifyContent: 'center',
                    borderTop: '1px solid',
                    borderColor: 'divider'
                }}>
                    <Typography variant="body2" component="div" fontWeight={700} color="primary.main">
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
