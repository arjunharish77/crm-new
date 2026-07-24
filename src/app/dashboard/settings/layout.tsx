"use client";

import { motion } from "framer-motion";
import { SettingsSidebar } from "./components/sidebar-nav";
import { RoleGuard } from "@/components/auth/role-guard";
import { fadeInUp } from "@/lib/motion";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleGuard requiredRole="Tenant Admin">
            <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                className="mx-auto max-w-[1680px] px-3 py-3 md:px-4 md:py-5"
            >
                <div className="mb-4">
                    <h1 className="mb-1 text-3xl font-extrabold tracking-tighter">
                        Settings
                    </h1>
                    <p className="text-muted-foreground/80">
                        Configure your organization&apos;s workspace, teams, and integration preferences.
                    </p>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
                    <div className="w-full shrink-0 lg:w-[260px]">
                        <SettingsSidebar />
                    </div>
                    <div className="min-w-0 grow">
                        <div className="min-h-[600px] rounded-[22px] border bg-card p-4 md:p-5">
                            {children}
                        </div>
                    </div>
                </div>
            </motion.div>
        </RoleGuard>
    );
}
