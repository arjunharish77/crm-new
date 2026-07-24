"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Plus, Pencil, Trash2, Trophy, Award, Target } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ConditionBuilder, type ConditionFieldOption, type CrmCondition } from "@/components/common/condition-builder";

const TRIGGER_EVENT_TYPES = [
    "LEAD_CREATED",
    "LEAD_UPDATED",
    "OPPORTUNITY_CREATED",
    "OPPORTUNITY_UPDATED",
    "STAGE_CHANGED",
    "ACTIVITY_CREATED",
    "ACTIVITY_UPDATED",
];

const POINT_PRESETS = [
    { value: "5", label: "5 - micro action" },
    { value: "10", label: "10 - standard action" },
    { value: "25", label: "25 - qualified milestone" },
    { value: "50", label: "50 - conversion milestone" },
    { value: "100", label: "100 - strategic outcome" },
];

const PRIORITY_PRESETS = [
    { value: "0", label: "0 - normal" },
    { value: "10", label: "10 - specific" },
    { value: "50", label: "50 - high priority" },
    { value: "100", label: "100 - override" },
];

const BADGE_ICON_OPTIONS = ["🏆", "🥇", "🎯", "🔥", "⭐", "🚀", "🤝", "💼"];

const BADGE_THRESHOLD_PRESETS = [
    { value: "1", label: "1 - first time" },
    { value: "5", label: "5 - starter" },
    { value: "10", label: "10 - milestone" },
    { value: "25", label: "25 - advanced" },
    { value: "50", label: "50 - elite" },
    { value: "100", label: "100 - top tier" },
];

const BADGE_WINDOW_PRESETS = [
    { value: "__all_time__", label: "All time" },
    { value: "7", label: "Rolling 7 days" },
    { value: "30", label: "Rolling 30 days" },
    { value: "90", label: "Rolling 90 days" },
    { value: "365", label: "Rolling 365 days" },
];

type GamificationRule = {
    id: string;
    name: string;
    triggerEventType: string;
    audienceScope: "INTERNAL" | "PARTNER" | "ALL";
    conditions?: { logic?: string; conditions?: CrmCondition[] };
    pointsAwarded: number;
    priority: number;
    isActive: boolean;
};

type Badge = {
    id: string;
    name: string;
    description: string | null;
    iconEmoji: string;
    audienceScope: "INTERNAL" | "PARTNER" | "ALL";
    criteriaRules: { eventType: string; threshold: number; windowDays?: number | null };
    isActive: boolean;
};

type Redemption = {
    id: string;
    userId: string;
    redemptionType: string;
    pointsRedeemed: number;
    monetaryAmount: number | null;
    thirdPartyProvider: string | null;
    thirdPartyReference: string | null;
    status: "REQUESTED" | "FULFILLED" | "FAILED";
    rewardName: string | null;
    failureReason: string | null;
    createdAt: string;
    user?: { name?: string | null; email?: string | null } | null;
};

type AudienceScope = "INTERNAL" | "PARTNER" | "ALL";
type GamificationSettings = {
    levels: Array<{ name: string; minPoints: number; color?: string }>;
    leaderboardConfig: {
        scope?: "INTERNAL" | "PARTNER" | "ALL";
        period?: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ALL_TIME";
        includePartners?: boolean;
        anonymizePartners?: boolean;
    };
    redemptionCatalog: Array<{ name: string; pointsCost: number; rewardType: "MONETARY" | "THIRD_PARTY_REWARD" | "INTERNAL_PERK"; isActive?: boolean }>;
    antiGamingRules: {
        maxPointsPerUserPerDay?: number;
        duplicateEventWindowMinutes?: number;
        requireManagerReviewAbovePoints?: number;
    };
    participantConfig: {
        mode: "ALL" | "SELECTED";
        userIds: string[];
        teamIds: string[];
        salesGroupIds: string[];
        partnerOrganizationIds: string[];
    };
};

const DEFAULT_GAMIFICATION_SETTINGS: GamificationSettings = {
    levels: [
        { name: "Rookie", minPoints: 0, color: "#64748b" },
        { name: "Builder", minPoints: 500, color: "#2563eb" },
        { name: "Closer", minPoints: 1500, color: "#16a34a" },
        { name: "Champion", minPoints: 3000, color: "#f59e0b" },
    ],
    leaderboardConfig: { scope: "INTERNAL", period: "MONTHLY", includePartners: false, anonymizePartners: true },
    redemptionCatalog: [],
    antiGamingRules: { maxPointsPerUserPerDay: 500, duplicateEventWindowMinutes: 30, requireManagerReviewAbovePoints: 1000 },
    participantConfig: { mode: "ALL", userIds: [], teamIds: [], salesGroupIds: [], partnerOrganizationIds: [] },
};

