"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, History, KeyRound, SlidersHorizontal, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const ACCOUNT_PAGES = [
    { title: "Profile", href: "/dashboard/account", icon: UserRound },
    { title: "Preferences", href: "/dashboard/account/preferences", icon: SlidersHorizontal },
    { title: "Notifications", href: "/dashboard/account/notifications", icon: Bell },
    { title: "Sign-in & security", href: "/dashboard/account/security", icon: KeyRound },
    { title: "My activity", href: "/dashboard/account/activity", icon: History },
] as const;

// My account's menu (UI/UX plan decision 8): the same quiet style as the Settings menu.
export function AccountNav() {
    const pathname = usePathname();
    return (
        <nav aria-label="My account" className="min-w-0 self-start md:sticky md:top-[calc(var(--app-header-offset,56px)+16px)]">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col md:overflow-visible">
                {ACCOUNT_PAGES.map((page) => {
                    const active = pathname === page.href;
                    const Icon = page.icon;
                    return (
                        <li key={page.href} className="shrink-0">
                            <Link
                                href={page.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "relative flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active ? "bg-muted text-foreground md:before:absolute md:before:inset-y-1.5 md:before:left-0 md:before:w-0.5 md:before:rounded-full md:before:bg-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                <span className="whitespace-nowrap">{page.title}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
