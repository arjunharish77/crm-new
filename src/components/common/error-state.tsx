"use client";

import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { fadeInUp, spring } from "@/lib/motion";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
}

// Sibling to EmptyState -- same layout/motion so a failed fetch reads as
// visually distinct from "zero results" instead of the two looking identical.
export function ErrorState({ title = "Something went wrong", description = "Failed to load this data.", onRetry }: ErrorStateProps) {
    return (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
            {/* Gap checklist Module 10's "accessibility pass" item, "screen-reader-friendly
                status text" -- a failed load is exactly the kind of dynamic state change a
                screen-reader user would otherwise never learn about (no error text appears
                anywhere else on the page). role="alert" implies an assertive live region, so
                this interrupts and announces immediately rather than waiting to be polled. */}
            <div role="alert" className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.expressive}
                >
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/8">
                        <AlertTriangle className="size-10 text-destructive opacity-70" />
                    </div>
                </motion.div>

                <h3 className="text-lg font-bold mb-1">{title}</h3>
                <p className={`max-w-[400px] text-sm text-muted-foreground ${onRetry ? "mb-6" : ""}`}>
                    {description}
                </p>
                {onRetry && (
                    <Button variant="outline" onClick={onRetry}>
                        <RefreshCw className="size-4" />
                        Try again
                    </Button>
                )}
            </div>
        </motion.div>
    );
}
