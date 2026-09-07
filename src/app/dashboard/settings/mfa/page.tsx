"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, KeyRound, Smartphone, Loader2, CheckCircle2, Copy, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";

type MfaStatus = { mfaEnabled: boolean; remainingBackupCodes: number };
type TrustedDevice = { id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastUsedAt: string; expiresAt: string };

function describeDevice(userAgent: string | null) {
    if (!userAgent) return "Unknown device";
    if (/mobile/i.test(userAgent)) return "Mobile browser";
    if (/chrome/i.test(userAgent)) return "Chrome";
    if (/firefox/i.test(userAgent)) return "Firefox";
    if (/safari/i.test(userAgent)) return "Safari";
    if (/edg/i.test(userAgent)) return "Edge";
    return "Browser";
}

// Enrollment is a 3-step wizard: start (QR shown) -> confirm (prove it with a live code) ->
// backup codes shown exactly once (only bcrypt hashes are ever stored server-side, see mfa.ts).
type EnrollStep = "scan" | "backup-codes";

function EnrollDialog({ open, onClose, onEnrolled }: { open: boolean; onClose: () => void; onEnrolled: () => void }) {
    const [step, setStep] = useState<EnrollStep>("scan");
    const [starting, setStarting] = useState(false);
    const [qrCodeDataUri, setQrCodeDataUri] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    useEffect(() => {
        if (!open) return;
        setStep("scan");
        setCode("");
        setBackupCodes([]);
        setStarting(true);
        apiFetch<{ secret: string; qrCodeDataUri: string }>("/mfa/enroll/start", { method: "POST" })
            .then((data) => { setQrCodeDataUri(data.qrCodeDataUri); setSecret(data.secret); })
            .catch((error: any) => toast.error(error?.message || "Failed to start enrollment"))
            .finally(() => setStarting(false));
    }, [open]);

    const confirm = async () => {
        if (code.trim().length < 6) return;
        setConfirming(true);
        try {
            const result = await apiFetch<{ backupCodes: string[] }>("/mfa/enroll/confirm", {
                method: "POST",
                body: JSON.stringify({ token: code.trim() }),
            });
            setBackupCodes(result.backupCodes);
            setStep("backup-codes");
        } catch (error: any) {
            toast.error(error?.message || "Invalid code");
        } finally {
            setConfirming(false);
        }
    };

    const finish = () => {
        onEnrolled();
        onClose();
        toast.success("Two-factor authentication is now enabled");
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join("\n")).then(() => toast.success("Backup codes copied"));
    };

    return (
        <StandardDialog open={open} onClose={onClose} title="Enable Two-Factor Authentication" icon={<ShieldCheck className="size-4" />} maxWidth="sm">
            {step === "scan" ? (
                <div className="space-y-4 py-2">
                    {starting ? (
                        <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.).
                            </p>
                            {qrCodeDataUri && (
                                <div className="flex justify-center">
                                    <img src={qrCodeDataUri} alt="MFA QR code" className="size-48 rounded-md border border-border" />
                                </div>
                            )}
                            {secret && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</Label>
                                    <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">{secret}</code>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>Enter the 6-digit code from your app</Label>
                                <Input
                                    value={code}
                                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="max-w-[160px] text-center text-lg tracking-widest"
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={confirm} disabled={confirming || code.trim().length < 6}>
                                    {confirming && <Loader2 className="size-4 animate-spin" />}
                                    Verify & Enable
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-4 py-2">
                    <Alert>
                        <CheckCircle2 className="size-4" />
                        <AlertDescription>
                            Save these backup codes somewhere safe. Each can be used once to sign in if you lose access to
                            your authenticator app. They will not be shown again.
                        </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm">
                        {backupCodes.map((backupCode) => (
                            <span key={backupCode}>{backupCode}</span>
                        ))}
                    </div>
                    <div className="flex justify-between">
                        <Button variant="outline" onClick={copyBackupCodes}>
                            <Copy className="size-3.5" />
                            Copy Codes
                        </Button>
                        <Button onClick={finish}>Done</Button>
                    </div>
                </div>
            )}
        </StandardDialog>
    );
}

function CodePromptDialog({
    open,
    onClose,
    title,
    description,
    confirmLabel,
    onConfirm,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: (token: string) => Promise<void>;
}) {
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { if (open) setCode(""); }, [open]);

    const submit = async () => {
        if (code.trim().length < 6) return;
        setSubmitting(true);
        try {
            await onConfirm(code.trim());
            onClose();
        } catch (error: any) {
            toast.error(error?.message || "Invalid code");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <StandardDialog open={open} onClose={onClose} title={title} icon={<KeyRound className="size-4" />} maxWidth="xs">
            <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">{description}</p>
                <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\s/g, "").slice(0, 12))}
                    placeholder="6-digit code or backup code"
                    className="text-center text-lg tracking-widest"
                    autoFocus
                />
                <div className="flex justify-end">
                    <Button variant="destructive" onClick={submit} disabled={submitting || code.trim().length < 6}>
                        {submitting && <Loader2 className="size-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </StandardDialog>
    );
}

