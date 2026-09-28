"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save, Settings } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DEFAULT_WORKSPACE_TIME_ZONE, saveDisplaySettings } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorThemePicker } from "@/components/settings/color-theme-picker";
import { ModeToggle } from "@/components/settings/mode-toggle";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { savePersonalizationCache } from "@/lib/personalization-cache";
import { MyActivityTab } from "@/components/settings/my-activity-tab";

// Gap checklist Module 10's "user workspace personalization" item -- a small, stable list of
// nav destinations for the pinned-modules picker and default-landing-page select, kept as a
// plain data list here rather than pulling in NavigationDrawer's own JSX-icon-bearing nav item
// definitions.
const PERSONALIZABLE_MODULES: Array<{ href: string; label: string }> = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/leads", label: "Leads" },
    { href: "/dashboard/lists", label: "Lists" },
    { href: "/dashboard/opportunities", label: "Opportunities" },
    { href: "/dashboard/activities", label: "Activities" },
    { href: "/dashboard/tasks", label: "Tasks" },
    { href: "/dashboard/call-center", label: "Call Center" },
    { href: "/dashboard/cases", label: "Cases" },
    { href: "/dashboard/views", label: "Views" },
    { href: "/dashboard/exports", label: "Exports" },
    { href: "/dashboard/forms", label: "Forms" },
    { href: "/dashboard/automations-v2", label: "Automations" },
    { href: "/dashboard/marketing", label: "Marketing" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/leaderboard", label: "Leaderboard" },
    { href: "/dashboard/payouts", label: "Payouts" },
];

const MUTABLE_NOTIFICATION_CATEGORIES: Array<{ value: string; label: string }> = [
    { value: "TASKS", label: "Task reminders & SLA alerts" },
    { value: "REASSIGNMENT", label: "Record reassignment" },
    { value: "CASES", label: "Case updates" },
    { value: "APPLICATIONS", label: "Application document reminders" },
    { value: "VIEWS", label: "Shared Smart View activity" },
    { value: "NBA", label: "Next-best-action approvals" },
    { value: "INTEGRATIONS", label: "Integration/webhook failures" },
    { value: "MARKETING", label: "Marketing journey alerts" },
    { value: "REPORTS", label: "Scheduled report failures" },
    { value: "CALLS", label: "Incoming calls" },
];

type PersonalizationSettings = {
    pinnedModules: string[];
    defaultLandingPage: string;
    density: "compact" | "comfortable" | "";
    mutedCategories: string[];
    timezoneOverride: string;
    currencyOverride: string;
};

const EMPTY_PERSONALIZATION: PersonalizationSettings = {
    pinnedModules: [],
    defaultLandingPage: "",
    density: "",
    mutedCategories: [],
    timezoneOverride: "",
    currencyOverride: "",
};

