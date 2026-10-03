"use client";

import { SuperAdminGuard } from "@/components/auth/super-admin-guard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Package, Database, ShieldCheck, LogOut, LayoutDashboard, Users, FileText, UserCog, ShieldAlert, Menu as MenuIcon, Boxes, HeartPulse, Archive, Lock, Gauge, Timer, ServerCrash } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { PageTitleProvider } from "@/components/app-states/page-title";

const DRAWER_WIDTH = 280;

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Grouped like the plan's Platform admin structure (UI/UX plan §11.5), in the main menu's quiet
    // style (decision 24). Rate limits, Usage and Security policies moved here from the tenant
    // area (decision 9).
    const navGroups: Array<{ title: string | null; items: Array<{ href: string; label: string; icon: React.ElementType }> }> = [
        { title: null, items: [{ href: "/platform-admin", label: "Overview", icon: LayoutDashboard }] },
        { title: "Tenants", items: [
            { href: "/platform-admin/tenants", label: "Tenants", icon: Users },
            { href: "/platform-admin/module-bundles", label: "Module bundles", icon: Boxes },
        ] },
        { title: null, items: [{ href: "/platform-admin/marketplace", label: "Marketplace", icon: Package }] },
        { title: "Security & compliance", items: [
            { href: "/platform-admin/privileged-actions", label: "Approvals", icon: ShieldAlert },
            { href: "/platform-admin/impersonation-review", label: "Impersonation", icon: UserCog },
            { href: "/platform-admin/audit-logs", label: "Audit log", icon: FileText },
            { href: "/platform-admin/retention", label: "Data retention", icon: Archive },
            { href: "/platform-admin/security-policies", label: "Security policies", icon: Lock },
        ] },
        { title: "System", items: [
            { href: "/platform-admin/module-health", label: "Module health", icon: HeartPulse },
            { href: "/platform-admin/jobs", label: "Failed jobs", icon: ServerCrash },
            { href: "/platform-admin/usage", label: "Usage", icon: Gauge },
            { href: "/platform-admin/rate-limits", label: "Rate limits", icon: Timer },
            { href: "/platform-admin/schema-status", label: "Schema", icon: Database },
        ] },
    ];

    const drawerContent = (
        <div className="flex h-full min-h-0 flex-col border-r border-sidebar-border bg-sidebar">
            <div className="flex items-center gap-2.5 px-4 py-4">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-4" aria-hidden /></span>
                <div>
                    <div className="text-sm font-semibold leading-tight">Platform</div>
                    <div className="text-xs text-muted-foreground">Administration</div>
                </div>
            </div>

            <nav aria-label="Platform navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
                {navGroups.map((group) => (
                    <div key={group.items[0].href}>
                        {group.title ? <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.title}</p> : null}
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href || (item.href !== "/platform-admin" && pathname.startsWith(item.href + "/"));
                                const Icon = item.icon;
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            onClick={() => setMobileOpen(false)}
                                            aria-current={isActive ? "page" : undefined}
                                            className={cn(
                                                "relative flex min-h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                isActive ? "bg-muted font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                            )}
                                        >
                                            <Icon className="size-4 shrink-0" aria-hidden />
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="border-t border-sidebar-border p-3">
                <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/dashboard">
                        <LogOut className="size-4" />
                        Back to the app
                    </Link>
                </Button>
            </div>
        </div>
    );

    return (
        <SuperAdminGuard>
            <PageTitleProvider>
            <div className="flex min-h-dvh bg-background">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent side="left" className="w-[min(280px,calc(100vw-2rem))] gap-0 p-0 lg:hidden">
                        <SheetTitle className="sr-only">Platform navigation</SheetTitle>
                        <SheetDescription className="sr-only">Choose an administration page.</SheetDescription>
                        {drawerContent}
                    </SheetContent>
                </Sheet>

                <div className="hidden shrink-0 lg:block" style={{ width: DRAWER_WIDTH }}>
                    <div className="fixed inset-y-0 left-0" style={{ width: DRAWER_WIDTH }}>
                        {drawerContent}
                    </div>
                </div>

                <main className="min-w-0 flex-1 p-4 lg:p-6">
                    <div className="mb-4 lg:hidden">
                        <Button variant="ghost" size="icon" aria-label="Open platform navigation" onClick={() => setMobileOpen(true)}>
                            <MenuIcon />
                        </Button>
                    </div>

                    {children}
                </main>
            </div>
            </PageTitleProvider>
        </SuperAdminGuard>
    );
}
