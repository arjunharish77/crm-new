"use client";

import { useEffect, useRef, useState } from "react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FilterBuilder } from "@/components/filters/filter-builder";
import { fieldLabel, getSmartViewFields, getSmartViewQuickActions, SMART_VIEW_MODULE_OPTIONS, SmartViewReferenceOptions } from "@/components/views/smart-view-fields";
import { BarChart3, Columns3, Layers3, Loader2, Plus, Settings2, Sparkles, Tags, Trash2, Users } from "lucide-react";
import { FilterConfig } from "@/types/filters";
import { SmartViewChart, SmartViewCountChip, SmartViewModule, SmartViewScope, SmartViewSort, SmartViewTab } from "@/types/smart-views";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface SaveViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    module: string;
    filters: FilterConfig;
    density?: "compact" | "comfortable" | "spacious";
    columns?: string[];
    sort?: SmartViewSort | null;
    groupBy?: string | null;
    canShare?: boolean;
    initialView?: SavedViewForDialog | null;
    onSuccess: (savedView: any) => void;
}

const EMPTY_FILTERS: FilterConfig = { conditions: [], logic: "AND" };

type BuilderStep = "filters" | "layout" | "insights" | "actions";

type SavedViewForDialog = {
    id: string;
    name: string;
    isDefault?: boolean;
    isPinned?: boolean;
    isShared?: boolean;
    scope?: SmartViewScope;
    tabs?: SmartViewTab[];
    sharedUserIds?: string[];
    sharedTeamIds?: string[];
    sharedSalesGroupIds?: string[];
    sharedRoleIds?: string[];
};

const BUILDER_STEPS: Array<{ value: BuilderStep; label: string; description: string }> = [
    { value: "filters", label: "Filters", description: "Conditions for this tab" },
    { value: "layout", label: "Layout", description: "Columns, sort, density" },
    { value: "insights", label: "Insights", description: "Charts and count chips" },
    { value: "actions", label: "Actions", description: "Row actions" },
];

function normalizeModule(module: string): SmartViewModule {
    const normalized = module.toUpperCase();
    return SMART_VIEW_MODULE_OPTIONS.some((option) => option.value === normalized)
        ? normalized as SmartViewModule
        : "LEADS";
}

