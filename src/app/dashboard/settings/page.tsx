"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { SETTINGS_GROUPS, settingsPageMatches } from "@/lib/settings-pages";
import { useVisibleSettingsPages } from "./components/sidebar-nav";

// Settings home (UI/UX plan §11.5): every group and page with a one-line description, and a
// search over names, keywords and descriptions. Your own settings are in My account.
export default function SettingsHomePage() {
    const pages = useVisibleSettingsPages();
    const [search, setSearch] = useState("");
    const matching = pages.filter((page) => settingsPageMatches(page, search));
    return (
        <div className="min-w-0">
            <PageHeader title="Settings" description="Set up the workspace for everyone. Your own profile, password and preferences are in My account." />
            <div className="relative mb-6 max-w-md">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label="Search settings" placeholder="Search settings, for example “import” or “SLA”" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
            </div>
            <div className="space-y-8">
                {SETTINGS_GROUPS.map((group) => {
                    const items = matching.filter((page) => page.group === group.key);
                    if (!items.length) return null;
                    return (
                        <section key={group.key} aria-labelledby={`settings-group-${group.key}`}>
                            <h2 id={`settings-group-${group.key}`} className="mb-2 text-sm font-semibold">{group.title}</h2>
                            <ul className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-3">
                                {items.map((page) => {
                                    const Icon = page.icon;
                                    return (
                                        <li key={page.href} className="bg-card">
                                            <Link href={page.href} className="flex h-full items-start gap-3 p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                                                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium">{page.title}</span>
                                                    <span className="block text-sm text-muted-foreground">{page.description}</span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    );
                })}
                {!matching.length ? <p className="text-sm text-muted-foreground">No settings match “{search}”. Your own password, two-factor and preferences are in <Link href="/dashboard/account" className="text-primary hover:underline">My account</Link>.</p> : null}
            </div>
        </div>
    );
}
