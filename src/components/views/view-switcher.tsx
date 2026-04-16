"use client";

import { useEffect, useState } from "react";
import {
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    ListSubheader,
    IconButton,
    Box,
    Typography,
    Stack,
    Tooltip,
    SelectChangeEvent,
    useTheme,
    alpha
} from "@mui/material";
import { Star, Save, LayoutList } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { FilterConfig } from "@/types/filters";
import { SaveViewDialog } from "./save-view-dialog";

interface ViewSwitcherProps {
    module: string;
    currentFilters: FilterConfig;
    onConfigChange: (filters: FilterConfig) => void;
}

interface SavedView {
    id: string;
    name: string;
    isDefault: boolean;
    isShared: boolean;
    filters: FilterConfig;
}

export function ViewSwitcher({
    module,
    currentFilters,
    onConfigChange,
}: ViewSwitcherProps) {
    const theme = useTheme();
    const [views, setViews] = useState<SavedView[]>([]);
    const [currentViewId, setCurrentViewId] = useState<string>("custom");
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);

    const fetchViews = async () => {
        try {
            const data = await apiFetch(`/saved-views?module=${module}`);
            setViews(data);

            // Apply default view if no filters are set (initial load)
            const defaultView = data.find((v: SavedView) => v.isDefault);
            if (defaultView && currentFilters.conditions.length === 0) {
                onConfigChange(defaultView.filters);
                setCurrentViewId(defaultView.id);
            }
        } catch (error) {
            console.error("Failed to fetch views");
        }
    };

    useEffect(() => {
        fetchViews();
    }, []);

    const handleViewChange = (event: SelectChangeEvent) => {
        const viewId = event.target.value as string;
        setCurrentViewId(viewId);

        if (viewId === "custom") {
            // Keep current filters or clear them? Usually keep.
        } else {
            const view = views.find((v) => v.id === viewId);
            if (view) {
                onConfigChange(view.filters);
            }
        }
    };

    const myViews = views.filter(v => !v.isShared);
    const sharedViews = views.filter(v => v.isShared);

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 200 }}>
                <Select
                    value={currentViewId}
                    onChange={handleViewChange}
                    displayEmpty
                    renderValue={(selected) => {
                        if (selected === "custom") {
                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <LayoutList size={16} />
                                    <Typography variant="body2">Custom View</Typography>
                                </Box>
                            );
                        }
                        const view = views.find(v => v.id === selected);
                        return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <LayoutList size={16} />
                                <Typography variant="body2">{view?.name || "Select View"}</Typography>
                            </Box>
                        );
                    }}
                    sx={{
                        bgcolor: 'background.paper',
                        '& .MuiSelect-select': {
                            display: 'flex',
                            alignItems: 'center',
                            py: 1, // Fix height
                        }
                    }}
                >
                    <MenuItem value="custom">Custom View</MenuItem>

                    {myViews.length > 0 && <ListSubheader>My Views</ListSubheader>}
                    {myViews.map((view) => (
                        <MenuItem key={view.id} value={view.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <Typography variant="body2">{view.name}</Typography>
                                {view.isDefault && <Star size={14} fill={theme.palette.warning.main} color={theme.palette.warning.main} />}
                            </Box>
                        </MenuItem>
                    ))}

                    {sharedViews.length > 0 && <ListSubheader>Shared Views</ListSubheader>}
                    {sharedViews.map((view) => (
                        <MenuItem key={view.id} value={view.id}>
                            <Typography variant="body2">{view.name}</Typography>
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            <Tooltip title="Save current view">
                <IconButton
                    onClick={() => setSaveDialogOpen(true)}
                    size="small"
                    sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1
                    }}
                >
                    <Save size={18} />
                </IconButton>
            </Tooltip>

            <SaveViewDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
                module={module}
                filters={currentFilters}
                onSuccess={(newView) => {
                    setViews([...views, newView]);
                    setCurrentViewId(newView.id);
                }}
            />
        </Stack>
    );
}
