"use client";

import { useEffect, useState } from "react";
import { Save, Settings } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DEFAULT_WORKSPACE_TIME_ZONE, saveDisplaySettings } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
                    <TabsTrigger value="profile">Organization</TabsTrigger>
                    <TabsTrigger value="localization">Localization</TabsTrigger>
                </TabsList>

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
