"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
    X,
    Trash2,
    UserPlus,
    Download,
    ArrowRightLeft,
    ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { transitions } from "@/lib/animations";

interface Action {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    color?: string;
}

interface FloatingBulkActionsProps {
    selectedCount: number;
    onClear: () => void;
    actions: Action[];
    className?: string;
}

/**
 * M3 Expressive Floating Bulk Action Toolbar
 * Appears at the bottom-center when items are selected.
 */
export function FloatingBulkActions({
    selectedCount,
    onClear,
    actions,
    className
}: FloatingBulkActionsProps) {
    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ y: 100, x: "-50%", opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, x: "-50%", opacity: 1, scale: 1 }}
                    exit={{ y: 100, x: "-50%", opacity: 0, scale: 0.9 }}
                    transition={transitions.expressive}
                    className={cn(
                        "fixed bottom-8 left-1/2 z-50 flex items-center gap-4 px-6 py-3",
                        "bg-foreground text-background rounded-full shadow-2xl overflow-hidden",
                        "border border-white/10 backdrop-blur-md",
                        className
                    )}
                >
                    <div className="flex items-center gap-3 border-r border-white/20 pr-4">
                        <button
                            onClick={onClear}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-semibold whitespace-nowrap">
                            {selectedCount} Selected
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        {actions.map((action, idx) => (
                            <Button
                                key={idx}
                                variant="ghost"
                                size="sm"
                                onClick={action.onClick}
                                className={cn(
                                    "text-background hover:bg-white/10 hover:text-white rounded-full gap-2",
                                    action.variant === "destructive" && "hover:bg-destructive hover:text-destructive-foreground"
                                )}
                            >
                                {action.icon}
                                <span className="hidden sm:inline">{action.label}</span>
                            </Button>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