export default function MfaSettingsPage() {
    const [status, setStatus] = useState<MfaStatus | null>(null);
    const [devices, setDevices] = useState<TrustedDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        Promise.all([
            apiFetch<MfaStatus>("/mfa/status"),
            apiFetch<TrustedDevice[]>("/mfa/trusted-devices").catch(() => []),
        ])
            .then(([statusData, deviceData]) => { setStatus(statusData); setDevices(Array.isArray(deviceData) ? deviceData : []); })
            .catch(() => toast.error("Failed to load MFA settings"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const disable = async (token: string) => {
        await apiFetch("/mfa/disable", { method: "POST", body: JSON.stringify({ token }) });
        toast.success("Two-factor authentication disabled");
        load();
    };

    const regenerate = async (token: string) => {
        const result = await apiFetch<{ backupCodes: string[] }>("/mfa/regenerate-backup-codes", {
            method: "POST",
            body: JSON.stringify({ token }),
        });
        toast.success(`New backup codes generated: ${result.backupCodes.join(", ")}`, { duration: 15000 });
        load();
    };

    const revokeDevice = async (device: TrustedDevice) => {
        setRevokingId(device.id);
        try {
            await apiFetch(`/mfa/trusted-devices/${device.id}`, { method: "DELETE" });
            toast.success("Device removed");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove device");
        } finally {
            setRevokingId(null);
        }
    };

    if (loading) {
        return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-bold">
                    <ShieldCheck className="size-5" />
                    Two-Factor Authentication
                </h1>
                <p className="text-sm text-muted-foreground">Add an extra layer of security to your account.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        {status?.mfaEnabled ? <ShieldCheck className="size-4 text-emerald-600" /> : <ShieldOff className="size-4 text-muted-foreground" />}
                        {status?.mfaEnabled ? "Enabled" : "Not Enabled"}
                    </CardTitle>
                    <CardDescription>
                        {status?.mfaEnabled
                            ? `You'll be asked for a code from your authenticator app when signing in from a new device. ${status.remainingBackupCodes} backup code(s) remaining.`
                            : "Requires a code from an authenticator app in addition to your password when signing in."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    {status?.mfaEnabled ? (
                        <>
                            <Button variant="outline" onClick={() => setRegenerateOpen(true)}>
                                <KeyRound className="size-3.5" />
                                Regenerate Backup Codes
                            </Button>
                            <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                                <ShieldOff className="size-3.5" />
                                Disable Two-Factor Authentication
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => setEnrollOpen(true)}>
                            <ShieldCheck className="size-3.5" />
                            Enable Two-Factor Authentication
                        </Button>
                    )}
                </CardContent>
            </Card>

            {status?.mfaEnabled && (
                <Card className="overflow-hidden py-0">
                    <CardHeader className="pt-5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Smartphone className="size-4" />
                            Remembered Devices
                        </CardTitle>
                        <CardDescription>Devices you chose to trust skip the code prompt for 30 days.</CardDescription>
                    </CardHeader>
                    {devices.length === 0 ? (
                        <p className="p-4 pt-0 text-sm text-muted-foreground">No remembered devices.</p>
                    ) : (
                        <div className="divide-y border-t border-border">
                            {devices.map((device) => (
                                <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    <div>
                                        <p className="text-sm font-medium">{describeDevice(device.userAgent)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {device.ipAddress || "Unknown IP"} -- trusted {formatWorkspaceDateTime(device.createdAt)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Last used {formatWorkspaceRelativeTime(device.lastUsedAt)}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" disabled={revokingId === device.id} onClick={() => revokeDevice(device)}>
                                        <Trash2 className="size-3.5" />
                                        Remove
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            <EnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} onEnrolled={load} />
            <CodePromptDialog
                open={disableOpen}
                onClose={() => setDisableOpen(false)}
                title="Disable Two-Factor Authentication"
                description="Enter a current code from your authenticator app (or a backup code) to confirm."
                confirmLabel="Disable"
                onConfirm={disable}
            />
            <CodePromptDialog
                open={regenerateOpen}
                onClose={() => setRegenerateOpen(false)}
                title="Regenerate Backup Codes"
                description="This invalidates your existing backup codes. Enter a current code from your authenticator app to confirm."
                confirmLabel="Regenerate"
                onConfirm={regenerate}
            />
        </div>
    );
}
