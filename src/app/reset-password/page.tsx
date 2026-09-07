"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

// Reached via a one-hour, single-use token an admin generated and shared out-of-band -- see
// admin/users/[id]/password-reset-token and the comment in migration 0079 for why this app
// has no email-delivered reset link. The token in the URL is the whole credential; no session
// is required (or created afterward -- the user logs in fresh with the new password).
function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token") || "";
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        setSubmitting(true);
        try {
            await apiFetch("/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({ token, newPassword }),
            });
            setDone(true);
        } catch (error: any) {
            toast.error(error?.message || "Failed to reset password");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background px-4">
            <motion.div variants={fadeInUp} initial="initial" animate="animate" className="w-full max-w-[440px]">
                <Card className="overflow-hidden rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                    <div className="p-8 pb-4 text-center">
                        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            {done ? <CheckCircle2 className="size-5" /> : <KeyRound className="size-5" />}
                        </div>
                        <h1 className="mb-1 text-2xl font-extrabold tracking-[-0.5px]">
                            {done ? "Password reset" : "Reset your password"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {done ? "You can now log in with your new password." : "Choose a new password for your account."}
                        </p>
                    </div>
                    <CardContent className="p-8">
                        {done ? (
                            <Button onClick={() => router.push("/login")} className="h-14 w-full rounded-2xl text-base font-bold">
                                Go to Sign In
                            </Button>
                        ) : !token ? (
                            <p className="text-center text-sm text-destructive">This link is missing its reset token.</p>
                        ) : (
                            <form onSubmit={submit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label>New Password</Label>
                                    <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={submitting} autoFocus />
                                </div>
                                <div className="space-y-2">
                                    <Label>Confirm New Password</Label>
                                    <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={submitting} />
                                </div>
                                <Button type="submit" disabled={submitting || newPassword.length < 6} className="h-14 w-full rounded-2xl text-base font-bold">
                                    {submitting ? <Loader2 className="size-5 animate-spin" /> : "Reset Password"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetPasswordForm />
        </Suspense>
    );
}
