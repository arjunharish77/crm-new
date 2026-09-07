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
    Users,
    Shield,
    SlidersHorizontal,
    KeyRound,
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
import { isAbortError, useAbortableRequest } from "@/hooks/use-abortable-request";

interface SearchResult {
    id: string;
    type: 'lead' | 'opportunity' | 'activity' | 'task' | 'partner';
    name?: string; // Lead, Partner
    title?: string; // Opportunity, Task
    notes?: string; // Activity
    company?: string;
    amount?: number;
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
    ids.push("settings-home");
    if (input.isAdmin) {
        ids.push("settings-users", "settings-roles", "settings-security", "settings-integrations", "settings-api-keys");
    }
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
            return;
        }

        const signal = nextSearchSignal();
        setLoading(true);
        apiFetch(`/search?q=${encodeURIComponent(debouncedQuery)}`, { signal })
            .then(setResults)
            .catch((error) => {
                // A superseded search (the user kept typing before this one resolved) --
                // the newer request already owns `results`/`loading`, so this stale one must
                // not touch state at all.
                if (isAbortError(error)) return;
                console.error(error);
            })
            .finally(() => {
                if (!signal.aborted) setLoading(false);
            });
    }, [debouncedQuery, nextSearchSignal]);

    const handleSelect = (id: string, type: string) => {
        onOpenChange(false);
        if (type === 'lead') router.push(`/dashboard/leads/${id}`);
        if (type === 'opportunity') router.push(`/dashboard/opportunities/${id}`);
        // Activities, Tasks, and Partners have no per-record detail page in this app today --
        // route to the list rather than a dead link.
        if (type === 'activity') router.push(`/dashboard/activities`);
        if (type === 'task') router.push(`/dashboard/tasks`);
        if (type === 'partner') router.push(`/dashboard/admin/partners`);
    };

    // "Permission-scoped": client-side hiding only (real enforcement is always server-side, on
    // the actual create/navigate endpoints) -- matches every module-level check elsewhere in
    // this app's client code (useFeature/useModuleEnabled), and this codebase's consistent
    // "missing -> enabled" default, so an unrecognized/absent permission shape shows the
    // command rather than silently hiding something the user actually has access to.
    const rolePermissions = (user as any)?.role?.permissions;
    const modules = rolePermissions?.modules ?? {};
    const canAccessModule = useCallback((key: string) => modules[key] !== "none" && modules[key] !== false, [modules]);
    const isAdmin = !!user?.isTenantAdmin || !!user?.isPlatformAdmin;

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
            list.push({ id: "create-lead", label: "Create Lead", keywords: ["new"], icon: UserPlus, group: "Quick Create", perform: () => { onOpenChange(false); onCreateLead(); } });
        }
        if (onCreateOpportunity && visible.has("create-opportunity")) {
            list.push({ id: "create-opportunity", label: "Create Opportunity", keywords: ["new", "deal"], icon: Target, group: "Quick Create", perform: () => { onOpenChange(false); onCreateOpportunity(); } });
        }
        if (visible.has("create-task")) {
            const taskParams = new URLSearchParams({ create: "1" });
            if (contextDefaults.leadId) taskParams.set("leadId", contextDefaults.leadId);
            if (contextDefaults.opportunityId) taskParams.set("opportunityId", contextDefaults.opportunityId);
            list.push({ id: "create-task", label: "Create Task", keywords: ["new"], icon: ListChecks, group: "Quick Create", perform: () => go(`/dashboard/tasks?${taskParams.toString()}`) });
        }
        if (onCreateActivity && visible.has("create-activity")) {
            list.push({ id: "create-activity", label: "Log Activity", keywords: ["new", "call", "note"], icon: ActivityIcon, group: "Quick Create", perform: () => { onOpenChange(false); onCreateActivity(); } });
        }

        list.push({ id: "nav-views", label: "Open Views", icon: LayoutGrid, group: "Navigate", perform: () => go("/dashboard/views") });
        list.push({ id: "nav-reports", label: "Run Reports", icon: BarChart3, group: "Navigate", perform: () => go("/dashboard/reports") });
        list.push({ id: "nav-exports", label: "Queue Exports", keywords: ["csv", "download"], icon: Download, group: "Navigate", perform: () => go("/dashboard/exports") });
        if (visible.has("nav-automations")) {
            list.push({ id: "nav-automations", label: "Launch Automations", keywords: ["workflow"], icon: Workflow, group: "Navigate", perform: () => go("/dashboard/automations-v2") });
        }

        list.push({ id: "settings-home", label: "Settings", icon: Settings, group: "Settings", perform: () => go("/dashboard/settings") });
        if (visible.has("settings-users")) {
            list.push({ id: "settings-users", label: "Users", icon: Users, group: "Settings", perform: () => go("/dashboard/settings/users") });
            list.push({ id: "settings-roles", label: "Roles", icon: Shield, group: "Settings", perform: () => go("/dashboard/settings/roles") });
            list.push({ id: "settings-security", label: "Security", keywords: ["mfa", "password", "sso"], icon: Shield, group: "Settings", perform: () => go("/dashboard/admin/security") });
            list.push({ id: "settings-integrations", label: "Integrations", icon: SlidersHorizontal, group: "Settings", perform: () => go("/dashboard/settings/integrations") });
            list.push({ id: "settings-api-keys", label: "API Keys", icon: KeyRound, group: "Settings", perform: () => go("/dashboard/settings/api-keys") });
        }

        return list;
    }, [onCreateLead, onCreateOpportunity, onCreateActivity, automationEnabled, isAdmin, canAccessModule, router, onOpenChange, contextDefaults.leadId, contextDefaults.opportunityId]);

    const commandGroups = useMemo(() => {
        const groups = new Map<string, CommandDef[]>();
        for (const command of commands) {
            if (!groups.has(command.group)) groups.set(command.group, []);
            groups.get(command.group)!.push(command);
        }
        return groups;
    }, [commands]);

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
        if (record.type === "report") return `/dashboard/reports?reportId=${record.id}`;
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
                <Command className="[&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item][aria-selected='true']]:bg-accent [&_[cmdk-item][aria-selected='true']]:text-accent-foreground">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Command.Input
                            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Type a command or search..."
                            value={query}
                            onValueChange={setQuery}
                        />
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />}
                    </div>
                    <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                        <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>

                        {favorites.length > 0 && !hasAnyResults && (
                            <Command.Group heading="Favorites" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {favorites.map((record) => {
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

                        {recent.length > 0 && !hasAnyResults && (
                            <Command.Group heading="Recent" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {recent.map((record) => {
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

                        {results.leads.length > 0 && (
                            <Command.Group heading="Leads" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.leads.map((lead) => (
                                    <Command.Item
                                        key={lead.id}
                                        value={lead.name}
                                        onSelect={() => handleSelect(lead.id, 'lead')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{lead.name}</span>
                                            <span className="text-xs text-muted-foreground">{lead.company}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.opportunities.length > 0 && (
                            <Command.Group heading="Opportunities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.opportunities.map((opp) => (
                                    <Command.Item
                                        key={opp.id}
                                        value={opp.title}
                                        onSelect={() => handleSelect(opp.id, 'opportunity')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{opp.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {opp.amount ? formatCurrency(opp.amount) : ''}
                                            </span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.activities.length > 0 && (
                            <Command.Group heading="Activities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.activities.map((act) => (
                                    <Command.Item
                                        key={act.id}
                                        value={act.notes}
                                        onSelect={() => handleSelect(act.id, 'activity')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate max-w-[400px]">
                                                {act.notes?.substring(0, 50)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">Activity</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.tasks.length > 0 && (
                            <Command.Group heading="Tasks" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.tasks.map((task) => (
                                    <Command.Item
                                        key={task.id}
                                        value={task.title}
                                        onSelect={() => handleSelect(task.id, 'task')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{task.title}</span>
                                            <span className="text-xs text-muted-foreground">Task</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.partners.length > 0 && (
                            <Command.Group heading="Partners" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.partners.map((partner) => (
                                    <Command.Item
                                        key={partner.id}
                                        value={partner.name}
                                        onSelect={() => handleSelect(partner.id, 'partner')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{partner.name}</span>
                                            <span className="text-xs text-muted-foreground">{partner.company}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}
                    </Command.List>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
