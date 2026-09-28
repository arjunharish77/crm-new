"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Trash2,
    Tag,
    CheckCircle,
    Download,
    Archive,
    UserPlus,
    ArrowLeftRight,
    ToggleRight,
    Shield,
    Users,
    UserCog,
    Settings,
    ListPlus,
    CheckCircle2,
} from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

// ─── Action definitions per module ───────────────────────────────────────────
interface BulkAction {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    color?: "error" | "primary" | "secondary" | "inherit";
}

export type BulkModule = "leads" | "opportunities" | "users" | "tenants" | "activities" | "payouts" | "partners";

export interface BulkActionsToolbarProps {
    selectedCount: number;
    disabled?: boolean;
    activateDeactivateLabel?: string;
    onClearSelection: () => void;
    module?: BulkModule;
    // Leads actions
    onAssignOwner?: () => void;
    onAddTags?: () => void;
    onAddToList?: () => void;
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
    // Activities actions
    onMarkCompleted?: () => void;
    // Payouts actions
    onApprove?: () => void;
    // Partners actions
    onSuspend?: () => void;
}

export function BulkActionsToolbar({
    selectedCount,
    disabled = false,
    activateDeactivateLabel = "Activate",
    onClearSelection,
    module = "leads",
    onAssignOwner,
    onAddTags,
    onAddToList,
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
    onMarkCompleted,
    onApprove,
    onSuspend,
}: BulkActionsToolbarProps) {
    // Build context-aware actions based on module
    const actions: BulkAction[] = [];

    if (module === "leads") {
        if (onAssignOwner) actions.push({ label: "Assign", icon: <UserPlus className="size-4" />, onClick: onAssignOwner });
        if (onAddTags) actions.push({ label: "Tags", icon: <Tag className="size-4" />, onClick: onAddTags });
        if (onAddToList) actions.push({ label: "Add To List", icon: <ListPlus className="size-4" />, onClick: onAddToList });
        if (onUpdateStatus) actions.push({ label: "Status", icon: <CheckCircle className="size-4" />, onClick: onUpdateStatus });
        if (onExport) actions.push({ label: "Export", icon: <Download className="size-4" />, onClick: onExport });
        if (onArchive) actions.push({ label: "Archive", icon: <Archive className="size-4" />, onClick: onArchive });
        if (onDelete) actions.push({ label: "Delete", icon: <Trash2 className="size-4" />, onClick: onDelete, color: "error" });
    }

    if (module === "opportunities") {
        if (onChangeStage) actions.push({ label: "Stage", icon: <ArrowLeftRight className="size-4" />, onClick: onChangeStage });
        if (onAssignOwner) actions.push({ label: "Assign", icon: <UserPlus className="size-4" />, onClick: onAssignOwner });
        if (onExport) actions.push({ label: "Export", icon: <Download className="size-4" />, onClick: onExport });
        if (onArchive) actions.push({ label: "Archive", icon: <Archive className="size-4" />, onClick: onArchive });
        if (onDelete) actions.push({ label: "Delete", icon: <Trash2 className="size-4" />, onClick: onDelete, color: "error" });
    }

    if (module === "users") {
        if (onActivateDeactivate) actions.push({ label: activateDeactivateLabel, icon: <ToggleRight className="size-4" />, onClick: onActivateDeactivate });
        if (onAssignRole) actions.push({ label: "Role", icon: <Shield className="size-4" />, onClick: onAssignRole });
        if (onAssignTeam) actions.push({ label: "Team", icon: <Users className="size-4" />, onClick: onAssignTeam });
        if (onAssignManager) actions.push({ label: "Manager", icon: <UserCog className="size-4" />, onClick: onAssignManager });
        if (onDelete) actions.push({ label: "Delete", icon: <Trash2 className="size-4" />, onClick: onDelete, color: "error" });
    }

    if (module === "tenants") {
        if (onToggleFeatures) actions.push({ label: "Features", icon: <Settings className="size-4" />, onClick: onToggleFeatures });
        if (onExport) actions.push({ label: "Export", icon: <Download className="size-4" />, onClick: onExport });
        if (onDelete) actions.push({ label: "Delete", icon: <Trash2 className="size-4" />, onClick: onDelete, color: "error" });
    }

    if (module === "activities") {
        if (onMarkCompleted) actions.push({ label: "Mark Completed", icon: <CheckCircle2 className="size-4" />, onClick: onMarkCompleted });
    }

    if (module === "payouts") {
        if (onApprove) actions.push({ label: "Approve", icon: <CheckCircle2 className="size-4" />, onClick: onApprove });
    }

    if (module === "partners") {
        if (onSuspend) actions.push({ label: "Suspend", icon: <ToggleRight className="size-4" />, onClick: onSuspend, color: "error" });
    }

    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ y: 80, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 40, opacity: 0, scale: 0.95 }}
                    transition={spring.expressive}
                    className="fixed bottom-4 left-1/2 z-[1300] w-max max-w-[calc(100vw-32px)] -translate-x-1/2"
                >
                    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-inverse-surface px-4 py-2 text-inverse-foreground shadow-[0_8px_32px_rgba(0,0,0,0.24)] backdrop-blur-md">
                        {/* Selection count + clear */}
                        <div className="mr-1 flex items-center gap-2 border-r border-current/20 pr-3">
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={onClearSelection}
                                className="rounded-full p-1.5 transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground/60"
                                aria-label="Clear selection"
                            >
                                <X className="size-4" />
                            </button>
                            <span className="text-sm font-bold whitespace-nowrap">
                                {selectedCount} selected
                            </span>
                        </div>

                        {/* Context-aware actions */}
                        <div className="flex flex-wrap items-center justify-center gap-0.5">
                            {actions.map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    disabled={disabled}
                                    aria-label={action.label}
                                    onClick={action.onClick}
                                    className={cn(
                                        "disabled:cursor-not-allowed disabled:opacity-50 flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground/60",
                                        action.color === "error"
                                            ? "text-red-300 hover:bg-red-500/20"
                                            : "hover:bg-current/10"
                                    )}
                                >
                                    {action.icon}
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
