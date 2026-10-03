"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, KeyRound, Smartphone, Loader2, CheckCircle2, Copy, Trash2 } from "lucide-react";
import { ErrorState } from "@/components/common/error-state";
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

// Shown when someone tries to close a dialog that is showing backup codes (Esc, outside click or X)
// instead of pressing Done: the codes are never shown again, so closing asks first (Section 8 #6).
function LeaveCodesWarning({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
    return (
        <Alert variant="destructive" role="alert">
            <AlertDescription className="space-y-3">
                <p>You won&apos;t be able to see these codes again. Close anyway?</p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={onStay} autoFocus>Keep codes open</Button>
                    <Button size="sm" variant="destructive" onClick={onLeave}>Close without saving</Button>
                </div>
            </AlertDescription>
        </Alert>
    );
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
    const [leaving, setLeaving] = useState(false);

    const [startError, setStartError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [confirmError, setConfirmError] = useState("");
    useEffect(() => {
        if (!open) return;
        let active = true;
        setStartError(false);
        setConfirmError("");
        setSecret(null);
        setQrCodeDataUri(null);
        setStep("scan");
        setCode("");
        setBackupCodes([]);
        setLeaving(false);
        setStarting(true);
        apiFetch<{ secret: string; qrCodeDataUri: string }>("/mfa/enroll/start", { method: "POST" })
            .then((data) => { if (!active) return; setQrCodeDataUri(data.qrCodeDataUri); setSecret(data.secret); })
            .catch(() => { if (active) setStartError(true); })
            .finally(() => { if (active) setStarting(false); });
        return () => { active = false; };
    }, [open, attempt]);

    const confirm = async () => {
        if (confirming || code.trim().length < 6) return;
        setConfirmError("");
        setConfirming(true);
        try {
            const result = await apiFetch<{ backupCodes: string[] }>("/mfa/enroll/confirm", {
                method: "POST",
                body: JSON.stringify({ token: code.trim() }),
            });
            setBackupCodes(result.backupCodes);
            setStep("backup-codes");
            // Two-factor is on from here, however the dialog is closed; refresh the status now.
            onEnrolled();
        } catch (error: any) {
            setConfirmError(error?.message || "Invalid code");
        } finally {
            setConfirming(false);
        }
    };

    const finish = () => {
        onClose();
        toast.success("Two-factor is on");
    };

    // Closing while the backup codes are showing asks first; otherwise it just closes.
    const requestClose = () => {
        if (confirming) return;
        if (step === "backup-codes") setLeaving(true);
        else onClose();
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join("\n")).then(() => toast.success("Backup codes copied"));
    };

    return (
        <StandardDialog open={open} onClose={requestClose} title="Turn on two-factor" icon={<ShieldCheck className="size-4" />} maxWidth="sm">
            {step === "scan" ? (
                <div className="space-y-4 py-2">
                    {starting ? (
                        <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                    ) : startError ? <ErrorState description="Enrollment could not be started." onRetry={() => setAttempt(value => value + 1)} /> : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.).
                            </p>
                            {qrCodeDataUri && (
                                <div className="flex justify-center">
                                    {/* An inline data: URI generated per enrolment; next/image has nothing to optimise. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrCodeDataUri} alt="QR code for your authenticator app" className="size-48 rounded-md border border-border" />
                                </div>
                            )}
                            {secret && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</Label>
                                    <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">{secret}</code>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="enroll-code">Enter the 6-digit code from your app</Label>
                                <Input id="enroll-code" autoComplete="one-time-code" pattern="[0-9]*" disabled={confirming}
                                    value={code}
                                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="max-w-[160px] text-center text-lg tracking-widest"
                                />
                            </div>
                            {confirmError && <p role="alert" className="break-words text-sm text-destructive">{confirmError}</p>}
                            <div className="flex justify-end">
                                <Button onClick={confirm} disabled={confirming || code.trim().length < 6}>
                                    {confirming && <Loader2 className="size-4 animate-spin" />}
                                    Verify and turn on
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm">
                        {backupCodes.map((backupCode) => (
                            <span className="break-all" key={backupCode}>{backupCode}</span>
                        ))}
                    </div>
                    {leaving ? <LeaveCodesWarning onStay={() => setLeaving(false)} onLeave={finish} /> : (
                        <div className="flex flex-wrap justify-between gap-2">
                            <Button variant="outline" onClick={copyBackupCodes}>
                                <Copy className="size-3.5" />
                                Copy codes
                            </Button>
                            <Button onClick={finish}>Done</Button>
                        </div>
                    )}
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
    destructive = false,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: (token: string) => Promise<void>;
    destructive?: boolean;
}) {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { if (open) { setCode(""); setError(""); } }, [open]);

    const submit = async () => {
        if (submitting || code.trim().length < 6) return;
        setError("");
        setSubmitting(true);
        try {
            await onConfirm(code.trim());
            onClose();
        } catch (error: any) {
            setError(error?.message || "Invalid code");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <StandardDialog open={open} onClose={() => { if (!submitting) onClose(); }} title={title} icon={<KeyRound className="size-4" />} maxWidth="xs">
            <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">{description}</p>
                <Label htmlFor="mfa-confirm-code">Authentication code</Label>
                <Input id="mfa-confirm-code" autoComplete="one-time-code" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={submitting}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\s/g, "").slice(0, 12))}
                    placeholder="6-digit code or backup code"
                    className="text-center text-lg tracking-widest"
                    autoFocus
                />
                {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
                <div className="flex justify-end">
                    <Button variant={destructive ? "destructive" : "default"} onClick={submit} disabled={submitting || code.trim().length < 6}>
                        {submitting && <Loader2 className="size-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </StandardDialog>
    );
}

// Sign-in & security › Two-factor (My account, UI/UX plan decision 8). Was Settings › Two-Factor
// Authentication, which only admins could open.
export function TwoFactorSection() {
    const [status, setStatus] = useState<MfaStatus | null>(null);
    const [devices, setDevices] = useState<TrustedDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
    const [leavingNewCodes, setLeavingNewCodes] = useState(false);
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const fetchSettings = (initial: boolean) => {
        if (initial) {
            setLoadError(false);
            setLoading(true);
        }
        Promise.all([
            apiFetch<MfaStatus>("/mfa/status"),
            apiFetch<TrustedDevice[]>("/mfa/trusted-devices"),
        ])
            .then(([statusData, deviceData]) => { setStatus(statusData); setDevices(Array.isArray(deviceData) ? deviceData : []); })
            .catch(() => { if (initial) setLoadError(true); else toast.error("Two-factor settings couldn't be refreshed. Reload the page to see the latest."); })
            .finally(() => { if (initial) setLoading(false); });
    };
    const load = () => fetchSettings(true);
    // After an action: refresh in place. The loading and error states replace the whole section,
    // which would close a dialog that is still showing backup codes.
    const refresh = () => fetchSettings(false);

    useEffect(load, []);

    const disable = async (token: string) => {
        await apiFetch("/mfa/disable", { method: "POST", body: JSON.stringify({ token }) });
        toast.success("Two-factor is off");
        refresh();
    };

    const regenerate = async (token: string) => {
        const result = await apiFetch<{ backupCodes: string[] }>("/mfa/regenerate-backup-codes", {
            method: "POST",
            body: JSON.stringify({ token }),
        });
        setNewBackupCodes(result.backupCodes);
        setLeavingNewCodes(false);
        refresh();
    };

    const revokeDevice = async (device: TrustedDevice) => {
        setRevokingId(device.id);
        try {
            await apiFetch(`/mfa/trusted-devices/${device.id}`, { method: "DELETE" });
            toast.success("Device removed");
            refresh();
        } catch (error: any) {
            toast.error(error?.message || "Failed to remove device");
        } finally {
            setRevokingId(null);
        }
    };

    if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading two-factor settings…</p>;
    if (loadError) return <ErrorState variant="inline" description="Two-factor settings couldn't be loaded." onRetry={load} />;

    return (
        <div className="min-w-0 space-y-4">

            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
                        {status?.mfaEnabled ? <ShieldCheck className="size-4 text-status-success-foreground" /> : <ShieldOff className="size-4 text-muted-foreground" />}
                        {status?.mfaEnabled ? "Two-factor is on" : "Two-factor is off"}
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
                            <Button className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal" variant="outline" onClick={() => setRegenerateOpen(true)}>
                                <KeyRound className="size-3.5" />
                                Regenerate backup codes
                            </Button>
                            <Button className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal" variant="destructive" onClick={() => setDisableOpen(true)}>
                                <ShieldOff className="size-3.5" />
                                Turn off two-factor
                            </Button>
                        </>
                    ) : (
                        <Button className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal" onClick={() => setEnrollOpen(true)}>
                            <ShieldCheck className="size-3.5" />
                            Turn on two-factor
                        </Button>
                    )}
                </CardContent>
            </Card>

            {status?.mfaEnabled && (
                <Card className="min-w-0 overflow-hidden py-0">
                    <CardHeader className="pt-5">
                        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
                            <Smartphone className="size-4" />
                            Remembered devices
                        </CardTitle>
                        <CardDescription>Devices you chose to trust skip the code prompt for 30 days.</CardDescription>
                    </CardHeader>
                    {devices.length === 0 ? (
                        <p className="p-4 pt-0 text-sm text-muted-foreground">No remembered devices.</p>
                    ) : (
                        <div className="divide-y border-t border-border">
                            {devices.map((device) => (
                                <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    <div className="min-w-0 max-w-full break-words">
                                        <p className="text-sm font-medium">{describeDevice(device.userAgent)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {device.ipAddress || "Unknown IP"} · trusted {formatWorkspaceDateTime(device.createdAt)}
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

            <StandardDialog open={newBackupCodes.length > 0} onClose={() => setLeavingNewCodes(true)} title="New backup codes" maxWidth="xs">
                <p className="mb-4 text-sm text-muted-foreground">Save these codes before closing. They replace your previous codes and will not be shown again.</p>
                <div className="grid grid-cols-1 gap-2 rounded-md bg-muted p-4 font-mono text-sm sm:grid-cols-2">
                    {newBackupCodes.map(code => <span className="break-all" key={code}>{code}</span>)}
                </div>
                <div className="mt-4">
                    {leavingNewCodes
                        ? <LeaveCodesWarning onStay={() => setLeavingNewCodes(false)} onLeave={() => setNewBackupCodes([])} />
                        : <Button onClick={() => setNewBackupCodes([])}>Done</Button>}
                </div>
            </StandardDialog>
            <EnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} onEnrolled={refresh} />
            <CodePromptDialog
                open={disableOpen}
                onClose={() => setDisableOpen(false)}
                title="Turn off two-factor"
                description="Enter a current code from your authenticator app (or a backup code) to confirm."
                confirmLabel="Turn off"
                onConfirm={disable}
                destructive
            />
            <CodePromptDialog
                open={regenerateOpen}
                onClose={() => setRegenerateOpen(false)}
                title="Regenerate backup codes"
                description="This invalidates your existing backup codes. Enter a current code from your authenticator app to confirm."
                confirmLabel="Regenerate"
                onConfirm={regenerate}
            />
        </div>
    );
}
