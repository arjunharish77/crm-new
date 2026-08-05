"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/empty-state";
import { SaveViewDialog } from "@/components/views/save-view-dialog";
import { fieldLabel, getSmartViewFields, SMART_VIEW_MODULE_OPTIONS } from "@/components/views/smart-view-fields";
import { applySmartViewFilters } from "@/components/views/smart-view-filtering";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { FilterConfig } from "@/types/filters";
import { SmartViewModule, SmartViewTab } from "@/types/smart-views";
import { ChevronLeft, ChevronRight, Copy, LayoutList, MoreHorizontal, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ViewRecord = {
    id: string;
    name: string;
    module?: string;
    isDefault: boolean;
    isPinned?: boolean;
    isShared: boolean;
    scope?: "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";
    tabs?: SmartViewTab[];
    sharedUserIds?: string[];
    sharedTeamIds?: string[];
    sharedSalesGroupIds?: string[];
    sharedRoleIds?: string[];
    displayOrder?: number;
    defaultModule?: string | null;
    defaultPersona?: "ADMIN" | "MANAGER" | "REP" | "PARTNER" | null;
};

type CurrentUser = {
    id?: string;
    teamId?: string | null;
    isTenantAdmin?: boolean;
    isPlatformAdmin?: boolean;
};

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };

const DEFAULT_COLUMNS: Record<SmartViewModule, string[]> = {
    LEADS: ["name", "email", "status", "source", "score", "createdAt"],
    OPPORTUNITIES: ["title", "amount", "stageId", "priority", "expectedCloseDate"],
    ACTIVITIES: ["typeId", "outcome", "notes", "dueAt", "slaStatus"],
    TASKS: ["title", "status", "priority", "ownerId", "dueAt"],
    PARTNERS: ["legalBusinessName", "status", "partnerLoginRole", "canAccessPayouts"],
    PAYOUTS: ["partnerId", "status", "amount", "isHeld", "createdAt"],
    REPORTS: ["name", "module", "createdBy", "createdAt"],
};

