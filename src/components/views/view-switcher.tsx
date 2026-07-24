"use client";

import { useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, LayoutList, MoreHorizontal, Pin, PinOff, Save, Star, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { FilterConfig } from "@/types/filters";
import { SmartViewModule, SmartViewSort, SmartViewTab } from "@/types/smart-views";
import { SaveViewDialog } from "./save-view-dialog";

interface ViewSwitcherProps {
    module: string;
    currentFilters: FilterConfig;
    onConfigChange: (filters: FilterConfig) => void;
    density?: "compact" | "comfortable" | "spacious";
    columns?: string[];
    sort?: SmartViewSort | null;
    groupBy?: string | null;
    activeCount?: number;
    onViewChange?: (view: SavedView | null) => void;
}

export interface SavedView {
    id: string;
    name: string;
    ownerId?: string;
    isDefault: boolean;
    isShared: boolean;
    isPinned?: boolean;
    scope?: "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";
    filters: FilterConfig;
    tabs?: SmartViewTab[];
    density?: "compact" | "comfortable" | "spacious";
    columns?: string[];
    sort?: SmartViewSort | null;
    groupBy?: string | null;
}

const MODULE_ROUTES: Record<SmartViewModule, string> = {
    LEADS: "/dashboard/leads",
    OPPORTUNITIES: "/dashboard/opportunities",
    ACTIVITIES: "/dashboard/activities",
    TASKS: "/dashboard/tasks",
    PARTNERS: "/dashboard/admin/partners",
    PAYOUTS: "/dashboard/admin/payout-cycles",
    REPORTS: "/dashboard/reports",
};

function normalizeModule(module: string): SmartViewModule {
    const normalized = module.toUpperCase();
    return normalized in MODULE_ROUTES ? normalized as SmartViewModule : "LEADS";
}

export function ViewSwitcher({
    module,
    currentFilters,
    onConfigChange,
    density,
    columns,
    sort,
    groupBy,
    activeCount,
    onViewChange,
}: ViewSwitcherProps) {
    const [views, setViews] = useState<SavedView[]>([]);
    const [currentViewId, setCurrentViewId] = useState<string>("custom");
    const [activeTabId, setActiveTabId] = useState("");
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const currentModule = normalizeModule(module);

    const getViewTab = (view: SavedView, preferredTabId?: string) => {
        const tabs = view.tabs?.length ? view.tabs : [{
            id: "default",
            name: view.name,
            module: currentModule,
            filters: view.filters,
            density: view.density,
            columns: view.columns,
            sort: view.sort,
            groupBy: view.groupBy,
        } satisfies SmartViewTab];
        return tabs.find((tab) => tab.id === preferredTabId)
            ?? tabs.find((tab) => tab.module === currentModule)
            ?? tabs[0];
    };

    const applyView = (view: SavedView, preferredTabId?: string) => {
        const tab = getViewTab(view, preferredTabId);
        setCurrentViewId(view.id);
        setActiveTabId(tab?.id ?? "");
        if (tab?.module === currentModule) {
            onConfigChange(tab.filters);
        }
        onViewChange?.(view);
    };

    const fetchViews = async () => {
        try {
            const data = await apiFetch(`/saved-views?module=${module}`);
            setViews(data);
            const params = new URLSearchParams(window.location.search);
            const requestedViewId = params.get("smartViewId");
            const requestedTabId = params.get("smartViewTabId") ?? undefined;
            const requestedView = requestedViewId ? data.find((v: SavedView) => v.id === requestedViewId) : null;
            if (requestedView) {
                applyView(requestedView, requestedTabId);
                return;
            }

            const defaultView = data.find((v: SavedView) => v.isDefault);
            if (defaultView && currentFilters.conditions.length === 0) {
                applyView(defaultView);
            }
        } catch (error) {
            console.error("Failed to fetch Smart Views");
        }
    };

    useEffect(() => {
        fetchViews();
    }, []);

    const handleViewChange = (viewId: string) => {
        setCurrentViewId(viewId);

        if (viewId === "custom") {
            onViewChange?.(null);
        } else {
            const view = views.find((v) => v.id === viewId);
            if (view) {
                applyView(view);
            }
        }
    };

    const updateView = async (view: SavedView, patch: Partial<SavedView>) => {
        const updated = await apiFetch<SavedView>(`/saved-views/${view.id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        });
        setViews((current) => current.map((item) => item.id === updated.id ? updated : patch.isDefault ? { ...item, isDefault: false } : item));
        if (currentViewId === updated.id) onViewChange?.(updated);
    };

    const cloneView = async (view: SavedView) => {
        const cloned = await apiFetch<SavedView>(`/saved-views/${view.id}?action=clone`, { method: "POST" });
        setViews((current) => [...current, cloned]);
        applyView(cloned);
    };

    const deleteView = async (view: SavedView) => {
        if (!confirm(`Delete Smart View "${view.name}"?`)) return;
        await apiFetch(`/saved-views/${view.id}`, { method: "DELETE" });
        setViews((current) => current.filter((item) => item.id !== view.id));
        if (currentViewId === view.id) {
            setCurrentViewId("custom");
            setActiveTabId("");
            onViewChange?.(null);
        }
    };

    const handleTabClick = (view: SavedView, tab: SmartViewTab) => {
        if (tab.module !== currentModule) {
            const route = MODULE_ROUTES[tab.module];
            window.location.href = `${route}?smartViewId=${encodeURIComponent(view.id)}&smartViewTabId=${encodeURIComponent(tab.id)}`;
            return;
        }
        setActiveTabId(tab.id);
        onConfigChange(tab.filters);
        onViewChange?.(view);
    };

    const pinnedViews = views.filter(v => v.isPinned);
    const myViews = views.filter(v => !v.isShared && !v.isPinned);
    const sharedViews = views.filter(v => v.isShared && !v.isPinned);
    const selectedView = views.find(v => v.id === currentViewId);
    const selectedTab = selectedView ? getViewTab(selectedView, activeTabId) : null;

    const renderViewLabel = (view: SavedView) => (
        <div className="flex w-full items-center justify-between gap-2">
            <span className="truncate text-sm">{view.name}</span>
            <span className="flex items-center gap-1">
                {view.isDefault ? <Star size={14} className="fill-amber-500 text-amber-500" /> : null}
                {view.isPinned ? <Pin size={13} className="text-primary" /> : null}
            </span>
        </div>
    );

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={currentViewId} onValueChange={handleViewChange}>
                <SelectTrigger className="min-w-[200px] bg-background">
                    <SelectValue>
                        <div className="flex items-center gap-2">
                            <LayoutList size={16} />
                            <span className="text-sm">
                                {currentViewId === "custom" ? "Custom Smart View" : selectedView?.name || "Select Smart View"}
                            </span>
                        </div>
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="custom">Custom Smart View</SelectItem>

                    {pinnedViews.length > 0 && (
                        <SelectGroup>
                            <SelectLabel>Pinned</SelectLabel>
                            {pinnedViews.map((view) => (
                                <SelectItem key={view.id} value={view.id}>
                                    {renderViewLabel(view)}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}

                    {myViews.length > 0 && (
                        <SelectGroup>
                            <SelectLabel>My Views</SelectLabel>
                            {myViews.map((view) => (
                                <SelectItem key={view.id} value={view.id}>
                                    {renderViewLabel(view)}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}

                    {sharedViews.length > 0 && (
                        <SelectGroup>
                            <SelectLabel>Shared Views</SelectLabel>
                            {sharedViews.map((view) => (
                                <SelectItem key={view.id} value={view.id}>
                                    {renderViewLabel(view)}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                </SelectContent>
            </Select>

            {selectedView ? (
                <div className="hidden items-center gap-1 sm:flex">
                    {selectedView.scope === "TENANT_DEFAULT" ? <Badge variant="secondary">Tenant default</Badge> : null}
                    {selectedView.isShared && selectedView.scope !== "TENANT_DEFAULT" ? <Badge variant="outline">Shared</Badge> : null}
                    {selectedView.tabs?.length ? <Badge variant="outline">{selectedView.tabs.length} tabs</Badge> : null}
                    {selectedTab?.density ? <Badge variant="outline">{selectedTab.density}</Badge> : null}
                    {selectedTab?.chart && selectedTab.chart.type !== "none" ? <Badge variant="outline">{selectedTab.chart.type}</Badge> : null}
                </div>
            ) : null}

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setSaveDialogOpen(true)}>
                        <Save size={18} />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Save current view</TooltipContent>
            </Tooltip>

            {selectedView ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Smart View actions">
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => updateView(selectedView, { isPinned: !selectedView.isPinned })}>
                            {selectedView.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                            {selectedView.isPinned ? "Unpin view" : "Pin view"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateView(selectedView, { isDefault: true })}>
                            <Star className="size-4" />
                            Make default
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => cloneView(selectedView)}>
                            <Copy className="size-4" />
                            Clone view
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteView(selectedView)}>
                            <Trash2 className="size-4" />
                            Delete view
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}

            <SaveViewDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
                module={module}
                filters={currentFilters}
                density={density}
                columns={columns}
                sort={sort}
                groupBy={groupBy}
                onSuccess={(newView) => {
                    setViews([...views, newView]);
                    applyView(newView);
                }}
            />
            {selectedView?.tabs?.length ? (
                <div className="flex w-full flex-wrap gap-1.5">
                    {selectedView.tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleTabClick(selectedView, tab)}
                            className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${activeTabId === tab.id ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:bg-accent"}`}
                        >
                            {tab.name}
                            <span className="ml-1 font-medium opacity-70">
                                {tab.module.toLowerCase()}
                            </span>
                            {activeTabId === tab.id && typeof activeCount === "number" ? (
                                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] text-primary-foreground">
                                    {activeCount}
                                </span>
                            ) : null}
                        </button>
                    ))}
                    {selectedTab?.countChips?.map((chip) => (
                        <Badge key={chip.id} variant="secondary" className="rounded-full">
                            {chip.label || chip.field}
                        </Badge>
                    ))}
                    {selectedTab?.quickActions?.map((action) => (
                        <Badge key={action} variant="outline" className="rounded-full">
                            {action.replaceAll("_", " ")}
                        </Badge>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
