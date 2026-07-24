"use client";

import React from "react";
import { motion } from "framer-motion";
import { CircleAlert } from "lucide-react";
import { fadeInUp, spring } from "@/lib/motion";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
}

export function ErrorState({
    title = "Something went wrong",
    description = "An unexpected error occurred. Please try again.",
    onRetry,
}: ErrorStateProps) {
    return (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={spring.expressive}
                >
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/8">
                        <CircleAlert className="size-10 text-destructive opacity-80" />
                    </div>
                </motion.div>

                <h3 className="text-lg font-bold mb-1">{title}</h3>
                <p className={`max-w-[400px] text-sm text-muted-foreground ${onRetry ? "mb-6" : ""}`}>
                    {description}
                </p>
                {onRetry && (
                    <Button variant="outline" onClick={onRetry}>
                        Try Again
                    </Button>
                )}
            </div>
        </motion.div>
    );
}