function PersonalizationTab() {
    const [loading, setLoading] = useState(true);
    const [prefs, setPrefs] = useState<PersonalizationSettings>(EMPTY_PERSONALIZATION);

    useEffect(() => {
        let mounted = true;
        apiFetch("/settings/personalization")
            .then((data) => {
                if (!mounted || !data) return;
                setPrefs({
                    pinnedModules: Array.isArray(data.pinnedModules) ? data.pinnedModules : [],
                    defaultLandingPage: data.defaultLandingPage || "",
                    density: data.density || "",
                    mutedCategories: Array.isArray(data.notifications?.mutedCategories) ? data.notifications.mutedCategories : [],
                    timezoneOverride: data.timezoneOverride || "",
                    currencyOverride: data.currencyOverride || "",
                });
            })
            .catch(() => toast.error("Failed to load personalization settings"))
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, []);

    // Every control here saves instantly on change (no separate "Save" button, unlike the
    // tenant-admin tabs above) -- matches this session's own established precedent for a single
    // toggle-style preference (e.g. the keyboard-shortcuts enablement checkbox).
    const patch = async (body: Record<string, unknown>) => {
        try {
            await apiFetch("/settings/personalization", { method: "PATCH", body: JSON.stringify(body) });
        } catch {
            toast.error("Failed to save");
        }
    };

    const togglePinned = (href: string, checked: boolean) => {
        const next = checked ? [...new Set([...prefs.pinnedModules, href])] : prefs.pinnedModules.filter((h) => h !== href);
        setPrefs((p) => ({ ...p, pinnedModules: next }));
        patch({ pinnedModules: next });
    };

    const toggleMuted = (category: string, checked: boolean) => {
        const next = checked ? prefs.mutedCategories.filter((c) => c !== category) : [...new Set([...prefs.mutedCategories, category])];
        setPrefs((p) => ({ ...p, mutedCategories: next }));
        patch({ notifications: { mutedCategories: next } });
    };

    // Gap checklist Module 10's "saved workspace layouts" item, "reset-to-default" -- no
    // per-field UI exists for `tables`/`viewModes`/`layoutModes` (they're set implicitly by
    // interacting with each module's own page), so a single explicit reset clears the whole
    // preferences bag rather than requiring the user to hunt down and undo each one individually.
    // `updateUserPreferencesForTenant`'s merge-patch treats an explicit `null` as "overwrite this
    // key," so one PATCH clears everything back to tenant defaults.
    const resetToDefaults = async () => {
        if (!window.confirm("Reset all workspace personalization to defaults? This clears your pinned modules, default landing page, density, table preferences, saved view modes/layouts, notification mutes, and timezone/currency overrides.")) return;
        try {
            const updated = await apiFetch("/settings/personalization", {
                method: "PATCH",
                body: JSON.stringify({
                    pinnedModules: null,
                    defaultLandingPage: null,
                    density: null,
                    notifications: null,
                    timezoneOverride: null,
                    currencyOverride: null,
                    tables: null,
                    viewModes: null,
                    layoutModes: null,
                }),
            });
            savePersonalizationCache(updated);
            setPrefs(EMPTY_PERSONALIZATION);
            toast.success("Workspace personalization reset to defaults");
        } catch {
            toast.error("Failed to reset workspace personalization");
        }
    };

    return (
        <div className="space-y-4">
            <section className="rounded-[14px] border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">Navigation</p>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Default landing page</Label>
                        <Select
                            value={prefs.defaultLandingPage || "__tenant_default__"}
                            onValueChange={(value) => {
                                const next = value === "__tenant_default__" ? "" : value;
                                setPrefs((p) => ({ ...p, defaultLandingPage: next }));
                                patch({ defaultLandingPage: next || null });
                            }}
                            disabled={loading}
                        >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__tenant_default__">Dashboard (default)</SelectItem>
                                {PERSONALIZABLE_MODULES.map((m) => <SelectItem key={m.href} value={m.href}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Where you land right after signing in.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Default table density</Label>
                        <Select
                            value={prefs.density || "comfortable"}
                            onValueChange={(value) => {
                                const next = value as "compact" | "comfortable";
                                setPrefs((p) => ({ ...p, density: next }));
                                patch({ density: next });
                            }}
                            disabled={loading}
                        >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">Comfortable</SelectItem>
                                <SelectItem value="compact">Compact</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Applies to any list table you haven&apos;t already switched yourself.</p>
                    </div>
                </div>
                <div className="mt-4 space-y-1.5">
                    <Label>Pinned modules</Label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                        {PERSONALIZABLE_MODULES.map((m) => (
                            <label key={m.href} className="flex items-center gap-2 text-sm">
                                <Checkbox checked={prefs.pinnedModules.includes(m.href)} onCheckedChange={(checked) => togglePinned(m.href, !!checked)} disabled={loading} />
                                {m.label}
                            </label>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Pinned modules appear in a dedicated section at the top of the sidebar.</p>
                </div>
            </section>

            <section className="rounded-[14px] border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">Notification preferences</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {MUTABLE_NOTIFICATION_CATEGORIES.map((cat) => (
                        <label key={cat.value} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={!prefs.mutedCategories.includes(cat.value)} onCheckedChange={(checked) => toggleMuted(cat.value, !!checked)} disabled={loading} />
                            {cat.label}
                        </label>
                    ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Security notices (suspicious sign-ins, abuse alerts) always deliver and can&apos;t be muted.</p>
            </section>

            <section className="rounded-[14px] border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">Timezone &amp; currency override</p>
                <p className="mb-3 text-xs text-muted-foreground">Inherited from your workspace&apos;s Localization settings unless you override it here.</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Timezone</Label>
                        <Select
                            value={prefs.timezoneOverride || "__tenant_default__"}
                            onValueChange={(value) => {
                                const next = value === "__tenant_default__" ? "" : value;
                                setPrefs((p) => ({ ...p, timezoneOverride: next }));
                                patch({ timezoneOverride: next || null });
                            }}
                            disabled={loading}
                        >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__tenant_default__">Use workspace default</SelectItem>
                                <SelectItem value="Asia/Kolkata">Kolkata</SelectItem>
                                <SelectItem value="America/New_York">Eastern (US &amp; Canada)</SelectItem>
                                <SelectItem value="America/Chicago">Central (US &amp; Canada)</SelectItem>
                                <SelectItem value="America/Denver">Mountain (US &amp; Canada)</SelectItem>
                                <SelectItem value="America/Los_Angeles">Pacific (US &amp; Canada)</SelectItem>
                                <SelectItem value="Europe/London">London</SelectItem>
                                <SelectItem value="Europe/Paris">Paris</SelectItem>
                                <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Currency</Label>
                        <Select
                            value={prefs.currencyOverride || "__tenant_default__"}
                            onValueChange={(value) => {
                                const next = value === "__tenant_default__" ? "" : value;
                                setPrefs((p) => ({ ...p, currencyOverride: next }));
                                patch({ currencyOverride: next || null });
                            }}
                            disabled={loading}
                        >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__tenant_default__">Use workspace default</SelectItem>
                                <SelectItem value="USD">USD — US Dollar</SelectItem>
                                <SelectItem value="EUR">EUR — Euro</SelectItem>
                                <SelectItem value="GBP">GBP — British Pound</SelectItem>
                                <SelectItem value="JPY">JPY — Japanese Yen</SelectItem>
                                <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </section>

            <section className="rounded-[14px] border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">Reset</p>
                <p className="mb-3 text-xs text-muted-foreground">
                    Clears every personal workspace preference above, plus per-module table density/columns, saved view modes (e.g. Tasks&apos; List/Calendar, Opportunities&apos; List/Kanban/Analytics), and Marketing&apos;s split/full layout choice -- everything reverts to the workspace default.
                </p>
                <Button type="button" variant="outline" onClick={resetToDefaults} disabled={loading}>
                    <RotateCcw className="size-4" />
                    Reset to Defaults
                </Button>
            </section>
        </div>
    );
}

export default function GeneralSettingsPage() {
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        companyName: "",
        timezone: DEFAULT_WORKSPACE_TIME_ZONE,
        currency: "INR",
        language: "en",
        dateFormat: "dd/MM/yyyy",
    });

    useEffect(() => {
        let mounted = true;

        const fetchSettings = async () => {
            try {
                const data = await apiFetch("/settings/general");
                if (!mounted || !data) return;
                setSettings((current) => ({
                    ...current,
                    companyName: data.companyName ?? "",
                    timezone: data.timezone ?? current.timezone,
                    currency: data.currency ?? current.currency,
                    language: data.language ?? current.language,
                    dateFormat: "dd/MM/yyyy",
                }));
            } catch {
                toast.error("Failed to load settings");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchSettings();
        return () => {
            mounted = false;
        };
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiFetch("/settings/general", {
                method: "PATCH",
                body: JSON.stringify(settings),
            });
            saveDisplaySettings(settings);
            toast.success("Settings saved successfully");
        } catch {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="mb-1 flex items-center gap-3">
                <div className="flex items-center justify-center rounded-[10px] bg-primary/10 p-2 text-primary">
                    <Settings className="size-4" />
                </div>
                <h1 className="text-xl font-extrabold tracking-tight">General Settings</h1>
            </div>
            <p className="mb-4 text-muted-foreground/80">
                Configure your organization&apos;s core profile, localization, and display preferences.
            </p>

            <Tabs defaultValue="appearance" className="mt-4 max-w-3xl space-y-4">
                <TabsList className="h-10">
                    <TabsTrigger value="appearance">Appearance</TabsTrigger>
                    <TabsTrigger value="workspace">My Workspace</TabsTrigger>
                    <TabsTrigger value="activity">My Activity</TabsTrigger>
                    <TabsTrigger value="profile">Organization</TabsTrigger>
                    <TabsTrigger value="localization">Localization</TabsTrigger>
                </TabsList>

                <TabsContent value="workspace">
                    <PersonalizationTab />
                </TabsContent>

                <TabsContent value="activity">
                    <MyActivityTab />
                </TabsContent>

                <TabsContent value="appearance">
                    <section className="rounded-[14px] border bg-card p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                            Appearance
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Mode</Label>
                                <ModeToggle />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Color theme</Label>
                                <ColorThemePicker />
                            </div>
                        </div>
                    </section>
                </TabsContent>

                <TabsContent value="profile">
                    <section className="rounded-[14px] border bg-card p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                            Organization Profile
                        </p>
                        <div className="max-w-xl space-y-1.5">
                            <Label htmlFor="company-name">Company Name</Label>
                            <Input
                                id="company-name"
                                placeholder="Acme Corp"
                                value={settings.companyName}
                                onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
                                disabled={loading}
                            />
                        </div>
                    </section>
                </TabsContent>

                <TabsContent value="localization">
                    <section className="rounded-[14px] border bg-card p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                            Localization
                        </p>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Timezone</Label>
                                <Select
                                    value={settings.timezone}
                                    onValueChange={(value) => setSettings((s) => ({ ...s, timezone: value }))}
                                    disabled={loading}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Asia/Kolkata">Kolkata</SelectItem>
                                        <SelectItem value="America/New_York">Eastern (US & Canada)</SelectItem>
                                        <SelectItem value="America/Chicago">Central (US & Canada)</SelectItem>
                                        <SelectItem value="America/Denver">Mountain (US & Canada)</SelectItem>
                                        <SelectItem value="America/Los_Angeles">Pacific (US & Canada)</SelectItem>
                                        <SelectItem value="Europe/London">London</SelectItem>
                                        <SelectItem value="Europe/Paris">Paris</SelectItem>
                                        <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Timestamps are converted from UTC into this tenant timezone.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Currency</Label>
                                <Select
                                    value={settings.currency}
                                    onValueChange={(value) => setSettings((s) => ({ ...s, currency: value }))}
                                    disabled={loading}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USD">USD — US Dollar</SelectItem>
                                        <SelectItem value="EUR">EUR — Euro</SelectItem>
                                        <SelectItem value="GBP">GBP — British Pound</SelectItem>
                                        <SelectItem value="JPY">JPY — Japanese Yen</SelectItem>
                                        <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Language</Label>
                                <Select
                                    value={settings.language}
                                    onValueChange={(value) => setSettings((s) => ({ ...s, language: value }))}
                                    disabled={loading}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="hi">Hindi</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Date Format</Label>
                                <Select
                                    value={settings.dateFormat}
                                    onValueChange={() => undefined}
                                    disabled
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Date-time format: dd/MM/yyyy, hh:mm AM/PM.</p>
                            </div>
                        </div>
                    </section>
                </TabsContent>
            </Tabs>

            <div className="mt-10">
                <Button size="lg" onClick={handleSave} disabled={saving || loading}>
                    <Save className="size-4" />
                    {saving ? "Saving Changes..." : loading ? "Loading..." : "Save Settings"}
                </Button>
            </div>
        </div>
    );
}
