"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { savePersonalizationCache } from "@/lib/personalization-cache";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorThemePicker } from "@/components/settings/color-theme-picker";
import { ModeToggle } from "@/components/settings/mode-toggle";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Section } from "@/components/common/section";

// Destinations for the default landing page and pinned items (the main navigation's pages).
export const PERSONALIZABLE_MODULES: Array<{ href: string; label: string }> = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/tasks", label: "Tasks" },
    { href: "/dashboard/activities", label: "Activities" },
    { href: "/dashboard/leads", label: "Leads" },
    { href: "/dashboard/opportunities", label: "Opportunities" },
    { href: "/dashboard/lists", label: "Lists" },
    { href: "/dashboard/views", label: "Views" },
    { href: "/dashboard/cases", label: "Cases" },
    { href: "/dashboard/call-center", label: "Call center" },
    { href: "/dashboard/marketing", label: "Campaigns" },
    { href: "/dashboard/forms", label: "Forms" },
    { href: "/dashboard/automations-v2", label: "Automations" },
    { href: "/dashboard/reports", label: "Reports" },
    { href: "/dashboard/leaderboard", label: "Leaderboard" },
    { href: "/dashboard/payouts", label: "Payouts" },
];

export const MUTABLE_NOTIFICATION_CATEGORIES: Array<{ value: string; label: string }> = [
    { value: "TASKS", label: "Task reminders and SLA alerts" },
    { value: "REASSIGNMENT", label: "Records reassigned to or from me" },
    { value: "CASES", label: "Case updates" },
    { value: "APPLICATIONS", label: "Application document reminders" },
    { value: "VIEWS", label: "Activity on shared views" },
    { value: "NBA", label: "Recommended actions waiting for approval" },
    { value: "INTEGRATIONS", label: "Integration and webhook failures" },
    { value: "MARKETING", label: "Marketing journey alerts" },
    { value: "REPORTS", label: "Scheduled report failures" },
    { value: "CALLS", label: "Incoming calls" },
];

const TIME_ZONES = [
    ["Asia/Kolkata", "Kolkata"],
    ["America/New_York", "Eastern (US & Canada)"],
    ["America/Chicago", "Central (US & Canada)"],
    ["America/Denver", "Mountain (US & Canada)"],
    ["America/Los_Angeles", "Pacific (US & Canada)"],
    ["Europe/London", "London"],
    ["Europe/Paris", "Paris"],
    ["Asia/Tokyo", "Tokyo"],
] as const;

const CURRENCIES = [
    ["INR", "INR — Indian rupee"],
    ["USD", "USD — US dollar"],
    ["EUR", "EUR — Euro"],
    ["GBP", "GBP — British pound"],
    ["JPY", "JPY — Japanese yen"],
] as const;

type Prefs = {
    pinnedModules: string[];
    defaultLandingPage: string;
    density: "compact" | "comfortable" | "";
    mutedCategories: string[];
    timezoneOverride: string;
    currencyOverride: string;
};

const EMPTY: Prefs = { pinnedModules: [], defaultLandingPage: "", density: "", mutedCategories: [], timezoneOverride: "", currencyOverride: "" };

// The signed-in user's own preferences (/api/settings/personalization, per user). Each control
// saves as soon as it changes and says so; a failed save puts the old value back.
function usePersonalization() {
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [prefs, setPrefs] = useState<Prefs>(EMPTY);

    const load = useCallback(() => {
        setLoading(true);
        setFailed(false);
        apiFetch<any>("/settings/personalization")
            .then((data) => setPrefs({
                pinnedModules: Array.isArray(data?.pinnedModules) ? data.pinnedModules : [],
                defaultLandingPage: data?.defaultLandingPage || "",
                density: data?.density || "",
                mutedCategories: Array.isArray(data?.notifications?.mutedCategories) ? data.notifications.mutedCategories : [],
                timezoneOverride: data?.timezoneOverride || "",
                currencyOverride: data?.currencyOverride || "",
            }))
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    }, []);
    useEffect(load, [load]);

    const save = async (next: Partial<Prefs>, body: Record<string, unknown>) => {
        const previous = prefs;
        setPrefs((current) => ({ ...current, ...next }));
        try {
            const updated = await apiFetch("/settings/personalization", { method: "PATCH", body: JSON.stringify(body) });
            if (updated) savePersonalizationCache(updated);
            toast.success("Saved", { duration: 1500 });
        } catch {
            setPrefs(previous);
            toast.error("That change couldn't be saved");
        }
    };

    return { loading, failed, prefs, setPrefs, save, reload: load };
}

