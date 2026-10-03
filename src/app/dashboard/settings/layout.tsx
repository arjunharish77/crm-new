"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { SettingsSidebar } from "./components/sidebar-nav";
import { RoleGuard } from "@/components/auth/role-guard";
import { SETTINGS_HOME, settingsGroupTitle, settingsPageFor } from "@/lib/settings-pages";

// Settings is for admins (decision 8); everyone's own pages are in My account. The breadcrumb
// reads "Settings › Group › Page" (§11.5).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard requiredRole="Tenant Admin" fallbackRoute="/dashboard/account">
        {/* useSearchParams (the open section picks the active menu item) needs a Suspense boundary. */}
        <Suspense fallback={null}>
            <SettingsShell>{children}</SettingsShell>
        </Suspense>
    </RoleGuard>;
}

function SettingsShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const page = settingsPageFor(pathname, searchParams.toString());
    const onHome = pathname === SETTINGS_HOME;
    return (
        <div className="mx-auto min-w-0 max-w-[1680px]">
            {!onHome ? (
                <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1">
                        <li><Link href={SETTINGS_HOME} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Settings</Link></li>
                        {page ? <>
                            <li aria-hidden><ChevronRight className="size-3.5" /></li>
                            <li>{settingsGroupTitle(page.group)}</li>
                            <li aria-hidden><ChevronRight className="size-3.5" /></li>
                            <li>{pathname === page.href.split("?")[0] ? <span aria-current="page" className="text-foreground">{page.title}</span> : <Link href={page.href} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{page.title}</Link>}</li>
                        </> : null}
                    </ol>
                </nav>
            ) : null}
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[224px_minmax(0,1fr)]">
                <SettingsSidebar />
                <div className="min-w-0" data-slot="settings-content">{children}</div>
            </div>
        </div>
    );
}