export default function ViewsPage() {
    const [views, setViews] = useState<ViewRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editingView, setEditingView] = useState<ViewRecord | null>(null);
    const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [recordsByTab, setRecordsByTab] = useState<Record<string, any[]>>({});
    const [tabErrors, setTabErrors] = useState<Record<string, string>>({});
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

    const canShareViews = !!(currentUser?.isTenantAdmin || currentUser?.isPlatformAdmin);

    const fetchViews = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<ViewRecord[]>("/saved-views?module=ALL");
            const records = Array.isArray(data) ? data : [];
            setViews(records);
            setSelectedViewId((current) => current && records.some((view) => view.id === current) ? current : records[0]?.id ?? null);
        } catch {
            toast.error("Failed to load Smart Views");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchViews();
        apiFetch<CurrentUser>("/auth/me").then(setCurrentUser).catch(() => setCurrentUser(null));
    }, [fetchViews]);

    const selectedView = useMemo(
        () => views.find((view) => view.id === selectedViewId) ?? views[0] ?? null,
        [selectedViewId, views]
    );

    const tabs = useMemo(() => normalizeTabs(selectedView), [selectedView]);
    const activeTab = useMemo(
        () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
        [activeTabId, tabs]
    );

    useEffect(() => {
        setActiveTabId(tabs[0]?.id ?? null);
        setSearch("");
    }, [selectedViewId]);

    const loadRecords = useCallback(async (view: ViewRecord | null, nextTabs: SmartViewTab[]) => {
        if (!view || nextTabs.length === 0) return;
        setLoadingRecords(true);
        const nextRecords: Record<string, any[]> = {};
        const nextErrors: Record<string, string> = {};

        await Promise.all(nextTabs.map(async (tab) => {
            try {
                const records = await fetchRecordsForTab(tab, currentUser);
                nextRecords[tab.id] = applySmartViewFilters(records, tab.filters ?? EMPTY_FILTERS);
            } catch (error: any) {
                nextRecords[tab.id] = [];
                nextErrors[tab.id] = error?.message || `Failed to load ${moduleLabel(tab.module)}`;
            }
        }));

        setRecordsByTab(nextRecords);
        setTabErrors(nextErrors);
        setLastUpdatedAt(new Date().toISOString());
        setLoadingRecords(false);
    }, [currentUser]);

    useEffect(() => {
        loadRecords(selectedView, tabs);
    }, [loadRecords, selectedView, tabs]);

    const cloneView = async (view: ViewRecord) => {
        try {
            await apiFetch(`/saved-views/${view.id}?action=clone`, { method: "POST" });
            toast.success("Smart View cloned");
            fetchViews();
        } catch {
            toast.error("Failed to clone Smart View");
        }
    };

    const deleteView = async (view: ViewRecord) => {
        if (!confirm(`Delete Smart View "${view.name}"?`)) return;
        try {
            await apiFetch(`/saved-views/${view.id}`, { method: "DELETE" });
            toast.success("Smart View deleted");
            fetchViews();
        } catch {
            toast.error("Failed to delete Smart View");
        }
    };

    const updateView = async (view: ViewRecord, patch: Partial<ViewRecord>) => {
        try {
            const updated = await apiFetch<ViewRecord>(`/saved-views/${view.id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            });
            setViews((current) => current.map((item) => item.id === view.id ? updated : item));
            setSelectedViewId(updated.id);
            toast.success("Smart View updated");
            fetchViews();
        } catch {
            toast.error("Failed to update Smart View");
        }
    };

    const renameView = async (view: ViewRecord) => {
        const name = window.prompt("Rename Smart View", view.name);
        if (!name?.trim() || name.trim() === view.name) return;
        await updateView(view, { name: name.trim() });
    };

    const moveView = async (view: ViewRecord, direction: -1 | 1) => {
        const ordered = [...views].sort((first, second) =>
            Number(first.displayOrder ?? 1000) - Number(second.displayOrder ?? 1000) || first.name.localeCompare(second.name),
        );
        const index = ordered.findIndex((item) => item.id === view.id);
        const swap = ordered[index + direction];
        if (!swap) return;
        await Promise.all([
            apiFetch(`/saved-views/${view.id}`, {
                method: "PATCH",
                body: JSON.stringify({ displayOrder: swap.displayOrder ?? (index + direction + 1) * 10 }),
            }),
            apiFetch(`/saved-views/${swap.id}`, {
                method: "PATCH",
                body: JSON.stringify({ displayOrder: view.displayOrder ?? (index + 1) * 10 }),
            }),
        ]);
        toast.success("Smart View order updated");
        fetchViews();
    };

    const setPersonaDefault = async (view: ViewRecord, persona: ViewRecord["defaultPersona"]) => {
        await updateView(view, {
            isDefault: true,
            defaultModule: activeTab?.module ?? view.module ?? "LEADS",
            defaultPersona: persona,
        });
    };

    const activeRecords = recordsByTab[activeTab?.id ?? ""] ?? [];
    const visibleRecords = useMemo(() => applySearchAndSort(activeRecords, activeTab, search), [activeRecords, activeTab, search]);
    const columns = useMemo(() => activeTab ? columnsForTab(activeTab) : [], [activeTab]);

    return (
        <div className="flex h-full min-h-[calc(100vh-80px)] flex-col bg-background">
            <div className="border-b bg-card px-4 py-3 md:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <LayoutList className="size-4" />
                            </div>
                            <h1 className="text-base font-extrabold tracking-tight">Smart Views</h1>
                        </div>
                        <Select value={selectedViewId ?? ""} onValueChange={setSelectedViewId} disabled={loading || views.length === 0}>
                            <SelectTrigger className="h-9 w-full min-w-[280px] max-w-[460px] rounded-md font-semibold">
                                <SelectValue placeholder="Select Smart View" />
                            </SelectTrigger>
                            <SelectContent>
                                {views.map((view) => (
                                    <SelectItem key={view.id} value={view.id}>
                                        {view.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedView?.isPinned ? <Star className="size-4 fill-amber-500 text-amber-500" /> : null}
                        {selectedView?.isShared ? <Badge variant="secondary" className="rounded-md">{selectedView.scope === "TENANT_DEFAULT" ? "Tenant" : "Assigned"}</Badge> : <Badge variant="outline" className="rounded-md">Private</Badge>}
                        {activeTab ? <Badge variant="outline" className="rounded-md">{moduleLabel(activeTab.module)}</Badge> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadRecords(selectedView, tabs)} disabled={!selectedView || loadingRecords}>
                            <RefreshCw className={cn("size-4", loadingRecords && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={() => {
                            setEditingView(null);
                            setBuilderOpen(true);
                        }}>
                            <Plus className="size-4" />
                            New Smart View
                        </Button>
                        {selectedView ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon-sm" aria-label="Smart View actions">
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                        setEditingView(selectedView);
                                        setBuilderOpen(true);
                                    }}>
                                        <Pencil className="size-4" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => renameView(selectedView)}>
                                        <Pencil className="size-4" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => moveView(selectedView, -1)}>
                                        <ChevronLeft className="size-4" />
                                        Move up
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => moveView(selectedView, 1)}>
                                        <ChevronRight className="size-4" />
                                        Move down
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, null)}>
                                        <Star className="size-4" />
                                        Default for module
                                    </DropdownMenuItem>
                                    {canShareViews ? (
                                        <>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "ADMIN")}>Default for Admin</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "MANAGER")}>Default for Manager</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "REP")}>Default for Rep</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPersonaDefault(selectedView, "PARTNER")}>Default for Partner</DropdownMenuItem>
                                        </>
                                    ) : null}
                                    <DropdownMenuItem onClick={() => cloneView(selectedView)}>
                                        <Copy className="size-4" />
                                        Clone
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteView(selectedView)}>
                                        <Trash2 className="size-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="m-4 rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading Smart Views...</div>
            ) : views.length === 0 ? (
                <div className="p-4">
                    <EmptyState
                        icon={<LayoutList className="size-12 text-muted-foreground opacity-50" />}
                        title="No Smart Views assigned yet"
                        description={canShareViews ? "Create a Smart View and assign it to users, teams, or sales groups." : "Create a private Smart View for your own workspace."}
                        action={<Button onClick={() => setBuilderOpen(true)}><Plus className="size-4" />New Smart View</Button>}
                    />
                </div>
            ) : selectedView && activeTab ? (
                <>
                    <div className="border-b bg-surface-container-low">
                        <div className="flex overflow-x-auto px-2 md:px-4">
                            {tabs.map((tab) => {
                                const active = tab.id === activeTab.id;
                                const count = recordsByTab[tab.id]?.length;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={cn(
                                            "min-h-[68px] min-w-[220px] border-x border-transparent px-4 py-2.5 text-left transition-colors",
                                            active ? "border-x-border border-t-2 border-t-primary bg-background shadow-sm" : "text-muted-foreground hover:bg-background/70"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={cn("truncate text-sm font-bold", active && "text-foreground")}>{tab.name}</span>
                                            {tab.filters?.conditions?.length ? (
                                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[0.65rem]">{tab.filters.conditions.length}</Badge>
                                            ) : null}
                                        </div>
                                        <div className={cn("mt-0.5 text-lg font-extrabold", active ? "text-primary" : "text-muted-foreground")}>
                                            {loadingRecords && count === undefined ? "..." : (count ?? 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{moduleLabel(tab.module)}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-b bg-card px-4 py-3 md:px-5">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span className={cn("size-2.5 rounded-full", tabErrors[activeTab.id] ? "bg-destructive" : "bg-primary")} />
                                <span>Last Updated: {lastUpdatedAt ? relativeTime(lastUpdatedAt) : "Never"}</span>
                                <span className="hidden sm:inline">|</span>
                                <button type="button" className="font-semibold text-primary" onClick={() => loadRecords(selectedView, tabs)}>
                                    Refresh
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold text-muted-foreground">
                                    <SlidersHorizontal className="size-4" />
                                    {activeTab.filters?.conditions?.length ?? 0} filters
                                </div>
                                <div className="relative w-full sm:w-[300px]">
                                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="h-9 rounded-md pl-8"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder={`Search ${moduleLabel(activeTab.module).toLowerCase()}`}
                                    />
                                </div>
                                <Badge variant="outline" className="h-9 rounded-md px-3">
                                    {visibleRecords.length.toLocaleString()} records
                                </Badge>
                            </div>
                        </div>
                        {activeTab.countChips?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {activeTab.countChips.map((chip) => (
                                    <Badge key={chip.id} variant="secondary" className="rounded-md">
                                        {chip.label}: {countForChip(activeRecords, chip).toLocaleString()}
                                    </Badge>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto bg-background">
                        {tabErrors[activeTab.id] ? (
                            <div className="p-4">
                                <EmptyState title="Cannot load this tab" description={tabErrors[activeTab.id]} />
                            </div>
                        ) : loadingRecords && visibleRecords.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">Loading records...</div>
                        ) : visibleRecords.length === 0 ? (
                            <div className="p-4">
                                <EmptyState title="No records found" description="Adjust the Smart View filters or refresh this tab." />
                            </div>
                        ) : (
                            <InlineRecordsTable tab={activeTab} records={visibleRecords} columns={columns} />
                        )}
                    </div>
                </>
            ) : null}

            <SaveViewDialog
                open={builderOpen}
                onOpenChange={(nextOpen) => {
                    setBuilderOpen(nextOpen);
                    if (!nextOpen) setEditingView(null);
                }}
                module="LEADS"
                filters={EMPTY_FILTERS}
                canShare={canShareViews}
                initialView={editingView}
                onSuccess={() => {
                    setBuilderOpen(false);
                    setEditingView(null);
                    fetchViews();
                }}
            />
        </div>
    );
}

function normalizeTabs(view: ViewRecord | null): SmartViewTab[] {
    if (!view) return [];
    if (view.tabs?.length) return view.tabs;
    const viewModule = String(view.module ?? "LEADS").toUpperCase() as SmartViewModule;
    return [{
        id: `${view.id}-default`,
        name: view.name,
        module: viewModule,
        filters: EMPTY_FILTERS,
        density: "comfortable",
    }];
}

async function fetchRecordsForTab(tab: SmartViewTab, currentUser: CurrentUser | null) {
    const response = await fetchModuleData(tab.module);
    const records = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
    return records.map((record: any) => decorateRecord(tab.module, record, currentUser));
}

async function fetchModuleData(module: SmartViewModule) {
    if (module === "LEADS") return apiFetch("/leads?page=1&limit=500");
    if (module === "OPPORTUNITIES") return apiFetch("/opportunities?limit=500");
    if (module === "ACTIVITIES") return apiFetch("/activities?limit=500");
    if (module === "TASKS") return apiFetch("/tasks");
    if (module === "PARTNERS") return apiFetch("/partners");
    if (module === "REPORTS") return apiFetch("/reports/custom");
    if (module === "PAYOUTS") {
        const cycles = await apiFetch<any[]>("/payout-cycles");
        const cycleId = Array.isArray(cycles) ? cycles[0]?.id : null;
        return cycleId ? apiFetch(`/payout-cycles/${cycleId}/payouts`) : [];
    }
    return [];
}

function decorateRecord(module: SmartViewModule, record: any, currentUser: CurrentUser | null) {
    const ownerId = record.ownerId ?? record.owner?.id ?? record.partner?.userId ?? null;
    const ownerSegment = ownerId && currentUser?.id && ownerId === currentUser.id ? "CURRENT_USER" : "OTHER";
    const teamSegment = record.teamId && currentUser?.teamId && record.teamId === currentUser.teamId ? "CURRENT_TEAM" : "OTHER";
    if (module === "TASKS") {
        return { ...record, due: dueSegment(record), ownerSegment, teamSegment, ownerName: record.owner?.name || record.owner?.email || "Unknown user" };
    }
    if (module === "OPPORTUNITIES") {
        return { ...record, ownerSegment, teamSegment, stageName: record.stage?.name || "Unknown stage", leadName: record.lead?.name || record.lead?.email || "Unknown lead" };
    }
    if (module === "ACTIVITIES") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            activityTypeName: record.type?.name || "Unknown activity type",
            leadName: record.lead?.name || record.lead?.email || "Unknown lead",
            opportunityTitle: record.opportunity?.title || "Unknown opportunity",
            creatorName: record.user?.name || record.user?.email || "Unknown user",
        };
    }
    if (module === "PARTNERS") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            name: record.user?.name || record.legalBusinessName || "Unnamed partner",
            email: record.user?.email,
            partnerOrganizationName: record.organization?.name || record.partnerOrganization?.name || "No organization",
        };
    }
    if (module === "PAYOUTS") {
        return {
            ...record,
            ownerSegment,
            teamSegment,
            amount: record.totalCommissionAmount ?? record.amount,
            partnerName: record.partner?.legalBusinessName || record.partner?.name || record.partner?.user?.name || "Unknown partner",
            partnerOrganizationName: record.partnerOrganization?.name || record.partner?.organization?.name || "No organization",
        };
    }
    const lastActivityAt = record.lastActivityAt ?? record.lastActivity?.createdAt ?? null;
    return {
        ...record,
        ownerSegment,
        teamSegment,
        activitySegment: lastActivityAt ? "TOUCHED" : "UNTOUCHED",
    };
}

function dueSegment(record: any) {
    const status = String(record.status ?? "").toUpperCase();
    if (status === "COMPLETED") return "completed";
    if (!record.dueAt) return "";
    const due = new Date(record.dueAt).getTime();
    const now = Date.now();
    if (Number.isNaN(due)) return "";
    if (due < now) return "overdue";
    const today = new Date();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return due <= end.getTime() ? "today" : "upcoming";
}

function columnsForTab(tab: SmartViewTab) {
    const fields = getSmartViewFields(tab.module);
    const validKeys = new Set(fields.map((field) => field.key));
    const configured = (tab.columns?.length ? tab.columns : DEFAULT_COLUMNS[tab.module]).filter((key) => validKeys.has(key));
    const fallback = DEFAULT_COLUMNS[tab.module].filter((key) => validKeys.has(key));
    const safeColumns = configured.length ? configured : fallback;
    return safeColumns.map((key) => ({ key, label: fieldLabel(fields, key) }));
}

function applySearchAndSort(records: any[], tab: SmartViewTab | null, search: string) {
    let next = records;
    const term = search.trim().toLowerCase();
    if (term) {
        next = next.filter((record) => Object.values(flattenForSearch(record)).some((value) => String(value ?? "").toLowerCase().includes(term)));
    }
    if (tab?.sort?.field) {
        const direction = tab.sort.order === "asc" ? 1 : -1;
        next = [...next].sort((a, b) => compareValues(readValue(a, tab.sort!.field), readValue(b, tab.sort!.field)) * direction);
    }
    return next;
}

function InlineRecordsTable({ tab, records, columns }: { tab: SmartViewTab; records: any[]; columns: Array<{ key: string; label: string }> }) {
    const densityClass = tab.density === "compact" ? "py-2" : tab.density === "spacious" ? "py-5" : "py-3";
    return (
        <div className="min-w-full overflow-x-auto">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow>
                        {columns.map((column) => (
                            <TableHead key={column.key} className="min-w-[170px] whitespace-nowrap border-r text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">
                                {column.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.map((record, index) => (
                        <TableRow key={record.id ?? `${tab.id}-${index}`} className="hover:bg-surface-container-low/70">
                            {columns.map((column) => (
                                <TableCell key={column.key} className={cn("max-w-[340px] whitespace-normal border-r align-top text-sm", densityClass)}>
                                    {formatCell(displayValue(tab.module, record, column.key))}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function countForChip(records: any[], chip: NonNullable<SmartViewTab["countChips"]>[number]) {
    return applySmartViewFilters(records, {
        logic: "AND",
        conditions: [{
            id: chip.id,
            field: chip.field,
            operator: chip.operator,
            value: chip.value,
        }],
    }).length;
}

function moduleLabel(module: SmartViewModule) {
    return SMART_VIEW_MODULE_OPTIONS.find((option) => option.value === module)?.label ?? module;
}

function relativeTime(value: string) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "less than a minute ago";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function readValue(record: Record<string, any>, path: string) {
    if (path in record) return record[path];
    return path.split(".").reduce((value, key) => value?.[key], record);
}

function displayValue(module: SmartViewModule, record: Record<string, any>, key: string) {
    if (key === "ownerId") return record.owner?.name || record.owner?.email || record.ownerName || "Unknown user";
    if (key === "createdBy") return record.user?.name || record.user?.email || record.creatorName || "Unknown user";
    if (key === "stageId") return record.stage?.name || record.stageName || "Unknown stage";
    if (key === "typeId") return record.type?.name || record.activityTypeName || "Unknown activity type";
    if (key === "leadId") return record.lead?.name || record.lead?.email || record.leadName || "Unknown lead";
    if (key === "opportunityId") return record.opportunity?.title || record.opportunityTitle || "Unknown opportunity";
    if (key === "partnerId") return record.partner?.legalBusinessName || record.partner?.user?.name || record.partnerName || "Unknown partner";
    if (key === "partnerOrganizationId") return record.partnerOrganization?.name || record.organization?.name || record.partnerOrganizationName || "No organization";
    if (module === "REPORTS" && key === "reportKey") return record.name || record.reportKey || "Report";
    return readValue(record, key);
}

function formatCell(value: unknown) {
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">...</span>;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatWorkspaceDateTime(value);
    if (typeof value === "string" && isTechnicalIdentifier(value)) return <span className="text-muted-foreground">Linked record</span>;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function isTechnicalIdentifier(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        || /^(demo|seed)-[a-z0-9-]+$/i.test(value);
}

function compareValues(a: unknown, b: unknown) {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    const aNumber = Number(a);
    const bNumber = Number(b);
    if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) return aNumber - bNumber;
    return String(a).localeCompare(String(b));
}

function flattenForSearch(record: any) {
    return {
        ...record,
        ownerName: record.owner?.name,
        ownerEmail: record.owner?.email,
        leadName: record.lead?.name,
        opportunityTitle: record.opportunity?.title,
        partnerName: record.partner?.legalBusinessName || record.partner?.name,
    };
}
