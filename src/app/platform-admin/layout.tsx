"use client";

import { SuperAdminGuard } from "@/components/auth/super-admin-guard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ShieldCheck, LogOut, LayoutDashboard, Users, FileText, Menu as MenuIcon } from "lucide-react";
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
    ];

    const drawerContent = (
        <div className="flex h-full flex-col border-r bg-card">
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

            <nav className="flex-1 space-y-1 px-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex min-h-14 items-center gap-3 rounded-full px-4 text-sm transition-colors",
                                isActive
                                    ? "bg-secondary text-secondary-foreground font-bold hover:bg-secondary/80"
                                    : "font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <Icon className="size-6" />
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
                    <SheetContent side="left" className="w-[280px] p-0 lg:hidden">
                        {drawerContent}
                    </SheetContent>
                </Sheet>

                <div className="hidden lg:block" style={{ width: DRAWER_WIDTH }}>
                    <div className="fixed inset-y-0 left-0" style={{ width: DRAWER_WIDTH }}>
                        {drawerContent}
                    </div>
                </div>

                <main className="flex-1 p-6 lg:w-[calc(100%-280px)]">
                    <div className="mb-4 lg:hidden">
                        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
                            <MenuIcon />
                        </Button>
                    </div>

                    {children}
                </main>
            </div>
        </SuperAdminGuard>
    );
}
