"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
    Search,
    Loader2,
    UserPlus,
    Target,
    ListChecks,
    Activity as ActivityIcon,
    LayoutGrid,
    BarChart3,
    Download,
    Workflow,
    Settings,
    History,
    Star,
    Megaphone,
    type LucideIcon,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useFeature } from "@/components/auth/feature-gate";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { getFavoriteRecords, getRecentRecords, type FavoriteRecord, type RecentRecord, type RecordType } from "@/lib/recent-records";
import { contextualRecordDefaults } from "@/lib/contextual-defaults";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useVisibleSettingsPages } from "@/hooks/use-settings-pages";
import { settingsGroupTitle } from "@/lib/settings-pages";
import { ACCOUNT_PAGES } from "@/components/account/account-nav";

// Extra words that find a My account page ("password" finds Sign-in & security).
const ACCOUNT_KEYWORDS: Record<string, string[]> = {
    "/dashboard/account": ["name", "profile"],
    "/dashboard/account/preferences": ["theme", "dark mode", "appearance", "density", "time zone", "currency", "landing page", "pinned"],
    "/dashboard/account/notifications": ["mute", "alerts"],
    "/dashboard/account/security": ["password", "two-factor", "2fa", "mfa", "sessions", "sign out", "devices"],
    "/dashboard/account/activity": ["audit", "history"],
};
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";
import { useModuleAccess } from "@/hooks/use-module-access";

interface SearchResult {
    id: string;
    type: 'lead' | 'opportunity' | 'activity' | 'task' | 'partner';
    name?: string; // Lead, Partner
    title?: string; // Opportunity, Task
    notes?: string; // Activity
    company?: string;
    email?: string | null;
    phone?: string | null;
    amount?: number;
    leadId?: string | null;
    opportunityId?: string | null;
}

// "Global command palette" (gap checklist: "Add global command palette with permission-scoped
// commands") -- this component already had the "Type a command or search..." placeholder and
// cmdk's fuzzy filter, which fires on commands and search results alike, so extending it in
// place is the correct fix rather than wiring up the separate, long-dead CommandMenu component
// (deleted -- confirmed unreferenced anywhere, and hardcoded/stubbed throughout).
// Gap checklist Module 10's tests bullet -- "command permissions." Extracted out of the
// `commands` useMemo below (which also builds each command's actual `perform` closure, tightly
// coupled to this component's own props/router) so the permission-gating DECISION -- which
// command ids are visible for a given set of module entitlements/admin status -- can be unit
// tested without rendering the component.
export function visibleCommandIds(input: {
    hasCreateLead: boolean;
    hasCreateOpportunity: boolean;
    hasCreateActivity: boolean;
    canAccessModule: (key: string) => boolean;
    automationEnabled: boolean;
    isAdmin: boolean;
}): string[] {
    const ids: string[] = [];
    if (input.hasCreateLead && input.canAccessModule("leads")) ids.push("create-lead");
    if (input.hasCreateOpportunity && input.canAccessModule("opportunities")) ids.push("create-opportunity");
    if (input.canAccessModule("tasks")) ids.push("create-task");
    if (input.hasCreateActivity && input.canAccessModule("activities")) ids.push("create-activity");
    ids.push("nav-views", "nav-reports", "nav-exports");
    if (input.automationEnabled) ids.push("nav-automations");
    // My account is for everyone; Settings and its pages only for admins (decision 8).
    ids.push("account-pages");
    if (input.isAdmin) ids.push("settings-home", "settings-pages");
    return ids;
}

type CommandDef = {
    id: string;
    label: string;
    keywords?: string[];
    icon: LucideIcon;
    group: string;
    perform: () => void;
};

const EMPTY_RESULTS = { leads: [], opportunities: [], activities: [], tasks: [], partners: [] };

