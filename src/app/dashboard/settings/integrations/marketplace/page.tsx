"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Blocks, Copy, Download, History, Info, ListTree, Package, Play, Plus, RefreshCw, RotateCw, ShieldOff, ShieldCheck, Table2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { useAskText, useConfirm } from "@/components/common/dialogs-provider";
import { AppDetailDialog, type AppDetailTarget } from "@/components/marketplace/app-detail-dialog";

type ModuleScope = "read" | "write";

type MarketplaceApp = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    webhookUrl: string | null;
    eventSubscriptions: string[];
    requestedPermissions: Record<string, ModuleScope>;
    installId: string | null;
    installStatus: string | null;
    createdAt: string;
    dailyDeliveryLimit?: number | null;
    rateLimitPerMinute?: number;
    publishStatus?: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "UNPUBLISHED" | "REJECTED";
    publishRejectedReason?: string | null;
    requiredContractVersion?: string;
    dependsOnAppIds?: string[];
    requiredModuleKeys?: string[];
    isDeprecated?: boolean;
    deprecationMessage?: string | null;
};

type AppVersion = {
    id: string;
    version: number;
    changeNotes: string | null;
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    approvedBy: string | null;
    approvedAt: string | null;
    rejectedReason: string | null;
    createdBy: string | null;
    createdAt: string;
};

type AppCompatibility = {
    requiredContractVersion: string;
    currentContractVersion: string;
    contractCompatible: boolean;
    missingDependencies: Array<{ id: string; name: string | null }>;
    missingRequiredModules: Array<{ key: string; name: string | null }>;
    compatible: boolean;
};

type CatalogApp = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    vendorName: string | null;
    ownerTenantName: string;
    screenshots: string[];
    docsUrl: string | null;
    pricingNotes: string | null;
    requestedPermissions: Record<string, ModuleScope>;
    supportedModules: string[];
    publishedAt: string;
    installId: string | null;
    installStatus: string | null;
};

const PUBLISH_STATUS_BADGE: Record<string, string> = {
    DRAFT: "border-muted bg-muted text-muted-foreground",
    PENDING_REVIEW: "border-status-warning bg-status-warning text-status-warning-foreground",
    PUBLISHED: "border-status-success bg-status-success text-status-success-foreground",
    UNPUBLISHED: "border-muted bg-muted text-muted-foreground",
    REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
};

type SyncConfig = {
    installId: string;
    syncDirection: "CRM_TO_APP" | "APP_TO_CRM" | "BIDIRECTIONAL";
    syncCadenceMinutes: number | null;
    enabledModules: string[];
    defaultOwnerId: string | null;
    conflictResolution: "CRM_WINS" | "APP_WINS" | "NEWEST_WINS";
    notifyOnFailure: boolean;
    lastSyncedAt: string | null;
    lastSyncStatus: "OK" | "FAILED" | null;
    lastSyncError: string | null;
};

type FieldMapping = {
    id: string;
    module: "leads" | "opportunities";
    crmField: string;
    appField: string;
};

type SyncRun = {
    id: string;
    status: "SUCCESS" | "FAILED";
    recordsSynced: number;
    errorMessage: string | null;
    createdAt: string;
};

const SYNC_MODULES = ["leads", "opportunities"] as const;
const MAPPABLE_FIELDS_BY_MODULE: Record<string, string[]> = {
    leads: ["name", "email", "phone", "company", "source", "status", "score", "tags", "ownerId"],
    opportunities: ["leadId", "opportunityTypeId", "stageId", "title", "amount", "expectedCloseDate", "priority", "tags", "ownerId"],
};

type AppHealth = {
    status: "OK" | "DEGRADED" | "ERROR" | "UNKNOWN";
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    queueBacklog: number;
    staleCredential: boolean;
    possibleProviderOutage: boolean;
    affectedAppCount: number;
};

type AppUsageDay = {
    date: string;
    requestCount: number;
    webhookDeliveryCount: number;
    errorCount: number;
};

type PendingPermissionChange = {
    id: string;
    appId: string;
    appName: string;
    pendingPermissions: Record<string, ModuleScope>;
    updatedAt: string;
};

const SENSITIVE_MODULES = new Set(["communications", "exports", "automations", "webhooks"]);

type AppInstall = {
    id: string;
    appId: string;
    appName: string;
    appCategory: string;
    status: string;
    requestedBy: string;
    createdAt: string;
    requestedPermissions: Record<string, ModuleScope>;
    reviewState?: "PENDING" | "REVIEWED";
    reviewComment?: string | null;
};

const PERMISSION_MODULES = ["leads", "opportunities", "activities", "tasks", "webhooks", "exports", "communications", "automations", "reports", "files"] as const;
const EVENT_TYPES = [
    "LEAD_CREATED", "LEAD_UPDATED", "OPPORTUNITY_CREATED", "OPPORTUNITY_UPDATED", "STAGE_CHANGED", "ACTIVITY_CREATED", "ACTIVITY_UPDATED",
    "TASK_CREATED", "TASK_UPDATED",
    "CASE_CREATED", "CASE_ASSIGNED", "CASE_UPDATED", "CASE_COMMENTED", "CASE_RESOLVED", "CASE_REOPENED", "CASE_STATUS_CHANGED", "CASE_SLA_WARNING", "CASE_SLA_BREACHED",
    "COMMUNICATION_SENT", "COMMUNICATION_FAILED",
] as const;
const CATEGORIES = ["CUSTOM", "PRODUCTIVITY", "COMMUNICATION", "ANALYTICS", "FINANCE", "OTHER"];

const STATUS_BADGE: Record<string, string> = {
    PENDING_APPROVAL: "border-status-warning bg-status-warning text-status-warning-foreground",
    INSTALLED: "border-status-success bg-status-success text-status-success-foreground",
    REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
    SUSPENDED: "border-status-warning bg-status-warning text-status-warning-foreground",
    UNINSTALLED: "border-muted bg-muted text-muted-foreground",
};

const DELIVERY_STATUS_BADGE: Record<string, string> = {
    PENDING: "border-status-warning bg-status-warning text-status-warning-foreground",
    SENDING: "border-status-info bg-status-info text-status-info-foreground",
    DELIVERED: "border-status-success bg-status-success text-status-success-foreground",
    FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
    CANCELLED: "border-muted bg-muted text-muted-foreground",
};

const HEALTH_STATUS_BADGE: Record<string, string> = {
    OK: "border-status-success bg-status-success text-status-success-foreground",
    DEGRADED: "border-status-warning bg-status-warning text-status-warning-foreground",
    ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
    UNKNOWN: "border-muted bg-muted text-muted-foreground",
};

type AppDelivery = {
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    httpStatus: number | null;
    latencyMs: number | null;
    error: string | null;
    createdAt: string;
    processedAt: string | null;
};

function emptyRegisterForm() {
    return {
        name: "",
        description: "",
        category: "CUSTOM",
        webhookUrl: "",
        redirectUrlsText: "",
        eventSubscriptions: [] as string[],
        permissions: {} as Record<string, ModuleScope>,
        requiredContractVersion: "1.0",
        dependsOnAppIdsText: "",
        requiredModuleKeysText: "",
    };
}