function createTab(module: string, filters: FilterConfig, overrides: Partial<SmartViewTab> = {}): SmartViewTab {
    const smartModule = normalizeModule(overrides.module ?? module);
    return {
        id: overrides.id ?? `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: overrides.name ?? SMART_VIEW_MODULE_OPTIONS.find((option) => option.value === smartModule)?.label ?? "Tab",
        module: smartModule,
        filters: overrides.filters ?? filters,
        density: overrides.density,
        columns: overrides.columns,
        sort: overrides.sort,
        groupBy: overrides.groupBy,
        chart: overrides.chart ?? { type: "none", metric: "count", field: null },
        countChips: overrides.countChips ?? [],
        quickActions: overrides.quickActions,
    };
}

function cloneDialogTabs(view: SavedViewForDialog, module: string, filters: FilterConfig, density: SmartViewTab["density"]): SmartViewTab[] {
    if (!view.tabs?.length) return [createTab(module, filters, { name: view.name, density })];
    return view.tabs.map((tab) => createTab(tab.module, tab.filters ?? EMPTY_FILTERS, {
        ...tab,
        filters: tab.filters ?? EMPTY_FILTERS,
        columns: Array.isArray(tab.columns) ? tab.columns : [],
        sort: tab.sort ?? null,
        groupBy: tab.groupBy ?? null,
        chart: tab.chart ?? { type: "none", metric: "count", field: null },
        countChips: Array.isArray(tab.countChips) ? tab.countChips : [],
        quickActions: Array.isArray(tab.quickActions) ? tab.quickActions : [],
    }));
}

export function SaveViewDialog({
    open,
    onOpenChange,
    module,
    filters,
    density = "comfortable",
    columns = [],
    sort = null,
    groupBy = null,
    canShare = true,
    initialView = null,
    onSuccess,
}: SaveViewDialogProps) {
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [isDefault, setIsDefault] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [scope, setScope] = useState<"PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT">("PRIVATE");
    const [users, setUsers] = useState<Array<{ id: string; name?: string; email?: string }>>([]);
    const [teams, setTeams] = useState<Array<{ id: string; name?: string }>>([]);
    const [salesGroups, setSalesGroups] = useState<Array<{ id: string; name?: string }>>([]);
    const [roles, setRoles] = useState<Array<{ id: string; name?: string }>>([]);
    const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
    const [sharedTeamIds, setSharedTeamIds] = useState<string[]>([]);
    const [sharedSalesGroupIds, setSharedSalesGroupIds] = useState<string[]>([]);
    const [sharedRoleIds, setSharedRoleIds] = useState<string[]>([]);
    const [tabs, setTabs] = useState<SmartViewTab[]>([]);
    const [activeTabId, setActiveTabId] = useState("");
    const [builderStep, setBuilderStep] = useState<BuilderStep>("filters");
    const [referenceOptions, setReferenceOptions] = useState<Omit<SmartViewReferenceOptions, "users">>({});
    const wasOpenRef = useRef(false);
    const isEditing = Boolean(initialView?.id);

    useEffect(() => {
        const wasOpen = wasOpenRef.current;
        wasOpenRef.current = open;

        if (open && !wasOpen) {
            if (initialView) {
                const nextTabs = cloneDialogTabs(initialView, module, filters, density);
                setName(initialView.name ?? "");
                setIsDefault(Boolean(initialView.isDefault));
                setIsPinned(Boolean(initialView.isPinned));
                setScope(canShare ? (initialView.scope ?? (initialView.isShared ? "SHARED" : "PRIVATE")) : "PRIVATE");
                setSharedUserIds(initialView.sharedUserIds ?? []);
                setSharedTeamIds(initialView.sharedTeamIds ?? []);
                setSharedSalesGroupIds(initialView.sharedSalesGroupIds ?? []);
                setSharedRoleIds(initialView.sharedRoleIds ?? []);
                setTabs(nextTabs);
                setActiveTabId(nextTabs[0]?.id ?? "");
            } else {
                const firstTab = createTab(module, filters, {
                    density,
                    columns,
                    sort,
                    groupBy,
                });
                setTabs([firstTab]);
                setActiveTabId(firstTab.id);
            }
            setBuilderStep("filters");
        } else if (!open && wasOpen) {
            setName("");
            setIsDefault(false);
            setIsPinned(false);
            setScope(canShare ? "PRIVATE" : "PRIVATE");
            setSharedUserIds([]);
            setSharedTeamIds([]);
            setSharedSalesGroupIds([]);
            setSharedRoleIds([]);
            setTabs([]);
            setActiveTabId("");
            setBuilderStep("filters");
        }
    }, [canShare, columns, density, filters, groupBy, initialView, module, open, sort]);

    useEffect(() => {
        if (!canShare && scope !== "PRIVATE") {
            setScope("PRIVATE");
            setIsDefault(false);
            setSharedUserIds([]);
            setSharedTeamIds([]);
            setSharedSalesGroupIds([]);
            setSharedRoleIds([]);
        }
    }, [canShare, scope]);

    useEffect(() => {
        if (!open) return;
        Promise.all([
            apiFetch<any[]>("/users").catch(() => []),
            apiFetch<any[]>("/teams").catch(() => []),
            apiFetch<any[]>("/sales-groups").catch(() => []),
            apiFetch<any[]>("/roles").catch(() => []),
        ]).then(([userData, teamData, groupData, roleData]) => {
            setUsers(Array.isArray(userData) ? userData : []);
            setTeams(Array.isArray(teamData) ? teamData : []);
            setSalesGroups(Array.isArray(groupData) ? groupData : []);
            setRoles(Array.isArray(roleData) ? roleData : []);
        });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        Promise.all([
            apiFetch<any>("/leads?limit=300").catch(() => []),
            apiFetch<any>("/opportunities?limit=300").catch(() => []),
            apiFetch<any[]>("/opportunity-types").catch(() => []),
            apiFetch<any[]>("/activity-types").catch(() => []),
            apiFetch<any[]>("/partners").catch(() => []),
            apiFetch<any[]>("/reports/custom").catch(() => []),
        ]).then(([leadData, opportunityData, opportunityTypeData, activityTypeData, partnerData, reportData]) => {
            const leadList = Array.isArray(leadData) ? leadData : Array.isArray(leadData?.data) ? leadData.data : [];
            const opportunityList = Array.isArray(opportunityData) ? opportunityData : Array.isArray(opportunityData?.data) ? opportunityData.data : [];
            const opportunityTypes = Array.isArray(opportunityTypeData) ? opportunityTypeData : [];
            const activityTypes = Array.isArray(activityTypeData) ? activityTypeData : [];
            const partners = Array.isArray(partnerData) ? partnerData : [];
            const reports = Array.isArray(reportData) ? reportData : [];
            const organizations = partners
                .map((partner) => partner.organization || partner.partnerOrganization)
                .filter(Boolean);

            setReferenceOptions({
                leads: leadList.map((lead: any) => ({ label: lead.name || lead.email || lead.company || "Lead", value: lead.id })).filter((option: any) => option.value),
                opportunities: opportunityList.map((opportunity: any) => ({ label: opportunity.title || opportunity.name || "Opportunity", value: opportunity.id })).filter((option: any) => option.value),
                stages: opportunityTypes.flatMap((type: any) => (type.stages ?? []).map((stage: any) => ({ label: `${type.name}: ${stage.name}`, value: stage.id }))).filter((option: any) => option.value),
                activityTypes: activityTypes.map((type: any) => ({ label: type.name || "Activity type", value: type.id })).filter((option: any) => option.value),
                partners: partners.map((partner: any) => ({ label: partner.legalBusinessName || partner.user?.name || partner.user?.email || "Partner", value: partner.id })).filter((option: any) => option.value),
                partnerOrganizations: organizations
                    .map((organization: any) => ({ label: organization.name || "Partner organization", value: organization.id }))
                    .filter((option: any, index: number, list: any[]) => option.value && list.findIndex((item) => item.value === option.value) === index),
                reports: reports.map((report: any) => ({ label: report.name || report.reportKey || "Report", value: report.reportKey || report.id })).filter((option: any) => option.value),
            });
        });
    }, [open]);

    const onSubmit = async () => {
        if (name.trim().length < 2) {
            toast.error("Smart View name is required");
            return;
        }
        if (tabs.length === 0) {
            toast.error("Add at least one Smart View tab");
            return;
        }

        setLoading(true);
        try {
            const normalizedTabs = tabs.map((tab) => ({
                ...tab,
                name: tab.name.trim() || "Untitled tab",
                filters: tab.filters ?? EMPTY_FILTERS,
            }));
            const savedView = await apiFetch(isEditing ? `/saved-views/${initialView?.id}` : "/saved-views", {
                method: isEditing ? "PATCH" : "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    isDefault,
                    isPinned,
                    scope,
                    isShared: scope !== "PRIVATE",
                    module,
                    filters: normalizedTabs[0]?.filters ?? filters,
                    tabs: normalizedTabs,
                    sharedUserIds,
                    sharedTeamIds,
                    sharedSalesGroupIds,
                    sharedRoleIds,
                    density,
                    columns,
                    sort,
                    groupBy,
                }),
            });
            toast.success(isEditing ? "Smart View updated" : "Smart View saved");
            onSuccess(savedView);
            onOpenChange(false);
        } catch {
            toast.error("Failed to save Smart View");
        } finally {
            setLoading(false);
        }
    };

    const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

    const updateTab = (tabId: string, patch: Partial<SmartViewTab>) => {
        setTabs((current) => current.map((tab) => tab.id === tabId ? { ...tab, ...patch } : tab));
    };

    const addTab = () => {
        const nextTab = createTab(module, EMPTY_FILTERS, { name: `Tab ${tabs.length + 1}` });
        setTabs((current) => [...current, nextTab]);
        setActiveTabId(nextTab.id);
    };

    const removeTab = (tabId: string) => {
        setTabs((current) => {
            const next = current.filter((tab) => tab.id !== tabId);
            if (activeTabId === tabId) {
                setActiveTabId(next[0]?.id ?? "");
            }
            return next;
        });
    };

    const changeActiveTabModule = (nextModule: SmartViewModule) => {
        if (!activeTab) return;
        updateTab(activeTab.id, {
            module: nextModule,
            filters: EMPTY_FILTERS,
            columns: [],
            sort: null,
            groupBy: null,
            chart: { type: "none", metric: "count", field: null },
            countChips: [],
            quickActions: [],
        });
        setBuilderStep("filters");
    };

    const activeFields = activeTab ? getSmartViewFields(activeTab.module, {
        ...referenceOptions,
        users: users.map((user) => ({ label: user.name || user.email || "User", value: user.id })).filter((option) => option.value),
    }) : [];
    const activeQuickActions = activeTab ? getSmartViewQuickActions(activeTab.module) : [];

    const updateActiveTabColumns = (fieldKey: string, checked: boolean) => {
        if (!activeTab) return;
        const currentColumns = activeTab.columns ?? [];
        updateTab(activeTab.id, {
            columns: checked
                ? [...new Set([...currentColumns, fieldKey])]
                : currentColumns.filter((column) => column !== fieldKey),
        });
    };

    const updateActiveQuickActions = (action: string, checked: boolean) => {
        if (!activeTab) return;
        const currentActions = activeTab.quickActions ?? [];
        updateTab(activeTab.id, {
            quickActions: checked
                ? [...new Set([...currentActions, action])]
                : currentActions.filter((item) => item !== action),
        });
    };

    const addCountChip = () => {
        if (!activeTab) return;
        const field = activeFields[0]?.key ?? "status";
        const nextChip: SmartViewCountChip = {
            id: `chip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            label: fieldLabel(activeFields, field),
            field,
            operator: "equals",
            value: "",
        };
        updateTab(activeTab.id, { countChips: [...(activeTab.countChips ?? []), nextChip] });
    };

    const updateCountChip = (chipId: string, patch: Partial<SmartViewCountChip>) => {
        if (!activeTab) return;
        updateTab(activeTab.id, {
            countChips: (activeTab.countChips ?? []).map((chip) => chip.id === chipId ? { ...chip, ...patch } : chip),
        });
    };

    const removeCountChip = (chipId: string) => {
        if (!activeTab) return;
        updateTab(activeTab.id, {
            countChips: (activeTab.countChips ?? []).filter((chip) => chip.id !== chipId),
        });
    };

    const updateChart = (patch: Partial<SmartViewChart>) => {
        if (!activeTab) return;
        updateTab(activeTab.id, {
            chart: {
                type: "none",
                metric: "count",
                field: null,
                ...(activeTab.chart ?? {}),
                ...patch,
            },
        });
    };

    const toggleSelected = (values: string[], value: string, checked: boolean) =>
        checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);

    const renderTargetMenu = (
        label: string,
        items: Array<{ id: string; name?: string; email?: string }>,
        values: string[],
        onChange: (values: string[]) => void
    ) => (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                        {values.length === 0 ? `Select ${label.toLowerCase()}` : `${values.length} selected`}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No options available</div>
                    ) : items.map((item) => (
                        <DropdownMenuCheckboxItem
                            key={item.id}
                            checked={values.includes(item.id)}
                            onCheckedChange={(checked) => onChange(toggleSelected(values, item.id, Boolean(checked)))}
                        >
                            {item.name || item.email || item.id}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title={isEditing ? "Edit Smart View" : "Create Smart View"}
            subtitle="Define tabs, record sources, filters, layout, and assignment."
            maxWidth="xl"
            actions={
                <>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={onSubmit} disabled={loading}>
                        {loading ? <Loader2 className="size-4 animate-spin" /> : isEditing ? "Update Smart View" : "Save Smart View"}
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-3">
                <div className="rounded-xl border bg-card p-3">
                    <div className="mb-3 flex items-center gap-2">
                        <Settings2 className="size-4 text-primary" />
                        <p className="text-sm font-extrabold">Smart View Setup</p>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="save-view-name">Smart View Name</Label>
                    <Input
                        id="save-view-name"
                        placeholder="Hot leads in NY"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoFocus
                    />
                    </div>
                </div>
                {canShare ? (
                    <div className="space-y-2 rounded-xl border bg-card p-3">
                        <div className="flex items-center gap-2">
                            <Users className="size-4 text-primary" />
                            <p className="text-sm font-extrabold">Visibility</p>
                        </div>
                        <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PRIVATE">Private to me</SelectItem>
                                <SelectItem value="SHARED">Shared with selected users, teams, or sales groups</SelectItem>
                                <SelectItem value="ROLE">Visible to roles</SelectItem>
                                <SelectItem value="TENANT_DEFAULT">Tenant default view</SelectItem>
                            </SelectContent>
                        </Select>
                        {scope === "SHARED" ? (
                            <div className="grid gap-3 rounded-lg border bg-surface-container-low p-3">
                                {renderTargetMenu("Users", users, sharedUserIds, setSharedUserIds)}
                                {renderTargetMenu("Teams", teams, sharedTeamIds, setSharedTeamIds)}
                                {renderTargetMenu("Sales groups", salesGroups, sharedSalesGroupIds, setSharedSalesGroupIds)}
                                <label className="flex items-start gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium">
                                    <Checkbox
                                        checked={sharedUserIds.length === 0 && sharedTeamIds.length === 0 && sharedSalesGroupIds.length === 0}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSharedUserIds([]);
                                                setSharedTeamIds([]);
                                                setSharedSalesGroupIds([]);
                                            }
                                        }}
                                    />
                                    <span>Tenant-wide when no targets are selected</span>
                                </label>
                            </div>
                        ) : null}
                        {scope === "ROLE" ? (
                            <div className="rounded-lg border bg-surface-container-low p-3">
                                {renderTargetMenu("Roles", roles, sharedRoleIds, setSharedRoleIds)}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="rounded-xl border bg-card p-3">
                        <p className="text-sm font-extrabold">Private Smart View</p>
                        <p className="mt-1 text-xs text-muted-foreground">Your role can create Smart Views for yourself. Admins can assign Smart Views to users, teams, and sales groups.</p>
                    </div>
                )}
                <div className="space-y-2 rounded-xl border bg-card p-3">
                    {canShare ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2">
                        <div>
                            <p className="text-sm font-extrabold">Default</p>
                            <p className="text-xs text-muted-foreground">Load automatically.</p>
                        </div>
                        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                    </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2">
                        <div>
                            <p className="text-sm font-extrabold">Pinned</p>
                            <p className="text-xs text-muted-foreground">Keep near the top.</p>
                        </div>
                        <Switch checked={isPinned} onCheckedChange={setIsPinned} />
                    </div>
                </div>
                </aside>
                <main className="min-w-0 rounded-xl border bg-card p-3">
                    <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                            <Layers3 className="size-4" />
                            <div>
                                <p className="text-sm font-extrabold">Smart View Tabs</p>
                                <p className="text-xs text-muted-foreground">Each tab can point to any CRM module and carry its own conditions.</p>
                            </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addTab}>
                            <Plus className="size-4" />
                            Add Tab
                        </Button>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="space-y-2 rounded-lg border bg-surface-container-low p-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTabId(tab.id)}
                                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${activeTab?.id === tab.id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent"}`}
                            >
                                <span className="block max-w-[150px] truncate font-extrabold">{tab.name || "Untitled tab"}</span>
                                <span className="text-muted-foreground">{SMART_VIEW_MODULE_OPTIONS.find((option) => option.value === tab.module)?.label}</span>
                            </button>
                        ))}
                    </div>
                    {activeTab ? (
                        <div className="min-w-0 space-y-3 rounded-lg border bg-background/80 p-3">
                            <div className="rounded-lg border bg-surface-container-low p-3">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Tab name</Label>
                                    <Input
                                        className="h-10 bg-background text-sm font-semibold"
                                        value={activeTab.name}
                                        onChange={(event) => updateTab(activeTab.id, { name: event.target.value })}
                                        placeholder="My open leads"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Module</Label>
                                    <Select
                                        value={activeTab.module}
                                        onValueChange={(value) => changeActiveTabModule(value as SmartViewModule)}
                                    >
                                        <SelectTrigger className="h-10 w-full bg-background text-sm font-semibold">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SMART_VIEW_MODULE_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="mb-0.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => removeTab(activeTab.id)}
                                    disabled={tabs.length === 1}
                                    aria-label="Remove tab"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                            </div>
                            <div className="flex flex-wrap gap-1 rounded-lg border bg-surface-container-low p-1">
                                {BUILDER_STEPS.map((step) => (
                                    <button
                                        key={step.value}
                                        type="button"
                                        onClick={() => setBuilderStep(step.value)}
                                        className={`min-w-[132px] flex-1 rounded-md px-3 py-2 text-left transition-colors ${builderStep === step.value ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
                                    >
                                        <span className="block text-sm font-extrabold">{step.label}</span>
                                        <span className="block truncate text-[0.7rem] leading-4">{step.description}</span>
                                    </button>
                                ))}
                            </div>
                            {builderStep === "filters" ? (
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-extrabold">Filter Conditions</p>
                                            <p className="text-xs text-muted-foreground">Use fields from {SMART_VIEW_MODULE_OPTIONS.find((option) => option.value === activeTab.module)?.label} only.</p>
                                        </div>
                                        <Badge variant="outline" className="rounded-md">{activeTab.filters?.conditions?.length ?? 0} filters</Badge>
                                    </div>
                                    <FilterBuilder
                                        fields={activeFields}
                                        value={activeTab.filters}
                                        onChange={(nextFilters) => updateTab(activeTab.id, { filters: nextFilters })}
                                    />
                                </div>
                            ) : null}
                            {builderStep === "layout" ? (
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Columns3 className="size-4" />
                                        <p className="text-sm font-extrabold">Columns & Layout</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3 xl:col-span-2">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Visible columns</Label>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" className="h-10 w-full justify-between bg-background text-sm">
                                                        {(activeTab.columns ?? []).length === 0 ? "Default columns" : `${activeTab.columns?.length} selected`}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                                                    {activeFields.map((field) => (
                                                        <DropdownMenuCheckboxItem
                                                            key={field.key}
                                                            checked={(activeTab.columns ?? []).includes(field.key)}
                                                            onCheckedChange={(checked) => updateActiveTabColumns(field.key, Boolean(checked))}
                                                        >
                                                            {field.label}
                                                        </DropdownMenuCheckboxItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Density</Label>
                                            <Select
                                                value={activeTab.density ?? "comfortable"}
                                                onValueChange={(value) => updateTab(activeTab.id, { density: value as SmartViewTab["density"] })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="compact">Compact</SelectItem>
                                                    <SelectItem value="comfortable">Comfortable</SelectItem>
                                                    <SelectItem value="spacious">Spacious</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Sort field</Label>
                                            <Select
                                                value={activeTab.sort?.field ?? "__none__"}
                                                onValueChange={(value) => updateTab(activeTab.id, {
                                                    sort: value === "__none__" ? null : { field: value, order: activeTab.sort?.order ?? "desc" },
                                                })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No sort</SelectItem>
                                                    {activeFields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Sort order</Label>
                                            <Select
                                                value={activeTab.sort?.order ?? "desc"}
                                                onValueChange={(value) => updateTab(activeTab.id, {
                                                    sort: { field: activeTab.sort?.field ?? activeFields[0]?.key ?? "createdAt", order: value as "asc" | "desc" },
                                                })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="asc">Ascending</SelectItem>
                                                    <SelectItem value="desc">Descending</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Group by</Label>
                                            <Select
                                                value={activeTab.groupBy ?? "__none__"}
                                                onValueChange={(value) => updateTab(activeTab.id, { groupBy: value === "__none__" ? null : value })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No grouping</SelectItem>
                                                    {activeFields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {builderStep === "insights" ? (
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="mb-4 flex items-center gap-2">
                                        <BarChart3 className="size-4" />
                                        <p className="text-sm font-extrabold">Chart / Count Summary</p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Chart</Label>
                                            <Select
                                                value={activeTab.chart?.type ?? "none"}
                                                onValueChange={(value) => updateChart({ type: value as SmartViewChart["type"] })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No chart</SelectItem>
                                                    <SelectItem value="count">Count chip</SelectItem>
                                                    <SelectItem value="bar">Bar chart</SelectItem>
                                                    <SelectItem value="donut">Donut chart</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Metric</Label>
                                            <Select
                                                value={activeTab.chart?.metric ?? "count"}
                                                onValueChange={(value) => updateChart({ metric: value as SmartViewChart["metric"] })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="count">Record count</SelectItem>
                                                    <SelectItem value="sum">Sum field</SelectItem>
                                                    <SelectItem value="average">Average field</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-3 sm:col-span-2">
                                            <Label className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">Chart field</Label>
                                            <Select
                                                value={activeTab.chart?.field ?? "__none__"}
                                                onValueChange={(value) => updateChart({ field: value === "__none__" ? null : value })}
                                            >
                                                <SelectTrigger className="h-10 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Use overall records</SelectItem>
                                                    {activeFields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="mb-4 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Tags className="size-4" />
                                            <p className="text-sm font-extrabold">Count Chips</p>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" className="bg-background" onClick={addCountChip}>
                                            <Plus className="size-4" />
                                            Add Chip
                                        </Button>
                                    </div>
                                    {(activeTab.countChips ?? []).length === 0 ? (
                                        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">No count chips configured.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {(activeTab.countChips ?? []).map((chip) => (
                                                <div key={chip.id} className="grid gap-2 rounded-lg bg-surface-container-low p-2 sm:grid-cols-[minmax(90px,0.8fr)_minmax(130px,1fr)_110px_minmax(90px,0.8fr)_auto] sm:items-center">
                                                    <Input
                                                        className="h-9 bg-background text-sm"
                                                        value={chip.label}
                                                        placeholder="Chip label"
                                                        onChange={(event) => updateCountChip(chip.id, { label: event.target.value })}
                                                    />
                                                    <Select value={chip.field} onValueChange={(value) => updateCountChip(chip.id, { field: value, label: chip.label || fieldLabel(activeFields, value) })}>
                                                        <SelectTrigger className="h-9 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {activeFields.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Select value={chip.operator} onValueChange={(value) => updateCountChip(chip.id, { operator: value as SmartViewCountChip["operator"] })}>
                                                        <SelectTrigger className="h-9 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="equals">Is</SelectItem>
                                                            <SelectItem value="not_equals">Is not</SelectItem>
                                                            <SelectItem value="contains">Contains</SelectItem>
                                                            <SelectItem value="greater_than">Greater than</SelectItem>
                                                            <SelectItem value="less_than">Less than</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {(activeFields.find((field) => field.key === chip.field)?.options ?? []).length > 0 ? (
                                                        <Select value={chip.value || "__none__"} onValueChange={(value) => updateCountChip(chip.id, { value: value === "__none__" ? "" : value })}>
                                                            <SelectTrigger className="h-9 bg-background text-sm"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="__none__">Select value</SelectItem>
                                                                {(activeFields.find((field) => field.key === chip.field)?.options ?? []).map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <Input
                                                            className="h-9 bg-background text-sm"
                                                            value={chip.value}
                                                            placeholder="Value"
                                                            onChange={(event) => updateCountChip(chip.id, { value: event.target.value })}
                                                        />
                                                    )}
                                                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCountChip(chip.id)} aria-label="Remove count chip">
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                </div>
                            ) : null}
                            {builderStep === "actions" ? (
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="mb-4 flex items-center gap-2">
                                        <Sparkles className="size-4" />
                                        <p className="text-sm font-extrabold">Quick Actions</p>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {activeQuickActions.map((action) => (
                                            <label key={action.value} className="flex min-h-10 items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent">
                                                <Checkbox
                                                    checked={(activeTab.quickActions ?? []).includes(action.value)}
                                                    onCheckedChange={(checked) => updateActiveQuickActions(action.value, Boolean(checked))}
                                                />
                                                {action.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    </div>
                </main>
            </div>
        </StandardDialog>
    );
}
