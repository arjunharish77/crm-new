"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Box,
    Button,
    IconButton,
    Typography,
    Paper,
    alpha,
    useTheme,
} from "@mui/material";
import {
    Close as CloseIcon,
    Delete as DeleteIcon,
    Label as TagIcon,
    CheckCircle as StatusIcon,
    FileDownload as ExportIcon,
    Archive as ArchiveIcon,
    PersonAdd as AssignIcon,
    SwapHoriz as StageIcon,
    ToggleOn as ActivateIcon,
    Security as RoleIcon,
    Groups as TeamIcon,
    SupervisedUserCircle as ManagerIcon,
    Settings as FeaturesIcon,
} from "@mui/icons-material";
import { spring } from "@/lib/motion";

// ─── Action definitions per module ───────────────────────────────────────────
interface BulkAction {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    color?: "error" | "primary" | "secondary" | "inherit";
}

export type BulkModule = "leads" | "opportunities" | "users" | "tenants";

export interface BulkActionsToolbarProps {
    selectedCount: number;
    onClearSelection: () => void;
    module?: BulkModule;
    // Leads actions
    onAssignOwner?: () => void;
    onAddTags?: () => void;
    onUpdateStatus?: () => void;
    onExport?: () => void;
    onDelete?: () => void;
    onArchive?: () => void;
    // Opportunities actions
    onChangeStage?: () => void;
    // Users actions
    onActivateDeactivate?: () => void;
    onAssignRole?: () => void;
    onAssignTeam?: () => void;
    onAssignManager?: () => void;
    // Tenants actions
    onToggleFeatures?: () => void;
}

export function BulkActionsToolbar({
    selectedCount,
    onClearSelection,
    module = "leads",
    onAssignOwner,
    onAddTags,
    onUpdateStatus,
    onExport,
    onDelete,
    onArchive,
    onChangeStage,
    onActivateDeactivate,
    onAssignRole,
    onAssignTeam,
    onAssignManager,
    onToggleFeatures,
}: BulkActionsToolbarProps) {
    const theme = useTheme();

    // Build context-aware actions based on module
    const actions: BulkAction[] = [];

    if (module === "leads") {
        if (onAssignOwner) actions.push({ label: "Assign", icon: <AssignIcon fontSize="small" />, onClick: onAssignOwner });
        if (onAddTags) actions.push({ label: "Tags", icon: <TagIcon fontSize="small" />, onClick: onAddTags });
        if (onUpdateStatus) actions.push({ label: "Status", icon: <StatusIcon fontSize="small" />, onClick: onUpdateStatus });
        if (onExport) actions.push({ label: "Export", icon: <ExportIcon fontSize="small" />, onClick: onExport });
        if (onArchive) actions.push({ label: "Archive", icon: <ArchiveIcon fontSize="small" />, onClick: onArchive });
        if (onDelete) actions.push({ label: "Delete", icon: <DeleteIcon fontSize="small" />, onClick: onDelete, color: "error" });
    }

    if (module === "opportunities") {
        if (onChangeStage) actions.push({ label: "Stage", icon: <StageIcon fontSize="small" />, onClick: onChangeStage });
        if (onAssignOwner) actions.push({ label: "Assign", icon: <AssignIcon fontSize="small" />, onClick: onAssignOwner });
        if (onExport) actions.push({ label: "Export", icon: <ExportIcon fontSize="small" />, onClick: onExport });
        if (onArchive) actions.push({ label: "Archive", icon: <ArchiveIcon fontSize="small" />, onClick: onArchive });
        if (onDelete) actions.push({ label: "Delete", icon: <DeleteIcon fontSize="small" />, onClick: onDelete, color: "error" });
    }

    if (module === "users") {
        if (onActivateDeactivate) actions.push({ label: "Activate", icon: <ActivateIcon fontSize="small" />, onClick: onActivateDeactivate });
        if (onAssignRole) actions.push({ label: "Role", icon: <RoleIcon fontSize="small" />, onClick: onAssignRole });
        if (onAssignTeam) actions.push({ label: "Team", icon: <TeamIcon fontSize="small" />, onClick: onAssignTeam });
        if (onAssignManager) actions.push({ label: "Manager", icon: <ManagerIcon fontSize="small" />, onClick: onAssignManager });
        if (onDelete) actions.push({ label: "Delete", icon: <DeleteIcon fontSize="small" />, onClick: onDelete, color: "error" });
    }

    if (module === "tenants") {
        if (onToggleFeatures) actions.push({ label: "Features", icon: <FeaturesIcon fontSize="small" />, onClick: onToggleFeatures });
        if (onExport) actions.push({ label: "Export", icon: <ExportIcon fontSize="small" />, onClick: onExport });
        if (onDelete) actions.push({ label: "Delete", icon: <DeleteIcon fontSize="small" />, onClick: onDelete, color: "error" });
    }

    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ y: 80, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 40, opacity: 0, scale: 0.95 }}
                    transition={spring.expressive}
                    style={{
                        position: "fixed",
                        bottom: 32,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 1300,
                    }}
                >
                    <Paper
                        elevation={8}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 2,
                            py: 1,
                            borderRadius: "28px",
                            bgcolor: theme.palette.inverseSurface,
                            color: theme.palette.inverseOnSurface,
                            boxShadow: "0px 8px 32px rgba(0,0,0,0.24)",
                            backdropFilter: "blur(12px)",
                            border: `1px solid ${alpha(theme.palette.inverseOnSurface, 0.1)}`,
                        }}
                    >
                        {/* Selection count + clear */}
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                borderRight: `1px solid ${alpha(theme.palette.inverseOnSurface, 0.2)}`,
                                pr: 1.5,
                                mr: 0.5,
                            }}
                        >
                            <IconButton
                                size="small"
                                onClick={onClearSelection}
                                sx={{ color: "inherit", "&:hover": { bgcolor: alpha(theme.palette.inverseOnSurface, 0.1) } }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                            <Typography variant="labelLarge" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                {selectedCount} selected
                            </Typography>
                        </Box>

                        {/* Context-aware actions */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            {actions.map((action) => (
                                <Button
                                    key={action.label}
                                    size="small"
                                    onClick={action.onClick}
                                    startIcon={action.icon}
                                    sx={{
                                        color: action.color === "error"
                                            ? theme.palette.error.light
                                            : "inherit",
                                        borderRadius: "20px",
                                        textTransform: "none",
                                        fontWeight: 600,
                                        fontSize: "13px",
                                        px: 1.5,
                                        minWidth: "auto",
                                        "&:hover": {
                                            bgcolor: action.color === "error"
                                                ? alpha(theme.palette.error.main, 0.2)
                                                : alpha(theme.palette.inverseOnSurface, 0.1),
                                        },
                                    }}
                                >
                                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                                        {action.label}
                                    </Box>
                                </Button>
                            ))}
                        </Box>
                    </Paper>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