export function PreferencesPanel() {
    const confirm = useConfirm();
    const { loading, failed, prefs, setPrefs, save, reload } = usePersonalization();

    const resetToDefaults = async () => {
        const ok = await confirm({
            title: "Reset your preferences?",
            description: "Your landing page, pinned items, density, time zone and currency, notification choices, and the column, view and layout choices you made in each list go back to the workspace defaults.",
            confirmLabel: "Reset preferences",
            destructive: true,
        });
        if (!ok) return;
        try {
            const updated = await apiFetch("/settings/personalization", {
                method: "PATCH",
                body: JSON.stringify({ pinnedModules: null, defaultLandingPage: null, density: null, notifications: null, timezoneOverride: null, currencyOverride: null, tables: null, viewModes: null, layoutModes: null }),
            });
            savePersonalizationCache(updated);
            setPrefs(EMPTY);
            toast.success("Preferences reset");
        } catch {
            toast.error("Your preferences couldn't be reset");
        }
    };

    if (failed) {
        return <p role="alert" className="text-sm text-destructive">Your preferences couldn&apos;t be loaded. <button type="button" className="underline" onClick={reload}>Try again</button></p>;
    }

    return (
        <div className="space-y-6">
            <Section layout="split" title="Appearance" description="Light or dark, and the accent colour. These apply on this browser.">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>Mode</Label><ModeToggle /></div>
                    <div className="space-y-1.5"><Label>Accent colour</Label><ColorThemePicker /></div>
                </div>
            </Section>

            <Section layout="split" title="Navigation" description="Where you land after signing in, and what is pinned at the top of the menu.">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="pref-landing">Start page</Label>
                        <Select value={prefs.defaultLandingPage || "__default__"} disabled={loading} onValueChange={(value) => { const next = value === "__default__" ? "" : value; save({ defaultLandingPage: next }, { defaultLandingPage: next || null }); }}>
                            <SelectTrigger id="pref-landing" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Dashboard (default)</SelectItem>
                                {PERSONALIZABLE_MODULES.filter((item) => item.href !== "/dashboard").map((item) => <SelectItem key={item.href} value={item.href}>{item.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pref-density">Table rows</Label>
                        <Select value={prefs.density || "comfortable"} disabled={loading} onValueChange={(value) => save({ density: value as Prefs["density"] }, { density: value })}>
                            <SelectTrigger id="pref-density" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">Comfortable</SelectItem>
                                <SelectItem value="compact">Compact</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">For lists where you haven&apos;t chosen a density yourself.</p>
                    </div>
                </div>
                <fieldset className="mt-4 space-y-2">
                    <legend className="text-sm font-medium">Pinned items</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {PERSONALIZABLE_MODULES.map((item) => (
                            <label key={item.href} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={prefs.pinnedModules.includes(item.href)}
                                    disabled={loading}
                                    onCheckedChange={(checked) => {
                                        const next = checked ? [...new Set([...prefs.pinnedModules, item.href])] : prefs.pinnedModules.filter((href) => href !== item.href);
                                        save({ pinnedModules: next }, { pinnedModules: next });
                                    }}
                                />
                                {item.label}
                            </label>
                        ))}
                    </div>
                </fieldset>
            </Section>

            <Section layout="split" title="Time zone and currency" description="Your workspace's settings apply unless you choose your own here.">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="pref-timezone">Time zone</Label>
                        <Select value={prefs.timezoneOverride || "__default__"} disabled={loading} onValueChange={(value) => { const next = value === "__default__" ? "" : value; save({ timezoneOverride: next }, { timezoneOverride: next || null }); }}>
                            <SelectTrigger id="pref-timezone" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Workspace default</SelectItem>
                                {TIME_ZONES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pref-currency">Currency</Label>
                        <Select value={prefs.currencyOverride || "__default__"} disabled={loading} onValueChange={(value) => { const next = value === "__default__" ? "" : value; save({ currencyOverride: next }, { currencyOverride: next || null }); }}>
                            <SelectTrigger id="pref-currency" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Workspace default</SelectItem>
                                {CURRENCIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Section>

            <Section layout="split" title="Reset" description="Put every preference on this page, and the choices you made in each list, back to the workspace defaults.">
                <Button type="button" variant="outline" onClick={resetToDefaults} disabled={loading}><RotateCcw className="size-4" />Reset preferences</Button>
            </Section>
        </div>
    );
}

export function NotificationsPanel() {
    const { loading, failed, prefs, save, reload } = usePersonalization();
    if (failed) {
        return <p role="alert" className="text-sm text-destructive">Your notification choices couldn&apos;t be loaded. <button type="button" className="underline" onClick={reload}>Try again</button></p>;
    }
    return (
        <div className="space-y-6">
            <Section layout="split" title="What to notify me about" description="Turn off the kinds of notification you don't need. Security notices, such as an unusual sign-in, always arrive.">
                <div className="grid gap-2 sm:grid-cols-2">
                    {MUTABLE_NOTIFICATION_CATEGORIES.map((category) => (
                        <label key={category.value} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={!prefs.mutedCategories.includes(category.value)}
                                disabled={loading}
                                onCheckedChange={(checked) => {
                                    const next = checked ? prefs.mutedCategories.filter((value) => value !== category.value) : [...new Set([...prefs.mutedCategories, category.value])];
                                    save({ mutedCategories: next }, { notifications: { mutedCategories: next } });
                                }}
                            />
                            {category.label}
                        </label>
                    ))}
                </div>
            </Section>
            <p className="text-sm text-muted-foreground">See everything you&apos;ve been sent on the <Link href="/dashboard/notifications" className="text-primary hover:underline">notifications page</Link>.</p>
        </div>
    );
}