type TargetOption = { id: string; name?: string | null; email?: string | null; legalBusinessName?: string | null; partnerOrganizationId?: string | null; user?: { name?: string | null; email?: string | null } | null };

const emptyRuleForm: { name: string; triggerEventType: string; audienceScope: AudienceScope; conditions: CrmCondition[]; conditionLogic: "AND" | "OR"; pointsAwarded: number; priority: number; isActive: boolean } = {
    name: "",
    triggerEventType: "LEAD_CREATED",
    audienceScope: "ALL",
    conditions: [],
    conditionLogic: "AND",
    pointsAwarded: 10,
    priority: 0,
    isActive: true,
};
const emptyBadgeForm: { name: string; description: string; iconEmoji: string; audienceScope: AudienceScope; eventType: string; threshold: number; windowDays: string | number; isActive: boolean } = {
    name: "",
    description: "",
    iconEmoji: "🏆",
    audienceScope: "ALL",
    eventType: "LEAD_CREATED",
    threshold: 10,
    windowDays: "",
    isActive: true,
};

export default function GamificationSettingsPage() {
    const [rules, setRules] = useState<GamificationRule[]>([]);
    const [badges, setBadges] = useState<Badge[]>([]);
    const [settings, setSettings] = useState<GamificationSettings>(DEFAULT_GAMIFICATION_SETTINGS);
    const [savingSettings, setSavingSettings] = useState(false);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [reviewingRedemptionId, setReviewingRedemptionId] = useState<string | null>(null);
    const [partners, setPartners] = useState<any[]>([]);
    const [users, setUsers] = useState<TargetOption[]>([]);
    const [teams, setTeams] = useState<TargetOption[]>([]);
    const [salesGroups, setSalesGroups] = useState<TargetOption[]>([]);
    const [partnerOrgs, setPartnerOrgs] = useState<TargetOption[]>([]);
    const [opportunityTypes, setOpportunityTypes] = useState<any[]>([]);
    const [activityTypes, setActivityTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<GamificationRule | null>(null);
    const [ruleForm, setRuleForm] = useState(emptyRuleForm);

    const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
    const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
    const [badgeForm, setBadgeForm] = useState(emptyBadgeForm);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesData, badgesData, settingsData, redemptionsData, partnersData, typesData, activityTypesData, usersData, teamsData, salesGroupsData] = await Promise.all([
                apiFetch<GamificationRule[]>("/gamification-rules"),
                apiFetch<Badge[]>("/badges"),
                apiFetch<Partial<GamificationSettings> | null>("/gamification-settings").catch(() => null),
                apiFetch<Redemption[]>("/gamification-redemptions").catch(() => []),
                apiFetch<any[]>("/partners").catch(() => []),
                apiFetch<any[]>("/opportunity-types").catch(() => []),
                apiFetch<any[]>("/activity-types").catch(() => []),
                apiFetch<TargetOption[]>("/users").catch(() => []),
                apiFetch<TargetOption[]>("/teams").catch(() => []),
                apiFetch<TargetOption[]>("/sales-groups").catch(() => []),
            ]);
            setRules(Array.isArray(rulesData) ? rulesData : []);
            setBadges(Array.isArray(badgesData) ? badgesData : []);
            if (settingsData) setSettings((current) => ({ ...current, ...settingsData }));
            setRedemptions(Array.isArray(redemptionsData) ? redemptionsData : []);
            setPartners(Array.isArray(partnersData) ? partnersData : []);
            setOpportunityTypes(Array.isArray(typesData) ? typesData : []);
            setActivityTypes(Array.isArray(activityTypesData) ? activityTypesData : []);
            setUsers(Array.isArray(usersData) ? usersData : []);
            setTeams(Array.isArray(teamsData) ? teamsData : []);
            setSalesGroups(Array.isArray(salesGroupsData) ? salesGroupsData : []);
            const orgMap = new Map<string, TargetOption>();
            for (const partner of Array.isArray(partnersData) ? partnersData : []) {
                const orgId = partner.partnerOrganizationId;
                if (orgId) orgMap.set(orgId, { id: orgId, name: partner.legalBusinessName ?? partner.user?.name ?? orgId });
            }
            setPartnerOrgs([...orgMap.values()]);
        } catch {
            toast.error("Failed to load gamification settings");
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const saved = await apiFetch<GamificationSettings>("/gamification-settings", {
                method: "PUT",
                body: JSON.stringify(settings),
            });
            setSettings((current) => ({ ...current, ...saved }));
            toast.success("Gamification settings saved");
        } catch (error: any) {
            toast.error(error.message || "Failed to save gamification settings");
        } finally {
            setSavingSettings(false);
        }
    };

    const handleReviewRedemption = async (redemption: Redemption, status: "FULFILLED" | "FAILED") => {
        const failureReason = status === "FAILED" ? window.prompt("Reason for failing this redemption?", "Unable to fulfill reward") : "";
        if (status === "FAILED" && failureReason === null) return;
        const thirdPartyReference = status === "FULFILLED" ? window.prompt("Fulfillment/reference code (optional)", "") : "";
        if (status === "FULFILLED" && thirdPartyReference === null) return;

        setReviewingRedemptionId(redemption.id);
        try {
            await apiFetch(`/gamification-redemptions/${redemption.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status, thirdPartyReference, failureReason }),
            });
            toast.success(status === "FULFILLED" ? "Redemption fulfilled" : "Redemption failed and points refunded");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to update redemption");
        } finally {
            setReviewingRedemptionId(null);
        }
    };

    const toggleParticipantTarget = (
        key: "userIds" | "teamIds" | "salesGroupIds" | "partnerOrganizationIds",
        id: string,
        checked: boolean
    ) => {
        setSettings((current) => {
            const existing = current.participantConfig?.[key] ?? [];
            return {
                ...current,
                participantConfig: {
                    ...(current.participantConfig ?? DEFAULT_GAMIFICATION_SETTINGS.participantConfig),
                    mode: "SELECTED",
                    [key]: checked ? [...new Set([...existing, id])] : existing.filter((value) => value !== id),
                },
            };
        });
    };

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const openCreateRule = () => {
        setEditingRule(null);
        setRuleForm(emptyRuleForm);
        setRuleDialogOpen(true);
    };
    const openEditRule = (rule: GamificationRule) => {
        setEditingRule(rule);
        setRuleForm({
            name: rule.name,
            triggerEventType: rule.triggerEventType,
            audienceScope: rule.audienceScope,
            conditions: rule.conditions?.conditions ?? [],
            conditionLogic: (rule.conditions?.logic === "OR" ? "OR" : "AND") as "AND" | "OR",
            pointsAwarded: rule.pointsAwarded,
            priority: rule.priority,
            isActive: rule.isActive,
        });
        setRuleDialogOpen(true);
    };

    const handleSaveRule = async () => {
        try {
            const { conditionLogic, conditions, ...rulePayload } = ruleForm;
            const payload = {
                ...rulePayload,
                conditions: conditions.length > 0
                    ? { logic: conditionLogic, conditions }
                    : {},
            };
            if (editingRule) {
                await apiFetch(`/gamification-rules/${editingRule.id}`, { method: "PATCH", body: JSON.stringify(payload) });
                toast.success("Rule updated");
            } else {
                await apiFetch("/gamification-rules", { method: "POST", body: JSON.stringify(payload) });
                toast.success("Rule created");
            }
            setRuleDialogOpen(false);
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to save rule");
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm("Delete this gamification rule?")) return;
        try {
            await apiFetch(`/gamification-rules/${id}`, { method: "DELETE" });
            toast.success("Rule deleted");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete rule");
        }
    };

    const openCreateBadge = () => {
        setEditingBadge(null);
        setBadgeForm(emptyBadgeForm);
        setBadgeDialogOpen(true);
    };
    const openEditBadge = (badge: Badge) => {
        setEditingBadge(badge);
        setBadgeForm({
            name: badge.name,
            description: badge.description ?? "",
            iconEmoji: badge.iconEmoji,
            audienceScope: badge.audienceScope,
            eventType: badge.criteriaRules.eventType,
            threshold: badge.criteriaRules.threshold,
            windowDays: badge.criteriaRules.windowDays ?? "",
            isActive: badge.isActive,
        });
        setBadgeDialogOpen(true);
    };

    const handleSaveBadge = async () => {
        try {
            const payload = {
                name: badgeForm.name,
                description: badgeForm.description || null,
                iconEmoji: badgeForm.iconEmoji || "🏆",
                audienceScope: badgeForm.audienceScope,
                isActive: badgeForm.isActive,
                criteriaRules: {
                    eventType: badgeForm.eventType,
                    threshold: Number(badgeForm.threshold),
                    windowDays: badgeForm.windowDays ? Number(badgeForm.windowDays) : null,
                },
            };
            if (editingBadge) {
                await apiFetch(`/badges/${editingBadge.id}`, { method: "PATCH", body: JSON.stringify(payload) });
                toast.success("Badge updated");
            } else {
                await apiFetch("/badges", { method: "POST", body: JSON.stringify(payload) });
                toast.success("Badge created");
            }
            setBadgeDialogOpen(false);
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to save badge");
        }
    };

    const handleDeleteBadge = async (id: string) => {
        if (!confirm("Delete this badge?")) return;
        try {
            await apiFetch(`/badges/${id}`, { method: "DELETE" });
            toast.success("Badge deleted");
            fetchAll();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete badge");
        }
    };
    const updateLevel = (index: number, patch: Partial<GamificationSettings["levels"][number]>) => {
        setSettings((current) => ({
            ...current,
            levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level),
        }));
    };
    const addLevel = () => {
        setSettings((current) => ({
            ...current,
            levels: [...current.levels, { name: "New Level", minPoints: 0, color: "#2563eb" }],
        }));
    };
    const updateRedemption = (index: number, patch: Partial<GamificationSettings["redemptionCatalog"][number]>) => {
        setSettings((current) => ({
            ...current,
            redemptionCatalog: current.redemptionCatalog.map((reward, rewardIndex) => rewardIndex === index ? { ...reward, ...patch } : reward),
        }));
    };
    const stageOptions = opportunityTypes.flatMap((type) => (type.stages ?? []).map((stage: any) => ({ value: stage.id, label: `${type.name}: ${stage.name}` })));
    const conditionFields: ConditionFieldOption[] = [
        { key: "lead.source", label: "Lead: Source", type: "select", options: ["Partner", "Google Ads", "Website", "Referral", "Direct", "Portal", "FORM"] },
        { key: "lead.status", label: "Lead: Status", type: "select", options: ["NEW", "QUALIFIED", "LOST", "WON"] },
        { key: "lead.score", label: "Lead: Score", type: "number" },
        { key: "lead.ownerId", label: "Lead: Owner / Partner", type: "select", options: partners.map((partner) => ({ value: partner.userId, label: partner.legalBusinessName })) },
        { key: "opportunity.amount", label: "Opportunity: Amount", type: "number" },
        { key: "opportunity.stageId", label: "Opportunity: Stage", type: "select", options: stageOptions },
        { key: "opportunity.priority", label: "Opportunity: Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH"] },
        { key: "opportunity.opportunityTypeId", label: "Opportunity: Product", type: "select", options: opportunityTypes.map((type) => ({ value: type.id, label: type.name })) },
        { key: "activity.typeId", label: "Activity: Type", type: "select", options: activityTypes.map((type) => ({ value: type.id, label: type.name })) },
        { key: "activity.outcome", label: "Activity: Outcome", type: "select", options: ["SUCCESS", "FAILED", "NO_ANSWER", "FOLLOW_UP", "INTERESTED", "NOT_INTERESTED"] },
        { key: "activity.completedAt", label: "Activity: Completed Date", type: "date" },
        { key: "createdAt", label: "Record Created Date", type: "date" },
        { key: "ownerId", label: "Record Owner", type: "select", options: partners.map((partner) => ({ value: partner.userId, label: partner.legalBusinessName })) },
    ];

    return (
        <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <h1 className="text-lg font-extrabold tracking-tight">Gamification</h1>
            <p className="mt-1 text-xs text-muted-foreground">
                Point rules award points when their trigger event and audience match — every matching rule fires (they
                stack). Badges count points-ledger entries for a trigger event against a threshold, optionally within a
                rolling window.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                        <Award className="size-4 text-primary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground">Active Rules</span>
                    </div>
                    <div className="mt-2 text-2xl font-extrabold">{rules.filter((rule) => rule.isActive).length}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                        <Trophy className="size-4 text-tertiary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground">Active Badges</span>
                    </div>
                    <div className="mt-2 text-2xl font-extrabold">{badges.filter((badge) => badge.isActive).length}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                        <Target className="size-4 text-secondary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground">Conditional Rules</span>
                    </div>
                    <div className="mt-2 text-2xl font-extrabold">
                        {rules.filter((rule) => rule.conditions?.conditions?.length).length}
                    </div>
                </div>
            </div>

            <Tabs defaultValue="rules" className="mt-4 space-y-4">
                <div className="overflow-x-auto pb-1">
                    <TabsList className="h-10 min-w-max">
                        <TabsTrigger value="rules">Point Rules</TabsTrigger>
                        <TabsTrigger value="badges">Badges</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                        <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="settings">
            <div className="rounded-xl border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold">Advanced Gamification Settings</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Configure levels, leaderboard behavior, redemption catalog, and anti-gaming caps.
                        </p>
                    </div>
                    <Button onClick={handleSaveSettings} disabled={savingSettings}>
                        {savingSettings ? "Saving..." : "Save Settings"}
                    </Button>
                </div>

                <Tabs defaultValue="levels" className="space-y-4">
                    <div className="overflow-x-auto pb-1">
                        <TabsList className="h-10 min-w-max">
                            <TabsTrigger value="levels">Levels</TabsTrigger>
                            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                            <TabsTrigger value="rewards">Rewards</TabsTrigger>
                            <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
                            <TabsTrigger value="participants">Participants</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="levels">
                    <div className="space-y-3 rounded-xl border bg-surface-container-low p-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Levels</Label>
                            <Button variant="outline" size="sm" onClick={addLevel}>
                                <Plus className="size-4" />
                                Add Level
                            </Button>
                        </div>
                        {settings.levels.map((level, index) => (
                            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px_96px_auto]">
                                <Input value={level.name} onChange={(e) => updateLevel(index, { name: e.target.value })} />
                                <Input type="number" value={level.minPoints} onChange={(e) => updateLevel(index, { minPoints: Number(e.target.value) || 0 })} />
                                <Input value={level.color ?? ""} onChange={(e) => updateLevel(index, { color: e.target.value })} />
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setSettings((current) => ({ ...current, levels: current.levels.filter((_, levelIndex) => levelIndex !== index) }))}
                                    aria-label="Remove level"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    </TabsContent>

                    <TabsContent value="leaderboard">
                    <div className="space-y-3 rounded-xl border bg-surface-container-low p-3">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Leaderboard</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Scope</Label>
                                <Select
                                    value={settings.leaderboardConfig.scope ?? "INTERNAL"}
                                    onValueChange={(value) => setSettings((current) => ({
                                        ...current,
                                        leaderboardConfig: { ...current.leaderboardConfig, scope: value as any },
                                    }))}
                                >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="INTERNAL">Internal only</SelectItem>
                                        <SelectItem value="PARTNER">Partners only</SelectItem>
                                        <SelectItem value="ALL">All users</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Period</Label>
                                <Select
                                    value={settings.leaderboardConfig.period ?? "MONTHLY"}
                                    onValueChange={(value) => setSettings((current) => ({
                                        ...current,
                                        leaderboardConfig: { ...current.leaderboardConfig, period: value as any },
                                    }))}
                                >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                                        <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                                        <SelectItem value="ALL_TIME">All time</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm font-semibold">
                                Include partners
                                <Switch
                                    checked={!!settings.leaderboardConfig.includePartners}
                                    onCheckedChange={(checked) => setSettings((current) => ({
                                        ...current,
                                        leaderboardConfig: { ...current.leaderboardConfig, includePartners: checked },
                                    }))}
                                />
                            </label>
                            <label className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm font-semibold">
                                Anonymize partners
                                <Switch
                                    checked={!!settings.leaderboardConfig.anonymizePartners}
                                    onCheckedChange={(checked) => setSettings((current) => ({
                                        ...current,
                                        leaderboardConfig: { ...current.leaderboardConfig, anonymizePartners: checked },
                                    }))}
                                />
                            </label>
                        </div>
                    </div>
                    </TabsContent>

                    <TabsContent value="rewards">
                    <div className="space-y-3 rounded-xl border bg-surface-container-low p-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Reward Catalog</Label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSettings((current) => ({
                                    ...current,
                                    redemptionCatalog: [...current.redemptionCatalog, { name: "New Reward", pointsCost: 100, rewardType: "INTERNAL_PERK", isActive: true }],
                                }))}
                            >
                                <Plus className="size-4" />
                                Add Reward
                            </Button>
                        </div>
                        {settings.redemptionCatalog.length === 0 ? (
                            <p className="rounded-lg border border-dashed bg-card p-3 text-xs text-muted-foreground">No rewards configured.</p>
                        ) : settings.redemptionCatalog.map((reward, index) => (
                            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_150px_auto]">
                                <Input value={reward.name} onChange={(e) => updateRedemption(index, { name: e.target.value })} />
                                <Input type="number" value={reward.pointsCost} onChange={(e) => updateRedemption(index, { pointsCost: Number(e.target.value) || 0 })} />
                                <Select value={reward.rewardType} onValueChange={(value) => updateRedemption(index, { rewardType: value as any })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="INTERNAL_PERK">Internal perk</SelectItem>
                                        <SelectItem value="MONETARY">Monetary</SelectItem>
                                        <SelectItem value="THIRD_PARTY_REWARD">Third-party reward</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setSettings((current) => ({ ...current, redemptionCatalog: current.redemptionCatalog.filter((_, rewardIndex) => rewardIndex !== index) }))}
                                    aria-label="Remove reward"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    </TabsContent>

                    <TabsContent value="guardrails">
                    <div className="space-y-3 rounded-xl border bg-surface-container-low p-3">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Anti-Gaming Rules</Label>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Daily Cap</Label>
                                <Input
                                    type="number"
                                    value={settings.antiGamingRules.maxPointsPerUserPerDay ?? 0}
                                    onChange={(e) => setSettings((current) => ({
                                        ...current,
                                        antiGamingRules: { ...current.antiGamingRules, maxPointsPerUserPerDay: Number(e.target.value) || 0 },
                                    }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Duplicate Window</Label>
                                <Input
                                    type="number"
                                    value={settings.antiGamingRules.duplicateEventWindowMinutes ?? 0}
                                    onChange={(e) => setSettings((current) => ({
                                        ...current,
                                        antiGamingRules: { ...current.antiGamingRules, duplicateEventWindowMinutes: Number(e.target.value) || 0 },
                                    }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Review Above</Label>
                                <Input
                                    type="number"
                                    value={settings.antiGamingRules.requireManagerReviewAbovePoints ?? 0}
                                    onChange={(e) => setSettings((current) => ({
                                        ...current,
                                        antiGamingRules: { ...current.antiGamingRules, requireManagerReviewAbovePoints: Number(e.target.value) || 0 },
                                    }))}
                                />
                            </div>
                        </div>
                    </div>
                    </TabsContent>

                    <TabsContent value="participants">
                    <div className="space-y-3 rounded-xl border bg-surface-container-low p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <Label className="text-xs font-bold uppercase text-muted-foreground">Participants</Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Select who can earn points, appear on leaderboards, and redeem rewards.
                                </p>
                            </div>
                            <Select
                                value={settings.participantConfig?.mode ?? "ALL"}
                                onValueChange={(value) => setSettings((current) => ({
                                    ...current,
                                    participantConfig: { ...(current.participantConfig ?? DEFAULT_GAMIFICATION_SETTINGS.participantConfig), mode: value as "ALL" | "SELECTED" },
                                }))}
                            >
                                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All eligible users</SelectItem>
                                    <SelectItem value="SELECTED">Selected users, teams, groups, and partner orgs</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {settings.participantConfig?.mode === "SELECTED" ? (
                            <div className="grid gap-3 lg:grid-cols-4">
                                <TargetChecklist title="Users" items={users} selected={settings.participantConfig.userIds} onToggle={(id, checked) => toggleParticipantTarget("userIds", id, checked)} />
                                <TargetChecklist title="Teams" items={teams} selected={settings.participantConfig.teamIds} onToggle={(id, checked) => toggleParticipantTarget("teamIds", id, checked)} />
                                <TargetChecklist title="Sales Groups" items={salesGroups} selected={settings.participantConfig.salesGroupIds} onToggle={(id, checked) => toggleParticipantTarget("salesGroupIds", id, checked)} />
                                <TargetChecklist title="Partner Organizations" items={partnerOrgs} selected={settings.participantConfig.partnerOrganizationIds} onToggle={(id, checked) => toggleParticipantTarget("partnerOrganizationIds", id, checked)} />
                            </div>
                        ) : null}
                    </div>
                    </TabsContent>
                </Tabs>
            </div>
                </TabsContent>

                <TabsContent value="redemptions">
            <div className="rounded-xl border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold">Redemption Queue</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Review reward requests. Failed requests automatically refund reserved points.
                        </p>
                    </div>
                    <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                        {redemptions.filter((redemption) => redemption.status === "REQUESTED").length} pending
                    </Badge>
                </div>
                {redemptions.length === 0 ? (
                    <p className="rounded-lg border border-dashed bg-surface-container-low p-3 text-xs text-muted-foreground">
                        No redemption requests yet.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {redemptions.slice(0, 12).map((redemption) => (
                            <div key={redemption.id} className="rounded-xl border bg-surface-container-low p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold">{redemption.rewardName ?? redemption.redemptionType}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {redemption.user?.name ?? redemption.user?.email ?? redemption.userId} · {redemption.pointsRedeemed.toLocaleString()} pts
                                        </p>
                                        {redemption.failureReason ? (
                                            <p className="text-xs text-destructive">{redemption.failureReason}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                            {redemption.status}
                                        </Badge>
                                        {redemption.status === "REQUESTED" ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={reviewingRedemptionId === redemption.id}
                                                    onClick={() => handleReviewRedemption(redemption, "FAILED")}
                                                >
                                                    Fail & Refund
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={reviewingRedemptionId === redemption.id}
                                                    onClick={() => handleReviewRedemption(redemption, "FULFILLED")}
                                                >
                                                    Fulfill
                                                </Button>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </TabsContent>

                <TabsContent value="rules">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Point Rules</h2>
                <Button size="sm" onClick={openCreateRule}>
                    <Plus className="size-4" />
                    Add Rule
                </Button>
            </div>
            {loading ? (
                <TableSkeleton rows={3} columns={3} />
            ) : rules.length === 0 ? (
                <EmptyState title="No point rules yet" description="Add a rule to start awarding points on CRM events." />
            ) : (
                <div className="space-y-2">
                    {rules.map((rule) => (
                        <div key={rule.id} className="rounded-xl border bg-card p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-bold">{rule.name}</span>
                                    <Badge variant="outline" className="rounded-md text-[0.6rem] font-semibold">
                                        {rule.triggerEventType}
                                    </Badge>
                                    <Badge variant="outline" className="rounded-md text-[0.6rem] font-semibold">
                                        {rule.audienceScope}
                                    </Badge>
                                    {rule.conditions?.conditions?.length ? (
                                        <Badge variant="outline" className="rounded-md text-[0.6rem] font-semibold">
                                            {rule.conditions.conditions.length} condition(s)
                                        </Badge>
                                    ) : null}
                                    {!rule.isActive && (
                                        <Badge variant="secondary" className="rounded-md text-[0.6rem] font-semibold">
                                            inactive
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-bold">+{rule.pointsAwarded} pts</span>
                                    <Button variant="ghost" size="icon-sm" onClick={() => openEditRule(rule)} aria-label={`Edit ${rule.name}`}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteRule(rule.id)} aria-label={`Delete ${rule.name}`}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
                </TabsContent>

                <TabsContent value="badges">

            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Badges</h2>
                <Button size="sm" onClick={openCreateBadge}>
                    <Plus className="size-4" />
                    Add Badge
                </Button>
            </div>
            {loading ? (
                <TableSkeleton rows={3} columns={3} />
            ) : badges.length === 0 ? (
                <EmptyState title="No badges yet" description="Add a milestone badge, e.g. '10 conversions in a month'." />
            ) : (
                <div className="space-y-2">
                    {badges.map((badge) => (
                        <div key={badge.id} className="rounded-xl border bg-card p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl leading-none">{badge.iconEmoji}</span>
                                    <div>
                                        <div className="text-sm font-bold">{badge.name}</div>
                                        <p className="text-xs text-muted-foreground">
                                            {badge.criteriaRules.threshold}× {badge.criteriaRules.eventType}
                                            {badge.criteriaRules.windowDays ? ` within ${badge.criteriaRules.windowDays}d` : " (all-time)"}
                                            {" · "}{badge.audienceScope}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon-sm" onClick={() => openEditBadge(badge)} aria-label={`Edit ${badge.name}`}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteBadge(badge.id)} aria-label={`Delete ${badge.name}`}>
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
                </TabsContent>
            </Tabs>

            <StandardDialog
                open={ruleDialogOpen}
                onClose={() => setRuleDialogOpen(false)}
                title={editingRule ? "Edit Point Rule" : "Add Point Rule"}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveRule} disabled={!ruleForm.name}>Save</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Trigger Event</Label>
                        <Select value={ruleForm.triggerEventType} onValueChange={(v) => setRuleForm((f) => ({ ...f, triggerEventType: v }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRIGGER_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Audience</Label>
                        <Select value={ruleForm.audienceScope} onValueChange={(v) => setRuleForm((f) => ({ ...f, audienceScope: v as AudienceScope }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Everyone</SelectItem>
                                <SelectItem value="INTERNAL">Internal reps only</SelectItem>
                                <SelectItem value="PARTNER">Partners only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Points Preset</Label>
                            <Select
                                value={POINT_PRESETS.some((preset) => Number(preset.value) === ruleForm.pointsAwarded) ? String(ruleForm.pointsAwarded) : "__custom__"}
                                onValueChange={(value) => {
                                    if (value !== "__custom__") setRuleForm((f) => ({ ...f, pointsAwarded: Number(value) }));
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {POINT_PRESETS.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Custom value</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Priority Preset</Label>
                            <Select
                                value={PRIORITY_PRESETS.some((preset) => Number(preset.value) === ruleForm.priority) ? String(ruleForm.priority) : "__custom__"}
                                onValueChange={(value) => {
                                    if (value !== "__custom__") setRuleForm((f) => ({ ...f, priority: Number(value) }));
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PRIORITY_PRESETS.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Custom value</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Custom Points</Label>
                            <Input type="number" value={ruleForm.pointsAwarded} onChange={(e) => setRuleForm((f) => ({ ...f, pointsAwarded: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Custom Priority</Label>
                            <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm((f) => ({ ...f, priority: Number(e.target.value) }))} />
                        </div>
                    </div>
                    <ConditionBuilder
                        title="Award Conditions"
                        description="Optional CRM filters. All selected values are dropdown-backed wherever the app knows the possible values."
                        fields={conditionFields}
                        conditions={ruleForm.conditions}
                        logic={ruleForm.conditionLogic}
                        onLogicChange={(conditionLogic) => setRuleForm((f) => ({ ...f, conditionLogic }))}
                        onChange={(conditions) => setRuleForm((f) => ({ ...f, conditions }))}
                    />
                    <div className="flex items-center gap-2">
                        <Switch checked={ruleForm.isActive} onCheckedChange={(checked) => setRuleForm((f) => ({ ...f, isActive: checked }))} id="rule-active" />
                        <Label htmlFor="rule-active">Active</Label>
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog
                open={badgeDialogOpen}
                onClose={() => setBadgeDialogOpen(false)}
                title={editingBadge ? "Edit Badge" : "Add Badge"}
                maxWidth="xs"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setBadgeDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveBadge} disabled={!badgeForm.name}>Save</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-36 space-y-2">
                            <Label>Icon</Label>
                            <Select value={badgeForm.iconEmoji} onValueChange={(value) => setBadgeForm((f) => ({ ...f, iconEmoji: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BADGE_ICON_OPTIONS.map((icon) => (
                                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label>Name</Label>
                            <Input value={badgeForm.name} onChange={(e) => setBadgeForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input value={badgeForm.description} onChange={(e) => setBadgeForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Counts Trigger Event</Label>
                        <Select value={badgeForm.eventType} onValueChange={(v) => setBadgeForm((f) => ({ ...f, eventType: v }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRIGGER_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Counts EARNED points-ledger entries for this event — make sure a Point Rule above awards points
                        on it, or this badge will never accumulate.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Threshold Preset</Label>
                            <Select
                                value={BADGE_THRESHOLD_PRESETS.some((preset) => Number(preset.value) === badgeForm.threshold) ? String(badgeForm.threshold) : "__custom__"}
                                onValueChange={(value) => {
                                    if (value !== "__custom__") setBadgeForm((f) => ({ ...f, threshold: Number(value) }));
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BADGE_THRESHOLD_PRESETS.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Custom count</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Window</Label>
                            <Select
                                value={badgeForm.windowDays ? String(badgeForm.windowDays) : "__all_time__"}
                                onValueChange={(value) => setBadgeForm((f) => ({ ...f, windowDays: value === "__all_time__" ? "" : Number(value) }))}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BADGE_WINDOW_PRESETS.map((preset) => (
                                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Custom Threshold</Label>
                            <Input type="number" value={badgeForm.threshold} onChange={(e) => setBadgeForm((f) => ({ ...f, threshold: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Custom Window Days</Label>
                            <Input type="number" value={badgeForm.windowDays} onChange={(e) => setBadgeForm((f) => ({ ...f, windowDays: e.target.value }))} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Audience</Label>
                        <Select value={badgeForm.audienceScope} onValueChange={(v) => setBadgeForm((f) => ({ ...f, audienceScope: v as AudienceScope }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Everyone</SelectItem>
                                <SelectItem value="INTERNAL">Internal reps only</SelectItem>
                                <SelectItem value="PARTNER">Partners only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch checked={badgeForm.isActive} onCheckedChange={(checked) => setBadgeForm((f) => ({ ...f, isActive: checked }))} id="badge-active" />
                        <Label htmlFor="badge-active">Active</Label>
                    </div>
                </div>
            </StandardDialog>
        </div>
    );
}

function TargetChecklist({
    title,
    items,
    selected,
    onToggle,
}: {
    title: string;
    items: TargetOption[];
    selected: string[];
    onToggle: (id: string, checked: boolean) => void;
}) {
    return (
        <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 text-xs font-bold uppercase text-muted-foreground">{title}</div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
                {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No options found.</p>
                ) : items.map((item) => {
                    const label = item.name || item.legalBusinessName || item.user?.name || item.email || item.id;
                    const description = item.email || item.user?.email;
                    return (
                        <label key={item.id} className="flex items-start gap-2 rounded-lg bg-surface-container-low p-2 text-sm">
                            <Checkbox
                                checked={selected.includes(item.id)}
                                onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                            />
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{label}</span>
                                {description ? <span className="block truncate text-xs text-muted-foreground">{description}</span> : null}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
