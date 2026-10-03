"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useId, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatWorkspaceDateTime } from "@/lib/date-format";

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
    mfaEnforcementMode: "DISABLED" | "OPTIONAL" | "REQUIRED_NEW_USERS" | "REQUIRED_ALL";
    mfaEnforcedSince: string | null;
    mfaGracePeriodDays: number;
    privilegedActionApprovalRequired: boolean;
    reassignmentApprovalRequired: boolean;
    reassignmentLimitCount: number | null;
    reassignmentLimitWindowDays: number | null;
    tenantName?: string | null;
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
    const id = useId();
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
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
    const id = useId();
    return (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
            <Label htmlFor={id} className="min-w-0 text-sm font-medium leading-5">{label}</Label>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        </div>
    );
}

export default function SecurityPolicyPage() {
    const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
    const [selectedPolicy, setSelectedPolicy] = useState<SecurityPolicy | null>(null);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const { isAuthenticated, user } = useAuth();
    const isPlatformAdmin = user?.isPlatformAdmin;

    useEffect(() => {
        if (isAuthenticated && isPlatformAdmin) {
            fetchPolicies();
        }
    }, [isAuthenticated, isPlatformAdmin]);

    const fetchPolicies = async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await apiFetch("/platform-admin/security/policies");
            setPolicies(data);
            if (data.length > 0) {
                setSelectedPolicy(data[0]);
            }
        } catch (error) {
            setLoadError(true);
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
        <div className="min-w-0">
            <PageHeader title="Security policies" description="Password rules, sessions, two-factor and approval rules, per workspace." actions={
                selectedPolicy && !loadError && (editing ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={saving} onClick={() => { setSelectedPolicy(policies.find((policy) => (policy.tenantId || "global") === (selectedPolicy?.tenantId || "global")) ?? null); setEditing(false); }}>
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
                ))
            } />
            {loadError && <div role="alert" className="rounded-lg border p-4 text-sm">Unable to load security policies. <Button variant="outline" size="sm" onClick={fetchPolicies}>Retry</Button></div>}
            {!loadError && !selectedPolicy && <p className="text-sm text-muted-foreground">No security policies found.</p>}

            {policies.length > 1 && (
                <div className="mt-4 max-w-xs space-y-1.5">
                    <Label htmlFor="security-policy" className="text-xs font-normal text-muted-foreground">Policy</Label>
                    <Select
                        disabled={editing || saving}
                        value={selectedPolicy?.tenantId || "global"}
                        onValueChange={(value) => {
                            const next = policies.find((p) => (p.tenantId || "global") === value);
                            if (next) { setSelectedPolicy(next); setEditing(false); }
                        }}
                    >
                        <SelectTrigger id="security-policy" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {policies.map((p) => (
                                <SelectItem key={p.tenantId || "global"} value={p.tenantId || "global"}>
                                    {p.tenantId ? (p.tenantName || p.tenantId) : "Global Default"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {selectedPolicy && !loadError && (
                <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                    <Card className="h-full gap-4 rounded-lg py-5">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Lock className="h-5 w-5 text-primary" />
                                Password Policy
                            </CardTitle>
                            <CardDescription>Enforced at account creation, self-service password change, and login (expiry) -- see Settings &gt; Password and the admin Users page&apos;s reset-link action.</CardDescription>
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
                            <CardDescription>Session timeouts, concurrent-session limits, and login lockout are enforced live at login and on every request.</CardDescription>
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
                                    label="Log Failed Login Attempts (not yet enforced -- always on today)"
                                    checked={selectedPolicy.logFailedLoginAttempts}
                                    onCheckedChange={(checked) => updateField("logFailedLoginAttempts", checked)}
                                    disabled={!editing}
                                />
                                <PolicySwitch
                                    label="Require Login Notifications (not yet enforced)"
                                    checked={selectedPolicy.requireLoginNotifications}
                                    onCheckedChange={(checked) => updateField("requireLoginNotifications", checked)}
                                    disabled={!editing}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="h-full gap-4 rounded-lg py-5">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Shield className="h-5 w-5 text-primary" />
                                Multi-Factor Authentication
                            </CardTitle>
                            <CardDescription>
                                Enforced live at login. Users always keep the option to enroll in MFA voluntarily
                                regardless of this setting -- this controls whether it&apos;s required.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-5">
                            <div className="space-y-1.5">
                                <Label htmlFor="security-mfa-mode" className="text-sm">Enforcement Mode</Label>
                                <Select
                                    value={selectedPolicy.mfaEnforcementMode}
                                    onValueChange={(value) => updateField("mfaEnforcementMode", value as SecurityPolicy["mfaEnforcementMode"])}
                                    disabled={!editing}
                                >
                                    <SelectTrigger id="security-mfa-mode" className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DISABLED">Disabled -- MFA cannot be enabled by users</SelectItem>
                                        <SelectItem value="OPTIONAL">Optional -- users may enroll if they choose</SelectItem>
                                        <SelectItem value="REQUIRED_NEW_USERS">Required for new users (created after this is turned on)</SelectItem>
                                        <SelectItem value="REQUIRED_ALL">Required for all users</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <NumberField
                                label="Enrollment Grace Period (days)"
                                value={selectedPolicy.mfaGracePeriodDays}
                                onChange={(value) => updateField("mfaGracePeriodDays", value)}
                                disabled={!editing}
                            />
                            <p className="text-xs text-muted-foreground">
                                When a required mode is turned on, affected users can still log in without MFA for this many
                                days (to enroll); after that, login is blocked until they enroll or an admin resets their MFA.
                                {selectedPolicy.mfaEnforcedSince && (
                                    <> Currently anchored to {formatWorkspaceDateTime(selectedPolicy.mfaEnforcedSince)}.</>
                                )}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="gap-4 rounded-lg py-5 2xl:col-span-2">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="text-base">Audit & Compliance</CardTitle>
                            <CardDescription>Saved, but not yet enforced -- audit logging already runs unconditionally app-wide today, and there&apos;s no IP-allowlist mechanism yet for this to gate.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 px-5 2xl:grid-cols-2">
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

                    <Card className="gap-4 rounded-lg py-5 2xl:col-span-2">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="text-base">Privileged Action Controls</CardTitle>
                            <CardDescription>
                                When on, a different tenant admin must approve a permission template change or API key
                                rotation before it takes effect -- see Settings &gt; Privileged Actions for the approval queue.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-5">
                            <PolicySwitch
                                label="Require a second admin's approval for sensitive changes"
                                checked={selectedPolicy.privilegedActionApprovalRequired}
                                onCheckedChange={(checked) => updateField("privilegedActionApprovalRequired", checked)}
                                disabled={!editing}
                            />
                        </CardContent>
                    </Card>

                    <Card className="gap-4 rounded-lg py-5 2xl:col-span-2">
                        <CardHeader className="gap-1 px-5">
                            <CardTitle className="text-base">Reassignment Governance</CardTitle>
                            <CardDescription>
                                Controls on manual/bulk record reassignment (Assign owner) -- a dedicated toggle from
                                Privileged Action Controls above, since it gates a different, higher-frequency action.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-5">
                            <PolicySwitch
                                label="Require a second admin's approval before a reassignment takes effect"
                                checked={selectedPolicy.reassignmentApprovalRequired}
                                onCheckedChange={(checked) => updateField("reassignmentApprovalRequired", checked)}
                                disabled={!editing}
                            />
                            <div className="border-t border-border pt-4">
                                <NumberField
                                    label="Max reassignments per record in the window below (0 = no limit)"
                                    value={selectedPolicy.reassignmentLimitCount ?? 0}
                                    onChange={(value) => updateField("reassignmentLimitCount", value > 0 ? value : null)}
                                    disabled={!editing}
                                />
                                <NumberField
                                    label="Reassignment limit window (days)"
                                    value={selectedPolicy.reassignmentLimitWindowDays ?? 7}
                                    onChange={(value) => updateField("reassignmentLimitWindowDays", value > 0 ? value : null)}
                                    disabled={!editing}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