export default function MarketplacePage() {
    const confirm = useConfirm();
    const askText = useAskText();
    const marketplaceEnabled = useModuleEnabled("MARKETPLACE");
    const [apps, setApps] = useState<MarketplaceApp[]>([]);
    const [installs, setInstalls] = useState<AppInstall[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRegistering, setIsRegistering] = useState(false);
    const [form, setForm] = useState(emptyRegisterForm());
    const [saving, setSaving] = useState(false);
    const [revealedSecret, setRevealedSecret] = useState<{ appName: string; secret: string; signingSecret?: string } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [pendingChanges, setPendingChanges] = useState<PendingPermissionChange[]>([]);
    const [deliveriesFor, setDeliveriesFor] = useState<MarketplaceApp | null>(null);
    const [healthFor, setHealthFor] = useState<MarketplaceApp | null>(null);
    const [health, setHealth] = useState<AppHealth | null>(null);
    const [usage, setUsage] = useState<AppUsageDay[]>([]);
    const [loadingHealth, setLoadingHealth] = useState(false);
    const [limitDraft, setLimitDraft] = useState("");
    const [rateLimitDraft, setRateLimitDraft] = useState("");
    const [savingRateLimit, setSavingRateLimit] = useState(false);
    const [contractFor, setContractFor] = useState<MarketplaceApp | null>(null);
    const [contract, setContract] = useState<Record<string, unknown> | null>(null);
    const [loadingContract, setLoadingContract] = useState(false);
    const [versionsFor, setVersionsFor] = useState<MarketplaceApp | null>(null);
    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);
    const [togglingDeprecationId, setTogglingDeprecationId] = useState<string | null>(null);
    const [compatibilityByInstallId, setCompatibilityByInstallId] = useState<Record<string, AppCompatibility>>({});
    const [loadingCompatibilityId, setLoadingCompatibilityId] = useState<string | null>(null);
    const [actionsFor, setActionsFor] = useState<MarketplaceApp | null>(null);
    const [actions, setActions] = useState<any[]>([]);
    const [loadingActions, setLoadingActions] = useState(false);
    const [newActionForm, setNewActionForm] = useState<{ key: string; name: string; description: string; inputSchema: Array<{ key: string; label: string; type: string; required: boolean; options: string }> }>({ key: "", name: "", description: "", inputSchema: [] });
    const [savingAction, setSavingAction] = useState(false);
    const [reportsFor, setReportsFor] = useState<MarketplaceApp | null>(null);
    const [reports, setReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [newReportForm, setNewReportForm] = useState<{ key: string; name: string; description: string; cacheTtlMinutes: number; columnSchema: Array<{ key: string; label: string; type: string }> }>({ key: "", name: "", description: "", cacheTtlMinutes: 15, columnSchema: [] });
    const [savingReport, setSavingReport] = useState(false);
    const [reportDataFor, setReportDataFor] = useState<{ appId: string; key: string; name: string } | null>(null);
    const [reportData, setReportData] = useState<{ rows: any[]; columnSchema: Array<{ key: string; label: string }>; status: string; errorMessage: string | null; fetchedAt: string } | null>(null);
    const [loadingReportData, setLoadingReportData] = useState(false);
    const [testEventFor, setTestEventFor] = useState<MarketplaceApp | null>(null);
    const [testEventResult, setTestEventResult] = useState<{ request: { url: string; headers: Record<string, string>; body: string }; httpStatus: number | null; responseBody: string | null; error: string | null } | null>(null);
    const [sendingTestEvent, setSendingTestEvent] = useState(false);
    const [replayingId, setReplayingId] = useState<string | null>(null);
    const [savingLimit, setSavingLimit] = useState(false);
    const [deliveries, setDeliveries] = useState<AppDelivery[]>([]);
    const [loadingDeliveries, setLoadingDeliveries] = useState(false);
    const [catalogApps, setCatalogApps] = useState<CatalogApp[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [syncFor, setSyncFor] = useState<MarketplaceApp | null>(null);
    const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
    const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
    const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
    const [loadingSync, setLoadingSync] = useState(false);
    const [savingSyncConfig, setSavingSyncConfig] = useState(false);
    const [mappingModule, setMappingModule] = useState<"leads" | "opportunities">("leads");
    const [mappingDraft, setMappingDraft] = useState<Array<{ crmField: string; appField: string }>>([]);
    const [savingMappings, setSavingMappings] = useState(false);
    const [runningSync, setRunningSync] = useState(false);
    const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
    const [detailFor, setDetailFor] = useState<AppDetailTarget | null>(null);

    const [loadError, setLoadError] = useState(false);
    const load = () => {
        if (!marketplaceEnabled) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(false);
        setLoadingCatalog(true);
        Promise.all([
            apiFetch<MarketplaceApp[]>("/marketplace/apps"),
            apiFetch<AppInstall[]>("/marketplace/installs?status=PENDING_APPROVAL"),
            apiFetch<PendingPermissionChange[]>("/marketplace/pending-permission-changes"),
            apiFetch<CatalogApp[]>("/marketplace/catalog"),
        ])
            .then(([appsData, installsData, changesData, catalogData]) => {
                setApps(Array.isArray(appsData) ? appsData : []);
                setInstalls(Array.isArray(installsData) ? installsData : []);
                setPendingChanges(Array.isArray(changesData) ? changesData : []);
                setCatalogApps(Array.isArray(catalogData) ? catalogData : []);
            })
            .catch(() => setLoadError(true))
            .finally(() => {
                setLoading(false);
                setLoadingCatalog(false);
            });
    };

    useEffect(load, [marketplaceEnabled]);

    const requestPublish = async (app: MarketplaceApp) => {
        if (!(await confirm({ title: `Request publishing ${app.name}?`, description: "A platform admin reviews it before other workspaces can install it.", confirmLabel: "Request publishing" }))) return;
        setPublishingId(app.id);
        try {
            await apiFetch(`/marketplace/apps/${app.id}/request-publish`, { method: "POST" });
            toast.success("Publish request sent -- awaiting platform admin review");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to request publishing");
        } finally {
            setPublishingId(null);
        }
    };

    const requestInstallFromCatalog = async (app: CatalogApp) => {
        setInstallingId(app.id);
        try {
            const result = await apiFetch<{ secret: string; signingSecret: string }>(`/marketplace/catalog/${app.id}/install`, { method: "POST" });
            toast.success(`Install requested for "${app.name}" -- pending your workspace's approval`);
            setRevealedSecret({ appName: app.name, secret: result.secret, signingSecret: result.signingSecret });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to request install");
        } finally {
            setInstallingId(null);
        }
    };

    const togglePermission = (moduleKey: string, checked: boolean, scope: ModuleScope = "read") => {
        setForm((current) => {
            const next = { ...current.permissions };
            if (checked) next[moduleKey] = scope;
            else delete next[moduleKey];
            return { ...current, permissions: next };
        });
    };

    const toggleEvent = (eventType: string, checked: boolean) => {
        setForm((current) => ({
            ...current,
            eventSubscriptions: checked ? [...current.eventSubscriptions, eventType] : current.eventSubscriptions.filter((e) => e !== eventType),
        }));
    };

    const handleRegister = async () => {
        setSaving(true);
        try {
            const result = await apiFetch<{ app: MarketplaceApp; secret: string; signingSecret: string }>("/marketplace/apps", {
                method: "POST",
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || null,
                    category: form.category,
                    webhookUrl: form.webhookUrl || null,
                    redirectUrls: form.redirectUrlsText.split("\n").map((v) => v.trim()).filter(Boolean),
                    eventSubscriptions: form.eventSubscriptions,
                    requestedPermissions: form.permissions,
                    requiredContractVersion: form.requiredContractVersion || "1.0",
                    dependsOnAppIds: form.dependsOnAppIdsText.split("\n").map((v) => v.trim()).filter(Boolean),
                    requiredModuleKeys: form.requiredModuleKeysText.split("\n").map((v) => v.trim().toUpperCase()).filter(Boolean),
                }),
            });
            toast.success("App registered -- pending admin approval to install");
            setIsRegistering(false);
            setForm(emptyRegisterForm());
            setRevealedSecret({ appName: result.app.name, secret: result.secret, signingSecret: result.signingSecret });
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to register app");
        } finally {
            setSaving(false);
        }
    };

    const handleRotate = async (app: MarketplaceApp) => {
        if (!(await confirm({ title: `Rotate the API secret for ${app.name}?`, description: "A new secret is shown once. The previous one keeps working for 24 hours.", confirmLabel: "Rotate secret" }))) return;
        try {
            const result = await apiFetch<{ secret: string }>(`/marketplace/apps/${app.id}/rotate-secret`, { method: "POST" });
            toast.success("Secret rotated -- the previous secret keeps working for 24 hours");
            // Rotation only replaces the API secret; the webhook signing secret is unchanged, so its
            // value (which the endpoint also returns) isn't shown again.
            setRevealedSecret({ appName: app.name, secret: result.secret });
        } catch (error: any) {
            toast.error(error?.message || "Failed to rotate secret");
        }
    };

    const viewHealth = async (app: MarketplaceApp) => {
        setHealthFor(app);
        setLimitDraft(app.dailyDeliveryLimit ? String(app.dailyDeliveryLimit) : "");
        setRateLimitDraft(app.rateLimitPerMinute ? String(app.rateLimitPerMinute) : "");
        setLoadingHealth(true);
        try {
            const [healthData, usageData] = await Promise.all([
                apiFetch<AppHealth>(`/marketplace/apps/${app.id}/health`),
                apiFetch<AppUsageDay[]>(`/marketplace/apps/${app.id}/usage`),
            ]);
            setHealth(healthData);
            setUsage(Array.isArray(usageData) ? usageData : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load app health");
        } finally {
            setLoadingHealth(false);
        }
    };

    const saveLimit = async () => {
        if (!healthFor) return;
        setSavingLimit(true);
        try {
            const dailyDeliveryLimit = limitDraft.trim() ? Number(limitDraft) : null;
            await apiFetch(`/marketplace/apps/${healthFor.id}/limit`, { method: "PATCH", body: JSON.stringify({ dailyDeliveryLimit }) });
            toast.success("Delivery limit updated");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update delivery limit");
        } finally {
            setSavingLimit(false);
        }
    };

    const saveRateLimit = async () => {
        if (!healthFor) return;
        setSavingRateLimit(true);
        try {
            const rateLimitPerMinute = Number(rateLimitDraft) || 60;
            await apiFetch(`/marketplace/apps/${healthFor.id}/rate-limit`, { method: "PATCH", body: JSON.stringify({ rateLimitPerMinute }) });
            toast.success("Rate limit updated");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update rate limit");
        } finally {
            setSavingRateLimit(false);
        }
    };

    const viewContract = async (app: MarketplaceApp) => {
        setContractFor(app);
        setContract(null);
        setLoadingContract(true);
        try {
            const result = await apiFetch<Record<string, unknown>>(`/marketplace/apps/${app.id}/connector-contract`);
            setContract(result);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load connector contract");
        } finally {
            setLoadingContract(false);
        }
    };

    const viewVersions = async (app: MarketplaceApp) => {
        setVersionsFor(app);
        setVersions([]);
        setLoadingVersions(true);
        try {
            const result = await apiFetch<AppVersion[]>(`/marketplace/apps/${app.id}/versions`);
            setVersions(Array.isArray(result) ? result : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load version history");
        } finally {
            setLoadingVersions(false);
        }
    };

    const rollbackTo = async (version: number) => {
        if (!versionsFor) return;
        if (!(await confirm({ title: `Roll back ${versionsFor.name} to version ${version}?`, description: "This publishes a new version with that version's settings.", confirmLabel: "Roll back" }))) return;
        setRollingBackVersion(version);
        try {
            await apiFetch(`/marketplace/apps/${versionsFor.id}/rollback`, { method: "POST", body: JSON.stringify({ version }) });
            toast.success(`Rolled back to version ${version}`);
            setVersionsFor(null);
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to roll back app");
        } finally {
            setRollingBackVersion(null);
        }
    };

    const toggleDeprecation = async (app: MarketplaceApp) => {
        const isDeprecated = !app.isDeprecated;
        const message = isDeprecated ? await askText({ title: `Mark ${app.name} deprecated?`, description: "Workspaces that installed it see this message.", label: "Message for installers (optional)", defaultValue: app.deprecationMessage ?? "", confirmLabel: "Mark deprecated" }) : undefined;
        if (isDeprecated && message === null) return;
        setTogglingDeprecationId(app.id);
        try {
            await apiFetch(`/marketplace/apps/${app.id}/deprecation`, { method: "POST", body: JSON.stringify({ isDeprecated, message: message || null }) });
            toast.success(isDeprecated ? "App marked deprecated" : "App no longer marked deprecated");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update deprecation status");
        } finally {
            setTogglingDeprecationId(null);
        }
    };

    const viewSync = async (app: MarketplaceApp) => {
        if (!app.installId) return;
        setSyncFor(app);
        setSyncConfig(null);
        setFieldMappings([]);
        setSyncRuns([]);
        setDryRunResult(null);
        setLoadingSync(true);
        try {
            const [configData, mappingsData, runsData] = await Promise.all([
                apiFetch<SyncConfig>(`/marketplace/installs/${app.installId}/sync-config`),
                apiFetch<FieldMapping[]>(`/marketplace/installs/${app.installId}/field-mappings`),
                apiFetch<SyncRun[]>(`/marketplace/installs/${app.installId}/sync-runs`),
            ]);
            setSyncConfig(configData);
            setFieldMappings(Array.isArray(mappingsData) ? mappingsData : []);
            setSyncRuns(Array.isArray(runsData) ? runsData : []);
            setMappingDraft((Array.isArray(mappingsData) ? mappingsData : []).filter((m) => m.module === "leads").map((m) => ({ crmField: m.crmField, appField: m.appField })));
        } catch (error: any) {
            toast.error(error?.message || "Failed to load sync settings");
        } finally {
            setLoadingSync(false);
        }
    };

    const saveSyncConfig = async (patch: Partial<SyncConfig>) => {
        if (!syncFor?.installId) return;
        setSavingSyncConfig(true);
        try {
            const result = await apiFetch<SyncConfig>(`/marketplace/installs/${syncFor.installId}/sync-config`, { method: "PATCH", body: JSON.stringify(patch) });
            setSyncConfig(result);
            toast.success("Sync settings updated");
        } catch (error: any) {
            toast.error(error?.message || "Failed to update sync settings");
        } finally {
            setSavingSyncConfig(false);
        }
    };

    const switchMappingModule = (moduleKey: "leads" | "opportunities") => {
        setMappingModule(moduleKey);
        setMappingDraft(fieldMappings.filter((m) => m.module === moduleKey).map((m) => ({ crmField: m.crmField, appField: m.appField })));
    };

    const saveMappings = async () => {
        if (!syncFor?.installId) return;
        setSavingMappings(true);
        try {
            const result = await apiFetch<FieldMapping[]>(`/marketplace/installs/${syncFor.installId}/field-mappings`, {
                method: "PUT",
                body: JSON.stringify({ module: mappingModule, mappings: mappingDraft.filter((m) => m.crmField && m.appField.trim()) }),
            });
            setFieldMappings((current) => [...current.filter((m) => m.module !== mappingModule), ...(Array.isArray(result) ? result : [])]);
            toast.success("Field mappings saved");
        } catch (error: any) {
            toast.error(error?.message || "Failed to save field mappings");
        } finally {
            setSavingMappings(false);
        }
    };

    const runSyncNow = async () => {
        if (!syncFor?.installId) return;
        setRunningSync(true);
        try {
            await apiFetch(`/marketplace/installs/${syncFor.installId}/sync-now`, { method: "POST" });
            toast.success("Sync triggered");
            viewSync(syncFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to trigger sync");
        } finally {
            setRunningSync(false);
        }
    };

    const runDryRun = async () => {
        if (!syncFor?.installId) return;
        try {
            const result = await apiFetch<Record<string, unknown>>(`/marketplace/installs/${syncFor.installId}/sync-dry-run`, { method: "POST" });
            setDryRunResult(result);
        } catch (error: any) {
            toast.error(error?.message || "Failed to run sync preview");
        }
    };

    const sendTestEvent = async () => {
        if (!testEventFor) return;
        setSendingTestEvent(true);
        setTestEventResult(null);
        try {
            const result = await apiFetch<typeof testEventResult>(`/marketplace/apps/${testEventFor.id}/test-event`, {
                method: "POST",
                body: JSON.stringify({ eventType: testEventFor.eventSubscriptions?.[0] }),
            });
            setTestEventResult(result);
        } catch (error: any) {
            toast.error(error?.message || "Failed to send test event");
        } finally {
            setSendingTestEvent(false);
        }
    };

    const replayDelivery = async (deliveryId: string) => {
        setReplayingId(deliveryId);
        try {
            await apiFetch(`/marketplace/deliveries/${deliveryId}/replay`, { method: "POST" });
            toast.success("Delivery replayed -- a fresh attempt has been queued");
            if (deliveriesFor) viewDeliveries(deliveriesFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to replay delivery");
        } finally {
            setReplayingId(null);
        }
    };

    const viewDeliveries = async (app: MarketplaceApp) => {
        setDeliveriesFor(app);
        setLoadingDeliveries(true);
        try {
            const data = await apiFetch<AppDelivery[]>(`/marketplace/apps/${app.id}/deliveries`);
            setDeliveries(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load deliveries");
        } finally {
            setLoadingDeliveries(false);
        }
    };

    const runInstallAction = async (installId: string, action: "approve" | "reject" | "suspend" | "reinstate" | "uninstall") => {
        if (action === "uninstall" && !(await confirm({ title: "Uninstall this app?", description: "Its credential is deleted, its subscriptions stop and queued deliveries are cancelled. This can't be undone.", confirmLabel: "Uninstall", destructive: true }))) {
            return;
        }
        setBusyId(installId);
        try {
            await apiFetch(`/marketplace/installs/${installId}/${action}`, { method: "POST" });
            toast.success(`App install ${action}d`);
            load();
        } catch (error: any) {
            toast.error(error?.message || `Failed to ${action} app`);
        } finally {
            setBusyId(null);
        }
    };

    // Gap checklist Module 16's install-approval workflow, "security review"/"permission review"
    // sub-item, built per explicit user direction: a real, tracked, auditable step required
    // before Approve -- not just an approver's implicit glance at requested permissions.
    const reviewInstall = async (installId: string) => {
        const comment = await askText({ title: "Mark this install reviewed?", label: "Review comment (optional)", confirmLabel: "Mark reviewed" });
        if (comment === null) return;
        setBusyId(installId);
        try {
            await apiFetch(`/marketplace/installs/${installId}/review`, { method: "POST", body: JSON.stringify({ comment: comment || null }) });
            toast.success("Install reviewed");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to review install");
        } finally {
            setBusyId(null);
        }
    };

    const checkCompatibility = async (install: AppInstall) => {
        setLoadingCompatibilityId(install.id);
        try {
            const result = await apiFetch<AppCompatibility>(`/marketplace/apps/${install.appId}/compatibility`);
            setCompatibilityByInstallId((current) => ({ ...current, [install.id]: result }));
        } catch (error: any) {
            toast.error(error?.message || "Failed to check app compatibility");
        } finally {
            setLoadingCompatibilityId(null);
        }
    };

    const viewActions = async (app: MarketplaceApp) => {
        setActionsFor(app);
        setLoadingActions(true);
        try {
            const data = await apiFetch<any[]>(`/marketplace/apps/${app.id}/actions`);
            setActions(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load app actions");
        } finally {
            setLoadingActions(false);
        }
    };

    const createAction = async () => {
        if (!actionsFor || !newActionForm.key.trim() || !newActionForm.name.trim()) return;
        setSavingAction(true);
        try {
            await apiFetch(`/marketplace/apps/${actionsFor.id}/actions`, {
                method: "POST",
                body: JSON.stringify({
                    key: newActionForm.key.trim(),
                    name: newActionForm.name.trim(),
                    description: newActionForm.description || null,
                    inputSchema: newActionForm.inputSchema.map((field) => ({
                        key: field.key,
                        label: field.label || field.key,
                        type: field.type,
                        required: field.required,
                        options: field.type === "select" ? field.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
                    })),
                }),
            });
            toast.success("Action added");
            setNewActionForm({ key: "", name: "", description: "", inputSchema: [] });
            viewActions(actionsFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to add action");
        } finally {
            setSavingAction(false);
        }
    };

    const deleteAction = async (actionId: string) => {
        if (!actionsFor) return;
        try {
            await apiFetch(`/marketplace/apps/${actionsFor.id}/actions/${actionId}`, { method: "DELETE" });
            toast.success("Action removed");
            viewActions(actionsFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove action");
        }
    };

    const viewReports = async (app: MarketplaceApp) => {
        setReportsFor(app);
        setLoadingReports(true);
        try {
            const data = await apiFetch<any[]>(`/marketplace/apps/${app.id}/reports`);
            setReports(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load app reports");
        } finally {
            setLoadingReports(false);
        }
    };

    const createReport = async () => {
        if (!reportsFor || !newReportForm.key.trim() || !newReportForm.name.trim()) return;
        setSavingReport(true);
        try {
            await apiFetch(`/marketplace/apps/${reportsFor.id}/reports`, {
                method: "POST",
                body: JSON.stringify({
                    key: newReportForm.key.trim(),
                    name: newReportForm.name.trim(),
                    description: newReportForm.description || null,
                    cacheTtlMinutes: newReportForm.cacheTtlMinutes,
                    columnSchema: newReportForm.columnSchema,
                }),
            });
            toast.success("Report added");
            setNewReportForm({ key: "", name: "", description: "", cacheTtlMinutes: 15, columnSchema: [] });
            viewReports(reportsFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to add report");
        } finally {
            setSavingReport(false);
        }
    };

    const deleteReport = async (reportId: string) => {
        if (!reportsFor) return;
        try {
            await apiFetch(`/marketplace/apps/${reportsFor.id}/reports/${reportId}`, { method: "DELETE" });
            toast.success("Report removed");
            viewReports(reportsFor);
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove report");
        }
    };

    const viewReportData = async (appId: string, key: string, name: string, forceRefresh = false) => {
        setReportDataFor({ appId, key, name });
        setLoadingReportData(true);
        try {
            const data = await apiFetch<any>(`/marketplace/apps/${appId}/reports/data/${key}${forceRefresh ? "?refresh=true" : ""}`);
            setReportData(data);
        } catch (error: any) {
            toast.error(error?.message || "Failed to load report data");
        } finally {
            setLoadingReportData(false);
        }
    };

    const runPermissionChangeAction = async (installId: string, action: "approve-permission-change" | "reject-permission-change") => {
        setBusyId(installId);
        try {
            await apiFetch(`/marketplace/installs/${installId}/${action}`, { method: "POST" });
            toast.success(action === "approve-permission-change" ? "Permission change approved" : "Permission change rejected");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to update permission change");
        } finally {
            setBusyId(null);
        }
    };

    if (!marketplaceEnabled) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-lg font-bold">Marketplace</h1>
                    <p className="text-sm text-muted-foreground">Register and install custom apps that integrate with this workspace.</p>
                </div>
                <Alert variant="info">
                    <Package />
                    <AlertDescription>The Marketplace module is not enabled for this workspace.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader title="Marketplace" description="Manage registered apps, installation requests and available integrations." actions={
                <Button onClick={() => setIsRegistering(true)}><Plus className="size-4" />Register App</Button>
            } />
            {loadError && <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load marketplace data. <Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}

            <Tabs defaultValue="apps" hidden={loadError}>
                <TabsList>
                    <TabsTrigger value="apps">My Apps</TabsTrigger>
                    <TabsTrigger value="requests">
                        Requests
                        {(installs.length + pendingChanges.length) > 0 && (
                            <Badge variant="secondary" className="ml-1">{installs.length + pendingChanges.length}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="catalog">Catalog</TabsTrigger>
                </TabsList>

                <TabsContent value="apps" className="space-y-3">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : apps.length === 0 ? (
                        <Card className="p-6 text-center text-sm text-muted-foreground">No apps registered yet.</Card>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {apps.map((app) => (
                                    <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                        <div className="min-w-0 flex-1 basis-60 break-words">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <p className="min-w-0 max-w-full break-words text-sm font-medium">{app.name}</p>
                                                <Badge variant="outline" className={STATUS_BADGE[app.installStatus ?? ""] ?? ""}>
                                                    {app.installStatus ?? "NO INSTALL"}
                                                </Badge>
                                                <Badge variant="outline">{app.category}</Badge>
                                                <Badge variant="outline" className={PUBLISH_STATUS_BADGE[app.publishStatus ?? "DRAFT"] ?? ""}>
                                                    {app.publishStatus ?? "DRAFT"}
                                                </Badge>
                                                {app.isDeprecated && (
                                                    <Badge variant="outline" className="border-status-warning bg-status-warning text-status-warning-foreground">
                                                        Deprecated
                                                    </Badge>
                                                )}
                                            </div>
                                            {app.publishStatus === "REJECTED" && app.publishRejectedReason && (
                                                <p className="text-xs text-destructive">Publish rejected: {app.publishRejectedReason}</p>
                                            )}
                                            {app.isDeprecated && app.deprecationMessage && (
                                                <p className="text-xs text-status-warning-foreground">{app.deprecationMessage}</p>
                                            )}
                                            {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
                                            <p className="text-xs text-muted-foreground">
                                                {Object.keys(app.requestedPermissions ?? {}).length
                                                    ? Object.entries(app.requestedPermissions).map(([m, s]) => `${m} (${s})`).join(", ")
                                                    : "No module permissions requested"}
                                            </p>
                                        </div>
                                        <details className="w-full min-w-0">
                                            <summary className="cursor-pointer rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">App actions</summary>
                                            <div className="flex flex-wrap items-center gap-2 py-2">
                                            <Button variant="outline" size="sm" onClick={() => setDetailFor(app)}>
                                                <Info className="size-3.5" />
                                                Details
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => { setTestEventFor(app); setTestEventResult(null); }}>
                                                <Play className="size-3.5" />
                                                Test
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewHealth(app)}>
                                                <Activity className="size-3.5" />
                                                Health
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewDeliveries(app)}>
                                                <ListTree className="size-3.5" />
                                                Deliveries
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewContract(app)}>
                                                <Package className="size-3.5" />
                                                Contract
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewVersions(app)}>
                                                <History className="size-3.5" />
                                                Versions
                                            </Button>
                                            <Button variant="outline" size="sm" disabled={togglingDeprecationId === app.id} onClick={() => toggleDeprecation(app)}>
                                                {app.isDeprecated ? "Undeprecate" : "Deprecate"}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewActions(app)}>
                                                <Blocks className="size-3.5" />
                                                Actions
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => viewReports(app)}>
                                                <Table2 className="size-3.5" />
                                                Reports
                                            </Button>
                                            {app.installStatus === "INSTALLED" && (
                                                <Button variant="outline" size="sm" onClick={() => viewSync(app)}>
                                                    <RefreshCw className="size-3.5" />
                                                    Sync
                                                </Button>
                                            )}
                                            {(app.publishStatus ?? "DRAFT") !== "PUBLISHED" && (app.publishStatus ?? "DRAFT") !== "PENDING_REVIEW" && (
                                                <Button variant="outline" size="sm" disabled={publishingId === app.id} onClick={() => requestPublish(app)}>
                                                    <RefreshCw className="size-3.5" />
                                                    Request Publish
                                                </Button>
                                            )}
                                            {app.installStatus !== "UNINSTALLED" && (
                                                <Button variant="outline" size="sm" onClick={() => handleRotate(app)}>
                                                    <RotateCw className="size-3.5" />
                                                    Rotate Secret
                                                </Button>
                                            )}
                                            {app.installStatus === "INSTALLED" && (
                                                <Button variant="outline" size="sm" disabled={busyId === app.installId} onClick={() => app.installId && runInstallAction(app.installId, "suspend")}>
                                                    <ShieldOff className="size-3.5" />
                                                    Suspend
                                                </Button>
                                            )}
                                            {app.installStatus === "SUSPENDED" && (
                                                <Button variant="outline" size="sm" disabled={busyId === app.installId} onClick={() => app.installId && runInstallAction(app.installId, "reinstate")}>
                                                    <ShieldCheck className="size-3.5" />
                                                    Reinstate
                                                </Button>
                                            )}
                                            {(app.installStatus === "INSTALLED" || app.installStatus === "SUSPENDED") && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={busyId === app.installId}
                                                    onClick={() => app.installId && runInstallAction(app.installId, "uninstall")}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    Uninstall
                                                </Button>
                                            )}
                                            </div>
                                        </details>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="requests" className="space-y-3">
                    {pendingChanges.length > 0 && (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {pendingChanges.map((change) => (
                                    <div key={change.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                        <div>
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium">{change.appName}</p>
                                                <Badge variant="outline" className="border-status-warning bg-status-warning text-status-warning-foreground">
                                                    Permission increase requested
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                This already-installed app is requesting additional access:{" "}
                                                {Object.entries(change.pendingPermissions ?? {})
                                                    .map(([m, s]) => `${m} (${s})${SENSITIVE_MODULES.has(m) ? " ⚠" : ""}`)
                                                    .join(", ")}
                                            </p>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                            <Button variant="outline" size="sm" disabled={busyId === change.id} onClick={() => runPermissionChangeAction(change.id, "reject-permission-change")}>
                                                Reject
                                            </Button>
                                            <Button size="sm" disabled={busyId === change.id} onClick={() => runPermissionChangeAction(change.id, "approve-permission-change")}>
                                                Approve Change
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                    {installs.length === 0 ? (
                        pendingChanges.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No pending install requests.</Card>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {installs.map((install) => {
                                    const compatibility = compatibilityByInstallId[install.id];
                                    return (
                                    <div key={install.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                        <div>
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium">{install.appName}</p>
                                                <Badge variant="outline">{install.appCategory}</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Requested {formatWorkspaceRelativeTime(install.createdAt)} -- permissions:{" "}
                                                {Object.entries(install.requestedPermissions ?? {}).map(([m, s]) => `${m} (${s})`).join(", ") || "none"}
                                            </p>
                                            {compatibility && (
                                                <p className={`mt-1 text-xs ${compatibility.compatible ? "text-status-success-foreground" : "text-destructive"}`}>
                                                    {compatibility.compatible
                                                        ? `Compatible -- contract v${compatibility.currentContractVersion}, no unmet dependencies`
                                                        : [
                                                              !compatibility.contractCompatible &&
                                                                  `Requires contract v${compatibility.requiredContractVersion}, this workspace runs v${compatibility.currentContractVersion}`,
                                                              compatibility.missingDependencies.length > 0 &&
                                                                  `Missing dependency: ${compatibility.missingDependencies.map((d) => d.name ?? d.id).join(", ")}`,
                                                              (compatibility.missingRequiredModules ?? []).length > 0 &&
                                                                  `Missing required module: ${compatibility.missingRequiredModules.map((m) => m.name ?? m.key).join(", ")}`,
                                                          ].filter(Boolean).join(" -- ")}
                                                </p>
                                            )}
                                            <p className="mt-1 text-xs">
                                                {install.reviewState === "REVIEWED" ? (
                                                    <span className="text-status-success-foreground">
                                                        Reviewed{install.reviewComment ? `: "${install.reviewComment}"` : ""}
                                                    </span>
                                                ) : (
                                                    <span className="text-status-warning-foreground">Not yet reviewed -- required before approval</span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                            <Button variant="outline" size="sm" disabled={loadingCompatibilityId === install.id} onClick={() => checkCompatibility(install)}>
                                                {loadingCompatibilityId === install.id ? "Checking..." : "Check Compatibility"}
                                            </Button>
                                            <Button variant="outline" size="sm" disabled={busyId === install.id || install.reviewState === "REVIEWED"} onClick={() => reviewInstall(install.id)}>
                                                Review
                                            </Button>
                                            <Button variant="outline" size="sm" disabled={busyId === install.id} onClick={() => runInstallAction(install.id, "reject")}>
                                                Reject
                                            </Button>
                                            <Button size="sm" disabled={busyId === install.id || install.reviewState !== "REVIEWED"} onClick={() => runInstallAction(install.id, "approve")}>
                                                Approve &amp; Install
                                            </Button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="catalog" className="space-y-3">
                    {loadingCatalog ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : catalogApps.length === 0 ? (
                        <Card className="p-6 text-center text-sm text-muted-foreground">
                            No published apps yet. Apps other workspaces publish will show up here to install.
                        </Card>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <div className="divide-y">
                                {catalogApps.map((app) => (
                                    <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                        <div className="min-w-0 flex-1 basis-60 break-words">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <p className="min-w-0 max-w-full break-words text-sm font-medium">{app.name}</p>
                                                <Badge variant="outline">{app.category}</Badge>
                                                {app.installStatus && (
                                                    <Badge variant="outline" className={STATUS_BADGE[app.installStatus] ?? ""}>{app.installStatus}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">by {app.vendorName || app.ownerTenantName}</p>
                                            {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
                                            <p className="text-xs text-muted-foreground">
                                                Modules: {app.supportedModules.length ? app.supportedModules.join(", ") : "none"}
                                            </p>
                                            {app.pricingNotes && <p className="text-xs text-muted-foreground">Pricing: {app.pricingNotes}</p>}
                                            {app.docsUrl && (
                                                <a href={app.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                                                    Documentation
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                            {app.installId ? (
                                                <>
                                                    <Badge variant="secondary">Already requested</Badge>
                                                    <Button variant="outline" size="sm" onClick={() => setDetailFor(app)}>
                                                        <Info className="size-3.5" />
                                                        Details
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button size="sm" disabled={installingId === app.id} onClick={() => requestInstallFromCatalog(app)}>
                                                    <Plus className="size-3.5" />
                                                    Request Install
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            <AppDetailDialog app={detailFor} onClose={() => setDetailFor(null)} />

            <StandardDialog
                open={isRegistering}
                onClose={() => setIsRegistering(false)}
                title="Register App"
                maxWidth="md"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setIsRegistering(false)}>Cancel</Button>
                        <Button onClick={handleRegister} disabled={!form.name.trim() || saving}>{saving ? "Registering..." : "Register"}</Button>
                    </>
                }
            >
                <div className="space-y-4 py-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="marketplace-name-1">Name</Label>
                            <Input id="marketplace-name-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Internal Slack Notifier" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="marketplace-category-1">Category</Label>
                            <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                                <SelectTrigger id="marketplace-category-1" className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="marketplace-description-1">Description</Label>
                        <Textarea id="marketplace-description-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="marketplace-webhook-url-optional-1">Webhook URL (optional)</Label>
                        <Input id="marketplace-webhook-url-optional-1" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://example.com/webhooks/crm" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="marketplace-redirect-urls-one-per-line-optional-1">Redirect URLs (one per line, optional)</Label>
                        <Textarea id="marketplace-redirect-urls-one-per-line-optional-1" rows={2} value={form.redirectUrlsText} onChange={(e) => setForm({ ...form, redirectUrlsText: e.target.value })} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="marketplace-required-contract-version-1">Required Contract Version</Label>
                            <Input id="marketplace-required-contract-version-1"
                                value={form.requiredContractVersion}
                                onChange={(e) => setForm({ ...form, requiredContractVersion: e.target.value })}
                                placeholder="1.0"
                            />
                            <p className="text-xs text-muted-foreground">The connector contract version this app was built against. This workspace currently runs v1.0.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="marketplace-depends-on-app-ids-one-per-line-optional-1">Depends On App IDs (one per line, optional)</Label>
                            <Textarea id="marketplace-depends-on-app-ids-one-per-line-optional-1"
                                rows={2}
                                value={form.dependsOnAppIdsText}
                                onChange={(e) => setForm({ ...form, dependsOnAppIdsText: e.target.value })}
                                placeholder="Other MarketplaceApp IDs this app requires to already be installed"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="marketplace-required-crm-modules-one-key-per-line-optional-1">Required CRM Modules (one key per line, optional)</Label>
                        <Textarea id="marketplace-required-crm-modules-one-key-per-line-optional-1"
                            rows={2}
                            value={form.requiredModuleKeysText}
                            onChange={(e) => setForm({ ...form, requiredModuleKeysText: e.target.value })}
                            placeholder="e.g. SERVICE_DESK -- a tenant missing any of these modules is flagged incompatible at install-approval time"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Event Subscriptions</Label>
                        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {EVENT_TYPES.map((eventType) => (
                                <label key={eventType} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={form.eventSubscriptions.includes(eventType)}
                                        onCheckedChange={(checked) => toggleEvent(eventType, !!checked)}
                                    />
                                    {eventType}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="marketplace-requested-module-permissions-1">Requested Module Permissions</Label>
                        <div className="space-y-1.5">
                            {PERMISSION_MODULES.map((moduleKey) => {
                                const scope = form.permissions[moduleKey];
                                return (
                                    <div key={moduleKey} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                                            <Checkbox checked={!!scope} onCheckedChange={(checked) => togglePermission(moduleKey, !!checked)} />
                                            {moduleKey}
                                            {scope === "write" && SENSITIVE_MODULES.has(moduleKey) && (
                                                <Badge variant="outline" className="border-status-warning bg-status-warning text-xs text-status-warning-foreground">
                                                    Sensitive
                                                </Badge>
                                            )}
                                        </label>
                                        {scope && (
                                            <Select value={scope} onValueChange={(value) => togglePermission(moduleKey, true, value as ModuleScope)}>
                                                <SelectTrigger id="marketplace-requested-module-permissions-1" className="w-28"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="read">Read</SelectItem>
                                                    <SelectItem value="write">Write</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                );
                            })}
                            {Object.entries(form.permissions).some(([m, s]) => s === "write" && SENSITIVE_MODULES.has(m)) && (
                                <Alert variant="destructive">
                                    <ShieldOff />
                                    <AlertDescription>
                                        This app is requesting write access to sensitive modules. Review carefully before approving.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!actionsFor}
                onClose={() => setActionsFor(null)}
                title={`App Actions -- ${actionsFor?.name ?? ""}`}
                maxWidth="lg"
                actions={<Button variant="outline" onClick={() => setActionsFor(null)}>Close</Button>}
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-muted-foreground">
                        Actions this app exposes for other workspaces&apos; automation builders to call, gated by the &quot;automations&quot; write permission grant on each install. Every call is logged to the runtime audit log below.
                    </p>
                    {loadingActions ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                        <div className="space-y-2">
                            {actions.length === 0 && <p className="text-sm text-muted-foreground">No actions defined yet.</p>}
                            {actions.map((action) => (
                                <div key={action.id} className="rounded-lg border p-2.5">
                                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium">{action.name} <span className="text-xs text-muted-foreground">({action.key})</span></p>
                                            {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
                                            <p className="text-xs text-muted-foreground">{(action.inputSchema ?? []).length} input field(s)</p>
                                        </div>
                                        <Button variant="ghost" size="icon-sm" onClick={() => deleteAction(action.id)}>
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2 border-t pt-3">
                        <Label htmlFor="marketplace-add-action-1">Add Action</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Input id="marketplace-add-action-1" placeholder="key (e.g. send_slack_message)" value={newActionForm.key} onChange={(e) => setNewActionForm({ ...newActionForm, key: e.target.value })} />
                            <Input placeholder="Display name" value={newActionForm.name} onChange={(e) => setNewActionForm({ ...newActionForm, name: e.target.value })} />
                        </div>
                        <Textarea rows={2} placeholder="Description (optional)" value={newActionForm.description} onChange={(e) => setNewActionForm({ ...newActionForm, description: e.target.value })} />
                        <Label className="text-xs">Input Fields</Label>
                        {newActionForm.inputSchema.map((field, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-1.5">
                                <Input className="w-32" placeholder="key" value={field.key} onChange={(e) => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.map((it, i) => (i === index ? { ...it, key: e.target.value } : it)) }))} />
                                <Input className="w-32" placeholder="label" value={field.label} onChange={(e) => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.map((it, i) => (i === index ? { ...it, label: e.target.value } : it)) }))} />
                                <Select value={field.type} onValueChange={(v) => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.map((it, i) => (i === index ? { ...it, type: v } : it)) }))}>
                                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="select">Dropdown</SelectItem>
                                    </SelectContent>
                                </Select>
                                {field.type === "select" && (
                                    <Input className="w-40" placeholder="options, comma-separated" value={field.options} onChange={(e) => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.map((it, i) => (i === index ? { ...it, options: e.target.value } : it)) }))} />
                                )}
                                <label className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
                                    <Checkbox checked={field.required} onCheckedChange={(checked) => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.map((it, i) => (i === index ? { ...it, required: !!checked } : it)) }))} />
                                    Required
                                </label>
                                <Button variant="ghost" size="sm" onClick={() => setNewActionForm((f) => ({ ...f, inputSchema: f.inputSchema.filter((_, i) => i !== index) }))}>Remove</Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setNewActionForm((f) => ({ ...f, inputSchema: [...f.inputSchema, { key: "", label: "", type: "text", required: false, options: "" }] }))}>
                            <Plus className="size-3.5" />
                            Add Input Field
                        </Button>
                        <div>
                            <Button size="sm" disabled={savingAction || !newActionForm.key.trim() || !newActionForm.name.trim()} onClick={createAction}>
                                {savingAction ? "Saving..." : "Add Action"}
                            </Button>
                        </div>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!reportsFor}
                onClose={() => setReportsFor(null)}
                title={`App Reports -- ${reportsFor?.name ?? ""}`}
                maxWidth="lg"
                actions={<Button variant="outline" onClick={() => setReportsFor(null)}>Close</Button>}
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-muted-foreground">
                        Report datasets this app exposes, gated by the &quot;reports&quot; read/write permission grant on each install. Data is cached for each report&apos;s own TTL rather than fetched live on every view.
                    </p>
                    {loadingReports ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                        <div className="space-y-2">
                            {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports defined yet.</p>}
                            {reports.map((report) => (
                                <div key={report.id} className="rounded-lg border p-2.5">
                                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium">{report.name} <span className="text-xs text-muted-foreground">({report.key})</span></p>
                                            {report.description && <p className="text-xs text-muted-foreground">{report.description}</p>}
                                            <p className="text-xs text-muted-foreground">{(report.columnSchema ?? []).length} column(s) -- cached {report.cacheTtlMinutes}m</p>
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                            <Button variant="outline" size="sm" onClick={() => reportsFor && viewReportData(reportsFor.id, report.key, report.name)}>
                                                Preview Data
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" onClick={() => deleteReport(report.id)}>
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2 border-t pt-3">
                        <Label htmlFor="marketplace-add-report-1">Add Report</Label>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <Input id="marketplace-add-report-1" placeholder="key (e.g. usage_summary)" value={newReportForm.key} onChange={(e) => setNewReportForm({ ...newReportForm, key: e.target.value })} />
                            <Input placeholder="Display name" value={newReportForm.name} onChange={(e) => setNewReportForm({ ...newReportForm, name: e.target.value })} />
                            <Input type="number" placeholder="Cache TTL (minutes)" value={newReportForm.cacheTtlMinutes} onChange={(e) => setNewReportForm({ ...newReportForm, cacheTtlMinutes: Number(e.target.value) || 15 })} />
                        </div>
                        <Textarea rows={2} placeholder="Description (optional)" value={newReportForm.description} onChange={(e) => setNewReportForm({ ...newReportForm, description: e.target.value })} />
                        <Label className="text-xs">Columns</Label>
                        {newReportForm.columnSchema.map((column, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-1.5">
                                <Input className="w-32" placeholder="key" value={column.key} onChange={(e) => setNewReportForm((f) => ({ ...f, columnSchema: f.columnSchema.map((it, i) => (i === index ? { ...it, key: e.target.value } : it)) }))} />
                                <Input className="w-32" placeholder="label" value={column.label} onChange={(e) => setNewReportForm((f) => ({ ...f, columnSchema: f.columnSchema.map((it, i) => (i === index ? { ...it, label: e.target.value } : it)) }))} />
                                <Input className="w-24" placeholder="type" value={column.type} onChange={(e) => setNewReportForm((f) => ({ ...f, columnSchema: f.columnSchema.map((it, i) => (i === index ? { ...it, type: e.target.value } : it)) }))} />
                                <Button variant="ghost" size="sm" onClick={() => setNewReportForm((f) => ({ ...f, columnSchema: f.columnSchema.filter((_, i) => i !== index) }))}>Remove</Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setNewReportForm((f) => ({ ...f, columnSchema: [...f.columnSchema, { key: "", label: "", type: "text" }] }))}>
                            <Plus className="size-3.5" />
                            Add Column
                        </Button>
                        <div>
                            <Button size="sm" disabled={savingReport || !newReportForm.key.trim() || !newReportForm.name.trim()} onClick={createReport}>
                                {savingReport ? "Saving..." : "Add Report"}
                            </Button>
                        </div>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!reportDataFor}
                onClose={() => { setReportDataFor(null); setReportData(null); }}
                title={`Report Data -- ${reportDataFor?.name ?? ""}`}
                maxWidth="lg"
                actions={
                    <>
                        <Button variant="outline" onClick={() => reportDataFor && viewReportData(reportDataFor.appId, reportDataFor.key, reportDataFor.name, true)}>Refresh Now</Button>
                        <Button onClick={() => { setReportDataFor(null); setReportData(null); }}>Close</Button>
                    </>
                }
            >
                <div className="space-y-2 py-2">
                    {loadingReportData ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : reportData ? (
                        <>
                            <p className="text-xs text-muted-foreground">
                                {reportData.status === "OK" ? `Fetched ${formatWorkspaceRelativeTime(reportData.fetchedAt)}` : `Error: ${reportData.errorMessage}`}
                            </p>
                            {reportData.rows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No rows returned.</p>
                            ) : (
                                <div className="overflow-auto rounded-lg border">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted">
                                            <tr>
                                                {(reportData.columnSchema.length ? reportData.columnSchema : Object.keys(reportData.rows[0]).map((k) => ({ key: k, label: k }))).map((column) => (
                                                    <th key={column.key} className="p-2 text-left font-medium">{column.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportData.rows.map((row, index) => (
                                                <tr key={index} className="border-t">
                                                    {(reportData.columnSchema.length ? reportData.columnSchema : Object.keys(row).map((k) => ({ key: k, label: k }))).map((column) => (
                                                        <td key={column.key} className="p-2">{String(row[column.key] ?? "")}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!revealedSecret}
                onClose={() => setRevealedSecret(null)}
                title="App Credentials"
                maxWidth="sm"
                actions={<Button onClick={() => setRevealedSecret(null)}>Done</Button>}
            >
                <div className="space-y-3 py-2">
                    <Alert variant="destructive">
                        <History />
                        <AlertDescription>These secrets are shown once for &quot;{revealedSecret?.appName}&quot;. Copy them now -- they can&apos;t be retrieved again (only rotated).</AlertDescription>
                    </Alert>
                    <div className="space-y-1.5">
                        <Label>API Secret</Label>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret?.secret}</code>
                            <Button variant="outline" size="icon-sm" onClick={() => revealedSecret && navigator.clipboard.writeText(revealedSecret.secret)}>
                                <Copy className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    {revealedSecret?.signingSecret && (
                        <div className="space-y-1.5">
                            <Label>Webhook Signing Secret</Label>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{revealedSecret.signingSecret}</code>
                                <Button variant="outline" size="icon-sm" aria-label="Copy webhook signing secret" onClick={() => revealedSecret.signingSecret && navigator.clipboard.writeText(revealedSecret.signingSecret)}>
                                    <Copy className="size-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!healthFor}
                onClose={() => setHealthFor(null)}
                title={`Health & Usage -- ${healthFor?.name ?? ""}`}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setHealthFor(null)}>Close</Button>}
            >
                <div className="space-y-4 py-2">
                    {loadingHealth ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : health ? (
                        <>
                            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <Badge variant="outline" className={HEALTH_STATUS_BADGE[health.status] ?? ""}>{health.status}</Badge>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Queue Backlog</p>
                                    <p className="text-sm font-medium">{health.queueBacklog}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Last Success</p>
                                    <p className="text-sm font-medium">{health.lastSuccessAt ? formatWorkspaceRelativeTime(health.lastSuccessAt) : "Never"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Credential Age</p>
                                    <p className="text-sm font-medium">{health.staleCredential ? "Stale (90+ days)" : "Fresh"}</p>
                                </div>
                            </div>
                            {health.lastError && (
                                <Alert variant="destructive">
                                    <Activity />
                                    <AlertDescription>{health.lastError}</AlertDescription>
                                </Alert>
                            )}
                            {health.possibleProviderOutage && (
                                <Alert>
                                    <Activity />
                                    <AlertDescription>
                                        Possible provider-wide outage -- {health.affectedAppCount - 1} other app{health.affectedAppCount - 1 === 1 ? "" : "s"} on the same
                                        webhook host {health.affectedAppCount - 1 === 1 ? "is" : "are"} also failing right now. This may not be specific to this app.
                                    </AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="marketplace-daily-delivery-limit-blank-unlimited-1">Daily Delivery Limit (blank = unlimited)</Label>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Input id="marketplace-daily-delivery-limit-blank-unlimited-1" type="number" min={1} value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} placeholder="Unlimited" className="w-32" />
                                    <Button size="sm" disabled={savingLimit} onClick={saveLimit}>Save</Button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="marketplace-inbound-api-rate-limit-requests-minute-1">Inbound API Rate Limit (requests/minute)</Label>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Input id="marketplace-inbound-api-rate-limit-requests-minute-1" type="number" min={1} value={rateLimitDraft} onChange={(e) => setRateLimitDraft(e.target.value)} placeholder="60" className="w-32" />
                                    <Button size="sm" disabled={savingRateLimit} onClick={saveRateLimit}>Save</Button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Usage (last 14 days)</Label>
                                {usage.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
                                ) : (
                                    <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
                                        {usage.map((day) => (
                                            <div key={day.date} className="flex min-w-0 flex-wrap items-center justify-between rounded border px-2 py-1">
                                                <span>{day.date}</span>
                                                <span className="text-muted-foreground">
                                                    {day.webhookDeliveryCount} deliveries -- {day.errorCount} errors
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!contractFor}
                onClose={() => setContractFor(null)}
                title={`Connector Contract -- ${contractFor?.name ?? ""}`}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setContractFor(null)}>Close</Button>}
            >
                <div className="space-y-2 py-2">
                    <p className="text-xs text-muted-foreground">
                        A machine-readable spec of exactly how this app authenticates inbound requests and how it can verify webhook deliveries from this workspace -- for whoever is building the integration.
                    </p>
                    {loadingContract ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : contract ? (
                        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-3 text-xs">{JSON.stringify(contract, null, 2)}</pre>
                    ) : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!versionsFor}
                onClose={() => setVersionsFor(null)}
                title={`Version History -- ${versionsFor?.name ?? ""}`}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setVersionsFor(null)}>Close</Button>}
            >
                <div className="space-y-2 py-2">
                    <p className="text-xs text-muted-foreground">
                        Every edit publishes a new version snapshot. Rolling back republishes an older approved version&apos;s settings as a brand-new version at the tip -- it never rewinds history.
                    </p>
                    {loadingVersions ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : versions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No versions yet.</p>
                    ) : (
                        <div className="divide-y rounded-lg border">
                            {versions.map((v) => (
                                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                                    <div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium">Version {v.version}</p>
                                            <Badge variant="outline" className={v.approvalStatus === "APPROVED" ? "border-status-success bg-status-success text-status-success-foreground" : v.approvalStatus === "REJECTED" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-status-warning bg-status-warning text-status-warning-foreground"}>
                                                {v.approvalStatus}
                                            </Badge>
                                        </div>
                                        {v.changeNotes && <p className="text-xs text-muted-foreground">{v.changeNotes}</p>}
                                        {v.rejectedReason && <p className="text-xs text-destructive">Rejected: {v.rejectedReason}</p>}
                                        <p className="text-xs text-muted-foreground">{formatWorkspaceRelativeTime(v.createdAt)}</p>
                                    </div>
                                    {v.approvalStatus === "APPROVED" && (
                                        <Button variant="outline" size="sm" disabled={rollingBackVersion === v.version} onClick={() => rollbackTo(v.version)}>
                                            <History className="size-3.5" />
                                            Roll back to this
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!syncFor}
                onClose={() => setSyncFor(null)}
                title={`Sync Settings -- ${syncFor?.name ?? ""}`}
                maxWidth="lg"
                actions={<Button variant="outline" onClick={() => setSyncFor(null)}>Close</Button>}
            >
                <div className="space-y-4 py-2">
                    {loadingSync ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : syncConfig ? (
                        <>
                            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="marketplace-sync-direction-1">Sync Direction</Label>
                                    <Select value={syncConfig.syncDirection} onValueChange={(v) => saveSyncConfig({ syncDirection: v as SyncConfig["syncDirection"] })}>
                                        <SelectTrigger id="marketplace-sync-direction-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CRM_TO_APP">CRM to App</SelectItem>
                                            <SelectItem value="APP_TO_CRM">App to CRM</SelectItem>
                                            <SelectItem value="BIDIRECTIONAL">Bidirectional</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="marketplace-conflict-resolution-1">Conflict Resolution</Label>
                                    <Select value={syncConfig.conflictResolution} onValueChange={(v) => saveSyncConfig({ conflictResolution: v as SyncConfig["conflictResolution"] })}>
                                        <SelectTrigger id="marketplace-conflict-resolution-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CRM_WINS">CRM Wins</SelectItem>
                                            <SelectItem value="APP_WINS">App Wins</SelectItem>
                                            <SelectItem value="NEWEST_WINS">Newest Wins</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="marketplace-sync-cadence-minutes-blank-manual-only-1">Sync Cadence (minutes, blank = manual only)</Label>
                                    <Input id="marketplace-sync-cadence-minutes-blank-manual-only-1"
                                        type="number"
                                        min={1}
                                        defaultValue={syncConfig.syncCadenceMinutes ?? ""}
                                        onBlur={(e) => saveSyncConfig({ syncCadenceMinutes: e.target.value ? Number(e.target.value) : null })}
                                        placeholder="Manual only"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="marketplace-default-owner-user-id-optional-1">Default Owner (user ID, optional)</Label>
                                    <Input id="marketplace-default-owner-user-id-optional-1"
                                        defaultValue={syncConfig.defaultOwnerId ?? ""}
                                        onBlur={(e) => saveSyncConfig({ defaultOwnerId: e.target.value || null })}
                                        placeholder="No default owner"
                                    />
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Checkbox checked={syncConfig.notifyOnFailure} onCheckedChange={(checked) => saveSyncConfig({ notifyOnFailure: !!checked })} disabled={savingSyncConfig} />
                                <Label className="font-normal">Notify on sync failure</Label>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Enabled Modules</Label>
                                <div className="flex min-w-0 flex-wrap gap-4">
                                    {SYNC_MODULES.map((moduleKey) => (
                                        <div key={moduleKey} className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Checkbox
                                                checked={syncConfig.enabledModules.includes(moduleKey)}
                                                onCheckedChange={(checked) => {
                                                    const next = checked
                                                        ? [...syncConfig.enabledModules, moduleKey]
                                                        : syncConfig.enabledModules.filter((m) => m !== moduleKey);
                                                    saveSyncConfig({ enabledModules: next });
                                                }}
                                            />
                                            <Label className="font-normal capitalize">{moduleKey}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {syncConfig.lastSyncedAt && (
                                <Alert variant={syncConfig.lastSyncStatus === "FAILED" ? "destructive" : "default"}>
                                    <AlertDescription>
                                        Last synced {formatWorkspaceRelativeTime(syncConfig.lastSyncedAt)} -- {syncConfig.lastSyncStatus}
                                        {syncConfig.lastSyncError ? `: ${syncConfig.lastSyncError}` : ""}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2 border-t pt-3">
                                <div className="flex min-w-0 flex-wrap items-center justify-between">
                                    <Label htmlFor="marketplace-field-mappings-1">Field Mappings</Label>
                                    <Select value={mappingModule} onValueChange={(v) => switchMappingModule(v as "leads" | "opportunities")}>
                                        <SelectTrigger id="marketplace-field-mappings-1" className="w-40"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {SYNC_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {mappingDraft.map((mapping, index) => (
                                    <div key={index} className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Select value={mapping.crmField} onValueChange={(v) => setMappingDraft((d) => d.map((m, i) => (i === index ? { ...m, crmField: v } : m)))}>
                                            <SelectTrigger className="w-40"><SelectValue placeholder="CRM field" /></SelectTrigger>
                                            <SelectContent>
                                                {MAPPABLE_FIELDS_BY_MODULE[mappingModule].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-muted-foreground">maps to</span>
                                        <Input
                                            className="w-40"
                                            value={mapping.appField}
                                            onChange={(e) => setMappingDraft((d) => d.map((m, i) => (i === index ? { ...m, appField: e.target.value } : m)))}
                                            placeholder="App field name"
                                        />
                                        <Button variant="ghost" size="sm" onClick={() => setMappingDraft((d) => d.filter((_, i) => i !== index))}>Remove</Button>
                                    </div>
                                ))}
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setMappingDraft((d) => [...d, { crmField: MAPPABLE_FIELDS_BY_MODULE[mappingModule][0], appField: "" }])}>
                                        <Plus className="size-3.5" />
                                        Add Mapping
                                    </Button>
                                    <Button size="sm" disabled={savingMappings} onClick={saveMappings}>Save Mappings</Button>
                                </div>
                            </div>

                            <div className="space-y-2 border-t pt-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Button size="sm" disabled={runningSync} onClick={runSyncNow}>Sync Now</Button>
                                    <Button variant="outline" size="sm" onClick={runDryRun}>Dry Run</Button>
                                </div>
                                {dryRunResult && (
                                    <pre className="max-h-48 overflow-auto rounded-lg border bg-muted p-2 text-xs">{JSON.stringify(dryRunResult, null, 2)}</pre>
                                )}
                                <Label>Recent Runs</Label>
                                {syncRuns.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No sync runs yet.</p>
                                ) : (
                                    <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                                        {syncRuns.map((run) => (
                                            <div key={run.id} className="flex min-w-0 flex-wrap items-center justify-between rounded border px-2 py-1">
                                                <span>{formatWorkspaceRelativeTime(run.createdAt)} -- {run.recordsSynced} records</span>
                                                <Badge variant={run.status === "SUCCESS" ? "outline" : "destructive"}>{run.status}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!deliveriesFor}
                onClose={() => setDeliveriesFor(null)}
                title={`Deliveries -- ${deliveriesFor?.name ?? ""}`}
                maxWidth="md"
                actions={<Button variant="outline" onClick={() => setDeliveriesFor(null)}>Close</Button>}
            >
                <div className="space-y-2 py-2">
                    {deliveriesFor && (
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                                <a href={`/api/marketplace/apps/${deliveriesFor.id}/deliveries/export`}>
                                    <Download className="size-3.5" />
                                    Export CSV
                                </a>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                                <a href={`/api/marketplace/apps/${deliveriesFor.id}/support-bundle`}>
                                    <Download className="size-3.5" />
                                    Support Bundle
                                </a>
                            </Button>
                        </div>
                    )}
                    {loadingDeliveries ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : deliveries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No deliveries yet. This app receives a delivery whenever it&apos;s subscribed to an event that fires.</p>
                    ) : (
                        deliveries.map((delivery) => (
                            <div key={delivery.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
                                <div>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="font-medium">{delivery.eventType}</span>
                                        <Badge variant="outline" className={DELIVERY_STATUS_BADGE[delivery.status] ?? ""}>{delivery.status}</Badge>
                                        {delivery.attempts > 0 && <span className="text-muted-foreground">{delivery.attempts} attempt(s)</span>}
                                    </div>
                                    <p className="text-muted-foreground">
                                        {formatWorkspaceRelativeTime(delivery.createdAt)}
                                        {delivery.httpStatus ? ` -- HTTP ${delivery.httpStatus}` : ""}
                                        {delivery.latencyMs != null ? ` -- ${delivery.latencyMs}ms` : ""}
                                        {delivery.error ? ` -- ${delivery.error}` : ""}
                                    </p>
                                </div>
                                {["DELIVERED", "FAILED", "CANCELLED"].includes(delivery.status) && (
                                    <Button variant="outline" size="sm" disabled={replayingId === delivery.id} onClick={() => replayDelivery(delivery.id)}>
                                        <RefreshCw className="size-3.5" />
                                        Replay
                                    </Button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </StandardDialog>

            <StandardDialog
                open={!!testEventFor}
                onClose={() => setTestEventFor(null)}
                title={`Test Event -- ${testEventFor?.name ?? ""}`}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="outline" onClick={() => setTestEventFor(null)}>Close</Button>
                        <Button onClick={sendTestEvent} disabled={sendingTestEvent}>{sendingTestEvent ? "Sending..." : "Send Test Event"}</Button>
                    </>
                }
            >
                <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                        Sends a real, signed sample payload to this app&apos;s webhook URL right now (not written to the delivery
                        log) so you can confirm the endpoint and signature verification work before real events start flowing.
                    </p>
                    {testEventResult && (
                        <>
                            <Alert variant={testEventResult.error ? "destructive" : "default"}>
                                {testEventResult.error ? <ShieldOff /> : <ShieldCheck />}
                                <AlertDescription>
                                    {testEventResult.error ? testEventResult.error : `Delivered -- HTTP ${testEventResult.httpStatus}`}
                                </AlertDescription>
                            </Alert>
                            <div className="space-y-1.5">
                                <Label>Request</Label>
                                <code className="block max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-md border bg-muted px-2 py-1.5 text-xs">
                                    {`POST ${testEventResult.request.url}\n${Object.entries(testEventResult.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${testEventResult.request.body}`}
                                </code>
                            </div>
                            {testEventResult.responseBody && (
                                <div className="space-y-1.5">
                                    <Label>Response</Label>
                                    <code className="block max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-md border bg-muted px-2 py-1.5 text-xs">
                                        {testEventResult.responseBody}
                                    </code>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </StandardDialog>
        </div>
    );
}
