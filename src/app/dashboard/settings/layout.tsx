"use client";

import Link from "next/link";
import { SettingsSidebar } from "./components/sidebar-nav";
import { RoleGuard } from "@/components/auth/role-guard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard requiredRole="Tenant Admin">
        <div className="mx-auto min-w-0 max-w-[1680px]">
            <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
                <Link href="/dashboard/settings" className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Settings</Link>
            </nav>
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[224px_minmax(0,1fr)]">
                <SettingsSidebar />
                <div className="min-w-0" data-slot="settings-content">{children}</div>
            </div>
        </div>
    </RoleGuard>;
}
