"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
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
            toast.error(error?.message || "Failed to change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-bold">
                    <KeyRound className="size-5" />
                    Password
                </h1>
                <p className="text-sm text-muted-foreground">Change your account password.</p>
            </div>

            <Card className="max-w-md">
                <CardHeader>
                    <CardTitle className="text-base">Change Password</CardTitle>
                    <CardDescription>Your new password must meet your workspace&apos;s password policy.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Current Password</Label>
                            <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={saving} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>New Password</Label>
                            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={saving} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Confirm New Password</Label>
                            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={saving} required />
                        </div>
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
