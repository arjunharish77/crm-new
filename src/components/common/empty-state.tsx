"use client";

import React from "react";
import { motion } from "framer-motion";
import { SearchX } from "lucide-react";
import { fadeInUp, spring } from "@/lib/motion";

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.expressive}
                >
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/8">
                        {icon || <SearchX className="size-10 text-primary opacity-60" />}
                    </div>
                </motion.div>

                <h3 className="text-lg font-bold mb-1">{title}</h3>
                {description && (
                    <p className={`max-w-[400px] text-sm text-muted-foreground ${action ? "mb-6" : ""}`}>
                        {description}
                    </p>
                )}
                {action}
            </div>
        </motion.div>
    );
}