export function GlobalSearch({
    open,
    onOpenChange,
    onCreateLead,
    onCreateOpportunity,
    onCreateActivity,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateLead?: () => void;
    onCreateOpportunity?: () => void;
    onCreateActivity?: () => void;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useAuth();
    const automationEnabled = useFeature("automationEnabled");
    const contextDefaults = contextualRecordDefaults(pathname);
    const [query, setQuery] = useState("");
    const nextSearchSignal = useAbortableRequest();
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [recent, setRecent] = useState<RecentRecord[]>([]);
    const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
    const [results, setResults] = useState<{
        leads: SearchResult[];
        opportunities: SearchResult[];
        activities: SearchResult[];
        tasks: SearchResult[];
        partners: SearchResult[];
    }>(EMPTY_RESULTS);

    useEffect(() => {
        if (open) {
            setRecent(getRecentRecords());
            setFavorites(getFavoriteRecords());
        }
    }, [open]);

    const debouncedQuery = useDebouncedValue(query, 300);

    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 2) {
            setResults(EMPTY_RESULTS);
            setSearchError(false);
            return;
        }

        const signal = nextSearchSignal();
        setLoading(true);
        setSearchError(false);
        apiFetch(`/search?q=${encodeURIComponent(debouncedQuery)}`, { signal })
            .then(setResults)
            .catch((error) => {
                // A superseded search (the user kept typing before this one resolved) --
                // the newer request already owns `results`/`loading`, so this stale one must
                // not touch state at all.
                if (isAbortError(error)) return;
                console.error(error);
                setResults(EMPTY_RESULTS);
                setSearchError(true);
            })
            .finally(() => {
                if (!signal.aborted) setLoading(false);
            });
    }, [debouncedQuery, nextSearchSignal]);

    // Every result opens the item itself (UI/UX plan §11.6 M): an activity opens the record it
    // is logged on, a task opens in the tasks page's editor, a partner opens its profile.
    const handleSelect = (result: SearchResult) => {
        onOpenChange(false);
        const { id, type } = result;
        if (type === 'lead') router.push(`/dashboard/leads/${id}`);
        if (type === 'opportunity') router.push(`/dashboard/opportunities/${id}`);
        if (type === 'activity') {
            router.push(result.opportunityId ? `/dashboard/opportunities/${result.opportunityId}` : result.leadId ? `/dashboard/leads/${result.leadId}` : `/dashboard/activities`);
        }
        if (type === 'task') router.push(`/dashboard/tasks?taskId=${id}`);
        if (type === 'partner') router.push(`/dashboard/settings/access/partners/${id}`);
    };

    // "Permission-scoped": client-side hiding only (real enforcement is always server-side, on
    // the actual create/navigate endpoints) -- matches every module-level check elsewhere in
    // this app's client code (useFeature/useModuleEnabled), and this codebase's consistent
    // "missing -> enabled" default, so an unrecognized/absent permission shape shows the
    // command rather than silently hiding something the user actually has access to.
    // The rule the server enforces (lib/module-access.ts): "create" commands need "write".
    const can = useModuleAccess();
    const canAccessModule = useCallback((key: string) => can(key, "write"), [can]);
    const isAdmin = !!user?.isTenantAdmin || !!user?.isPlatformAdmin;
    const settingsPages = useVisibleSettingsPages();

    const commands = useMemo<CommandDef[]>(() => {
        const list: CommandDef[] = [];
        const go = (path: string) => { onOpenChange(false); router.push(path); };
        const visible = new Set(visibleCommandIds({
            hasCreateLead: !!onCreateLead,
            hasCreateOpportunity: !!onCreateOpportunity,
            hasCreateActivity: !!onCreateActivity,
            canAccessModule,
            automationEnabled,
            isAdmin,
        }));

        if (onCreateLead && visible.has("create-lead")) {
            list.push({ id: "create-lead", label: "Create lead", keywords: ["new"], icon: UserPlus, group: "Create", perform: () => { onOpenChange(false); onCreateLead(); } });
        }
        if (onCreateOpportunity && visible.has("create-opportunity")) {
            list.push({ id: "create-opportunity", label: "Create opportunity", keywords: ["new", "deal"], icon: Target, group: "Create", perform: () => { onOpenChange(false); onCreateOpportunity(); } });
        }
        if (visible.has("create-task")) {
            const taskParams = new URLSearchParams({ create: "1" });
            if (contextDefaults.leadId) taskParams.set("leadId", contextDefaults.leadId);
            if (contextDefaults.opportunityId) taskParams.set("opportunityId", contextDefaults.opportunityId);
            list.push({ id: "create-task", label: "Create task", keywords: ["new"], icon: ListChecks, group: "Create", perform: () => go(`/dashboard/tasks?${taskParams.toString()}`) });
        }
        if (onCreateActivity && visible.has("create-activity")) {
            list.push({ id: "create-activity", label: "Log activity", keywords: ["new", "call", "note"], icon: ActivityIcon, group: "Create", perform: () => { onOpenChange(false); onCreateActivity(); } });
        }

        list.push({ id: "nav-views", label: "Views", icon: LayoutGrid, group: "Navigate", perform: () => go("/dashboard/views") });
        list.push({ id: "nav-reports", label: "Reports", icon: BarChart3, group: "Navigate", perform: () => go("/dashboard/reports") });
        list.push({ id: "nav-exports", label: "Exports", keywords: ["csv", "download"], icon: Download, group: "Navigate", perform: () => go("/dashboard/exports") });
        if (visible.has("nav-automations")) {
            list.push({ id: "nav-automations", label: "Automations", keywords: ["workflow"], icon: Workflow, group: "Navigate", perform: () => go("/dashboard/automations-v2") });
        }

        if (visible.has("account-pages")) {
            for (const page of ACCOUNT_PAGES) {
                list.push({ id: `account:${page.href}`, label: page.title, keywords: ["my account", ...(ACCOUNT_KEYWORDS[page.href] ?? [])], icon: page.icon, group: "My account", perform: () => go(page.href) });
            }
        }
        if (visible.has("settings-home")) {
            list.push({ id: "settings-home", label: "Settings", icon: Settings, group: "Settings", perform: () => go("/dashboard/settings") });
        }
        if (visible.has("settings-pages")) {
            for (const page of settingsPages) {
                list.push({ id: `settings:${page.href}`, label: page.title, keywords: [settingsGroupTitle(page.group), ...(page.keywords ?? [])], icon: page.icon, group: "Settings", perform: () => go(page.href) });
            }
        }

        return list;
    }, [onCreateLead, onCreateOpportunity, onCreateActivity, automationEnabled, isAdmin, canAccessModule, router, onOpenChange, contextDefaults.leadId, contextDefaults.opportunityId, settingsPages]);

    // cmdk's own filter is off (shouldFilter={false} below): it kept a row's first keywords, so a
    // record found by phone after an email search was hidden. Records are already filtered by
    // the server; commands, recents and favourites are matched here.
    const needle = query.trim().toLowerCase();
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
    const visibleFavorites = favorites.filter((record) => matches(record.label));
    const visibleRecent = recent.filter((record) => matches(record.label));
    const commandGroups = useMemo(() => {
        const term = query.trim().toLowerCase();
        const groups = new Map<string, CommandDef[]>();
        for (const command of commands.filter((item) => !term || `${item.label} ${(item.keywords ?? []).join(" ")}`.toLowerCase().includes(term))) {
            if (!groups.has(command.group)) groups.set(command.group, []);
            groups.get(command.group)!.push(command);
        }
        return groups;
    }, [commands, query]);

    const recordTypeIcon = (type: RecordType): LucideIcon => {
        if (type === "lead") return UserPlus;
        if (type === "opportunity") return Target;
        if (type === "task") return ListChecks;
        if (type === "view") return LayoutGrid;
        if (type === "report") return BarChart3;
        return Megaphone; // campaign
    };
    const recordTypePath = (record: { type: RecordType; id: string }) => {
        if (record.type === "lead") return `/dashboard/leads/${record.id}`;
        if (record.type === "opportunity") return `/dashboard/opportunities/${record.id}`;
        if (record.type === "task") return `/dashboard/tasks?taskId=${record.id}`;
        if (record.type === "view") return `/dashboard/views?viewId=${record.id}`;
        if (record.type === "report") return `/dashboard/reports/custom/${record.id}`;
        return `/dashboard/marketing?campaignId=${record.id}`; // campaign
    };

    const hasAnyResults = Object.values(results).some((group) => group.length > 0);

    // Gap checklist Module 10's "user-level audit of productivity actions" item, "command
    // execution" -- fire-and-forget so recording a command never adds latency to (or can ever
    // block) the command's own actual effect, which already fires synchronously right after.
    const recordCommandExecution = (commandId: string) => {
        apiFetch("/governance/audit-logs", { method: "POST", body: JSON.stringify({ commandId }) }).catch(() => undefined);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden max-w-2xl bg-popover text-popover-foreground">
                <Command shouldFilter={false} className="[&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item][aria-selected='true']]:bg-muted">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Command.Input
                            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Search leads, opportunities, tasks… or type a command"
                            value={query}
                            onValueChange={setQuery}
                        />
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />}
                    </div>
                    <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                        {searchError ? (
                            <div role="alert" className="px-4 py-3 text-sm text-destructive">Search isn&apos;t working right now. Try again in a moment.</div>
                        ) : loading && !hasAnyResults && query.trim().length >= 2 ? (
                            <div role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Searching…</div>
                        ) : null}
                        <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">{loading ? "Searching…" : "No matches."}</Command.Empty>

                        {visibleFavorites.length > 0 && !hasAnyResults && (
                            <Command.Group heading="Favorites" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {visibleFavorites.map((record) => {
                                    const Icon = recordTypeIcon(record.type);
                                    return (
                                        <Command.Item
                                            key={`favorite-${record.type}-${record.id}`}
                                            value={`favorite ${record.label}`}
                                            onSelect={() => { onOpenChange(false); router.push(recordTypePath(record)); }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Star className="size-3.5 fill-amber-500 text-amber-500" />
                                                <Icon className="size-3.5 text-muted-foreground" />
                                                <span className="font-medium">{record.label}</span>
                                            </div>
                                        </Command.Item>
                                    );
                                })}
                            </Command.Group>
                        )}

                        {visibleRecent.length > 0 && !hasAnyResults && (
                            <Command.Group heading="Recent" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {visibleRecent.map((record) => {
                                    const Icon = recordTypeIcon(record.type);
                                    return (
                                        <Command.Item
                                            key={`recent-${record.type}-${record.id}`}
                                            value={`recent ${record.label}`}
                                            onSelect={() => { onOpenChange(false); router.push(recordTypePath(record)); }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <History className="size-3.5 text-muted-foreground" />
                                                <Icon className="size-3.5 text-muted-foreground" />
                                                <span className="font-medium">{record.label}</span>
                                            </div>
                                        </Command.Item>
                                    );
                                })}
                            </Command.Group>
                        )}

                        {/* Records first while searching (UI/UX plan §11.6 M). */}
                        {results.leads.length > 0 && (
                            <Command.Group heading="Leads" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.leads.map((lead) => (
                                    <Command.Item key={lead.id} value={`lead ${lead.id}`} onSelect={() => handleSelect(lead)}>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium text-foreground">{lead.name}</span>
                                            <span className="truncate text-xs text-muted-foreground">{[lead.company, lead.email, lead.phone].filter(Boolean).join(" · ") || "Lead"}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.opportunities.length > 0 && (
                            <Command.Group heading="Opportunities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.opportunities.map((opp) => (
                                    <Command.Item key={opp.id} value={`opportunity ${opp.id}`} onSelect={() => handleSelect(opp)}>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium text-foreground">{opp.title}</span>
                                            <span className="text-xs tabular-nums text-muted-foreground">{opp.amount ? formatCurrency(opp.amount) : "Opportunity"}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.tasks.length > 0 && (
                            <Command.Group heading="Tasks" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.tasks.map((task) => (
                                    <Command.Item key={task.id} value={`task ${task.id}`} onSelect={() => handleSelect(task)}>
                                        <span className="truncate font-medium text-foreground">{task.title}</span>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.activities.length > 0 && (
                            <Command.Group heading="Activities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.activities.map((act) => (
                                    <Command.Item key={act.id} value={`activity ${act.id}`} onSelect={() => handleSelect(act)}>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="max-w-[440px] truncate font-medium text-foreground">{act.notes || "Activity"}</span>
                                            <span className="text-xs text-muted-foreground">{act.opportunityId ? "Opens the opportunity" : act.leadId ? "Opens the lead" : "Activity"}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.partners.length > 0 && (
                            <Command.Group heading="Partners" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.partners.map((partner) => (
                                    <Command.Item key={partner.id} value={`partner ${partner.id}`} onSelect={() => handleSelect(partner)}>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium text-foreground">{partner.name}</span>
                                            {partner.company && partner.company !== partner.name ? <span className="truncate text-xs text-muted-foreground">{partner.company}</span> : null}
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {Array.from(commandGroups.entries()).map(([group, items]) => (
                            <Command.Group key={group} heading={group} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {items.map((command) => {
                                    const Icon = command.icon;
                                    return (
                                        <Command.Item
                                            key={command.id}
                                            value={command.label}
                                            keywords={command.keywords}
                                            onSelect={() => { recordCommandExecution(command.id); command.perform(); }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className="size-3.5 text-muted-foreground" />
                                                <span className="font-medium">{command.label}</span>
                                            </div>
                                        </Command.Item>
                                    );
                                })}
                            </Command.Group>
                        ))}

                    </Command.List>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
