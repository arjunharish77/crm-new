"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRuleList, passwordChecks, useWorkspacePasswordRule } from "@/components/account/password-rule";

// Sign-in & security › Password (My account, UI/UX plan decision 8).
export function PasswordSection() {
    const policy = useWorkspacePasswordRule();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const checks = policy ? passwordChecks(policy, newPassword) : [];
    const mismatch = !!confirmPassword && newPassword !== confirmPassword;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        setError("");
        if (checks.some((check) => !check.met)) {
            setError("The new password doesn't meet the rule below.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("The new passwords don't match.");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
            toast.success("Password changed");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (caught: any) {
            setError(caught?.message || "The password couldn't be changed.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
            <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={saving} required />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={saving} required aria-describedby="new-password-rule" />
                <PasswordRuleList id="new-password-rule" rule={policy} password={newPassword} />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={saving} required aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "confirm-password-error" : undefined} />
                {mismatch ? <p id="confirm-password-error" className="text-sm text-destructive">The passwords don&apos;t match.</p> : null}
            </div>
            {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
            <Button type="submit" isLoading={saving} disabled={!currentPassword || !newPassword || !confirmPassword}>Change password</Button>
        </form>
    );
}
