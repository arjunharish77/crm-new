"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        setError("");
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }
        setSaving(true);
        try {
            await apiFetch("/auth/change-password", {
                method: "POST",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            toast.success("Password changed");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            setError(error?.message || "Failed to change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Password" description="Change your account password." />

            <Card className="max-w-md">
                <CardHeader>
                    <CardTitle className="text-base">Change Password</CardTitle>
                    <CardDescription>Your new password must meet your workspace&apos;s password policy.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="current-password">Current Password</Label>
                            <Input id="current-password" autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={saving} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-password">New Password</Label>
                            <Input id="new-password" autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={saving} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <Input id="confirm-password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={saving} required />
                        </div>
                        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="size-4 animate-spin" />}
                            Change Password
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
