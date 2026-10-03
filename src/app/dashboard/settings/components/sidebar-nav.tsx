"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS, SETTINGS_HOME, settingsPageFor, settingsPageMatches } from "@/lib/settings-pages";
import { useVisibleSettingsPages } from "@/hooks/use-settings-pages";

export { useVisibleSettingsPages };

// The Settings menu (UI/UX plan decisions 22 and 28): the new groups, a search that matches page
// names, keywords and descriptions, and a select on narrow screens.
export function SettingsSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [search, setSearch] = useState("");
    const pages = useVisibleSettingsPages();
    const searchParams = useSearchParams();
    const active = settingsPageFor(pathname, searchParams.toString());
    const matching = pages.filter((page) => settingsPageMatches(page, search));

    return (
        <nav aria-label="Settings sections" className="min-w-0 self-start xl:sticky xl:top-[calc(var(--app-header-offset)+16px)]">
            <label className="grid gap-2 text-sm font-medium xl:hidden">
                Settings section
                <select
                    value={active?.href ?? SETTINGS_HOME}
                    onChange={(event) => router.push(event.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <option value={SETTINGS_HOME}>All settings</option>
                    {SETTINGS_GROUPS.map((group) => {
                        const items = pages.filter((page) => page.group === group.key);
                        if (!items.length) return null;
                        return (
                            <optgroup key={group.key} label={group.title}>
                                {items.map((page) => <option key={page.href} value={page.href}>{page.title}</option>)}
                            </optgroup>
                        );
                    })}
                </select>
            </label>
            <div className="hidden xl:block">
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input aria-label="Search settings" placeholder="Find a setting" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
                </div>
                <div className="max-h-[calc(100dvh-var(--app-header-offset)-120px)] overflow-y-auto overscroll-contain pr-2">
                    {SETTINGS_GROUPS.map((group) => {
                        const items = matching.filter((page) => page.group === group.key);
                        if (!items.length) return null;
                        return (
                            <div key={group.key} className="mb-4">
                                <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.title}</p>
                                <ul className="space-y-0.5">
                                    {items.map((page) => {
                                        const Icon = page.icon;
                                        const current = active?.href === page.href;
                                        return (
                                            <li key={page.href}>
                                                <Link
                                                    href={page.href}
                                                    aria-current={current ? "page" : undefined}
                                                    className={cn(
                                                        "relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                        current ? "bg-muted font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                                    )}
                                                >
                                                    <Icon className="size-4 shrink-0" aria-hidden /><span>{page.title}</span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                    {!matching.length ? <p className="px-2 py-4 text-sm text-muted-foreground">No settings match. Your own password, two-factor and preferences are in <Link href="/dashboard/account" className="text-primary hover:underline">My account</Link>.</p> : null}
                </div>
            </div>
        </nav>
    );
}
