"use client";

import { SuperAdminGuard } from "@/components/auth/super-admin-guard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Package, Database, ShieldCheck, LogOut, LayoutDashboard, Users, FileText, UserCog, ShieldAlert, Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";

const DRAWER_WIDTH = 280;

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { href: "/platform-admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/platform-admin/tenants", label: "Tenants", icon: Users },
        { href: "/platform-admin/audit-logs", label: "Audit Logs", icon: FileText },
        { href: "/platform-admin/impersonation-review", label: "Impersonation Review", icon: UserCog },
        { href: "/platform-admin/privileged-actions", label: "Privileged Actions", icon: ShieldAlert },
        { href: "/platform-admin/schema-status", label: "Schema Status", icon: Database },
        { href: "/platform-admin/marketplace", label: "Marketplace", icon: Package },
    ];

    const drawerContent = (
        <div className="flex h-full min-h-0 flex-col border-r bg-card">
            <div className="flex items-center gap-3 p-6">
                <Avatar className="bg-secondary text-secondary-foreground">
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <ShieldCheck className="size-6" />
                    </AvatarFallback>
                </Avatar>
                <div>
                    <div className="text-sm font-bold leading-tight">Platform</div>
                    <div className="text-xs text-muted-foreground">Administration</div>
                </div>
            </div>

            <nav aria-label="Platform navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/platform-admin" && pathname.startsWith(item.href + "/"));
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                                "flex min-h-14 items-center gap-3 rounded-full px-4 text-sm transition-colors",
                                isActive
                                    ? "bg-secondary text-secondary-foreground font-bold hover:bg-secondary/80"
                                    : "font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <Icon className="size-6 shrink-0" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t p-4">
                <Button asChild variant="outline" className="w-full justify-start rounded-full px-4">
                    <Link href="/dashboard">
                        <LogOut className="size-4" />
                        Back to App
                    </Link>
                </Button>
            </div>
        </div>
    );

    return (
        <SuperAdminGuard>
            <div className="flex min-h-screen bg-background">
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
        </SuperAdminGuard>
    );
}
