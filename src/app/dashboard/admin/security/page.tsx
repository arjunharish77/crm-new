"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Edit, Loader2, Lock, Save, Shield, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SecurityPolicy {
    id?: string;
    tenantId?: string | null;
    minPasswordLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    passwordExpiryDays: number;
    preventPasswordReuse: number;
    sessionTimeoutMinutes: number;
    maxConcurrentSessions: number;
    enforceSessionTimeout: boolean;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
    enableTwoFactor: boolean;
    enforceIpRestrictions: boolean;
    enforceAuditLogging: boolean;
    logFailedLoginAttempts: boolean;
    requireLoginNotifications: boolean;
    tenant?: {
        id: string;
        name: string;
    };
}

interface NumberFieldProps {
    label: string;
    value: number;
    disabled: boolean;
    onChange: (value: number) => void;
}

function NumberField({ label, value, disabled, onChange }: NumberFieldProps) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)}
                disabled={disabled}
            />
        </div>
    );
}

interface PolicySwitchProps {
    label: string;
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
}

function PolicySwitch({ label, checked, disabled, onCheckedChange }: PolicySwitchProps) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
            <Label className="text-sm font-medium leading-5">{label}</Label>
            <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        </div>
    );
}

export default function SecurityPolicyPage() {
    const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
    const [selectedPolicy, setSelectedPolicy] = useState<SecurityPolicy | null>(null);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { token, user } = useAuth();
    const isPlatformAdmin = user?.isPlatformAdmin;

    useEffect(() => {
        if (token && isPlatformAdmin) {
            fetchPolicies();
        }
    }, [token, isPlatformAdmin]);

    const fetchPolicies = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/platform-admin/security/policies");
            setPolicies(data);
            if (data.length > 0) {
                setSelectedPolicy(data[0]);
            }
        } catch (error) {
            toast.error("Failed to load policies");
        } finally {
            setLoading(false);
        }
    };

    const savePolicy = async () => {
        if (!selectedPolicy) return;

        setSaving(true);
        try {
            const tenantId = selectedPolicy.tenantId || "global";
            await apiFetch(`/platform-admin/security/policy/${tenantId}`, {
                method: "PATCH",
                body: JSON.stringify(selectedPolicy),
            });
            toast.success("Security policy updated!");
            fetchPolicies();
            setEditing(false);
        } catch (error) {
            toast.error("Failed to save policy");
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof SecurityPolicy, value: SecurityPolicy[keyof SecurityPolicy]) => {
        if (selectedPolicy) {
            setSelectedPolicy({ ...selectedPolicy, [field]: value });
        }
    };

    if (!isPlatformAdmin) {
        return (
            <div className="px-4 py-10 text-center text-sm font-medium text-destructive">
                You do not have permission to view this page.
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Security Policies</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Configure security settings for tenants.</p>
                </div>
                {editing ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setEditing(false)}>
                            <X className="h-4 w-4" />
                            Cancel
                        </Button>
                        <Button onClick={savePolicy} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                ) : (
                    <Button onClick={() => setEditing(true)}>
                        <Edit className="h-4 w-4" />
                        Edit Policy
                    </Button>
                )}
            </div>

            {selectedPolicy && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <Card className="h-full gap-4 rounded-lg py-5">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Lock className="h-5 w-5 text-primary" />
                                Password Policy
                            </CardTitle>
                            <CardDescription>Configure password requirements and security</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-5">
                            <NumberField
                                label="Minimum Password Length"
                                value={selectedPolicy.minPasswordLength}
                                onChange={(value) => updateField("minPasswordLength", value)}
                                disabled={!editing}
                            />
                            <NumberField
                                label="Password Expiry (days, 0=never)"
                                value={selectedPolicy.passwordExpiryDays}
                                onChange={(value) => updateField("passwordExpiryDays", value)}
                                disabled={!editing}
                            />
                            <NumberField
                                label="Prevent Reuse (last N passwords)"
                                value={selectedPolicy.preventPasswordReuse}
                                onChange={(value) => updateField("preventPasswordReuse", value)}
                                disabled={!editing}
                            />

                            <div className="space-y-2 border-t border-border pt-4">
                                <PolicySwitch
                                    label="Require Uppercase Letters"
                                    checked={selectedPolicy.requireUppercase}
                                    onCheckedChange={(checked) => updateField("requireUppercase", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Require Lowercase Letters"
                                    checked={selectedPolicy.requireLowercase}
                                    onCheckedChange={(checked) => updateField("requireLowercase", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Require Numbers"
                                    checked={selectedPolicy.requireNumbers}
                                    onCheckedChange={(checked) => updateField("requireNumbers", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Require Special Characters"
                                    checked={selectedPolicy.requireSpecialChars}
                                    onCheckedChange={(checked) => updateField("requireSpecialChars", checked)}
                                    disabled={!editing}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="h-full gap-4 rounded-lg py-5">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Shield className="h-5 w-5 text-primary" />
                                Login & Session
                            </CardTitle>
                            <CardDescription>Manage session timeouts and access controls</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <NumberField
                                    label="Session Timeout (min)"
                                    value={selectedPolicy.sessionTimeoutMinutes}
                                    onChange={(value) => updateField("sessionTimeoutMinutes", value)}
                                    disabled={!editing}
                                />
                                <NumberField
                                    label="Max Concurrent Sessions"
                                    value={selectedPolicy.maxConcurrentSessions}
                                    onChange={(value) => updateField("maxConcurrentSessions", value)}
                                    disabled={!editing}
                                />
                                <NumberField
                                    label="Max Login Attempts"
                                    value={selectedPolicy.maxLoginAttempts}
                                    onChange={(value) => updateField("maxLoginAttempts", value)}
                                    disabled={!editing}
                                />
                                <NumberField
                                    label="Lockout Duration (min)"
                                    value={selectedPolicy.lockoutDurationMinutes}
                                    onChange={(value) => updateField("lockoutDurationMinutes", value)}
                                    disabled={!editing}
                                />
                            </div>

                            <div className="space-y-2 border-t border-border pt-4">
                                <PolicySwitch
                                    label="Enforce Session Timeout"
                                    checked={selectedPolicy.enforceSessionTimeout}
                                    onCheckedChange={(checked) => updateField("enforceSessionTimeout", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Enable Two-Factor Authentication"
                                    checked={selectedPolicy.enableTwoFactor}
                                    onCheckedChange={(checked) => updateField("enableTwoFactor", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Log Failed Login Attempts"
                                    checked={selectedPolicy.logFailedLoginAttempts}
                                    onCheckedChange={(checked) => updateField("logFailedLoginAttempts", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Require Login Notifications"
                                    checked={selectedPolicy.requireLoginNotifications}
                                    onCheckedChange={(checked) => updateField("requireLoginNotifications", checked)}
                                    disabled={!editing}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="gap-4 rounded-lg py-5 lg:col-span-2">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="text-base">Audit & Compliance</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 px-5 md:grid-cols-2">
                            <PolicySwitch
                                label="Enforce Audit Logging"
                                checked={selectedPolicy.enforceAuditLogging}
                                onCheckedChange={(checked) => updateField("enforceAuditLogging", checked)}
                                disabled={!editing}
                            />
                            <PolicySwitch
                                label="Enforce IP Restrictions"
                                checked={selectedPolicy.enforceIpRestrictions}
                                onCheckedChange={(checked) => updateField("enforceIpRestrictions", checked)}
                                disabled={!editing}
                            />
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
