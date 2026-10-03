"use client";

import { Suspense, useEffect, useState } from "react";
import { PasswordRuleList, passwordMeetsRule, type PasswordRule } from "@/components/account/password-rule";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { BrandLogo } from "@/components/brand/brand-logo";

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
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);
    // Whether the link still works, and the workspace's password rule (checked when the page opens).
    const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">("checking");
    const [rule, setRule] = useState<PasswordRule | null>(null);
    useEffect(() => {
        if (!token) { setLinkState("invalid"); return; }
        fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
            .then((response) => response.json())
            .then((data) => { setLinkState(data?.valid ? "valid" : "invalid"); setRule(data?.passwordRule ?? null); })
            .catch(() => setLinkState("valid"));
    }, [token]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting || !token) return;
        setError("");
        if (!passwordMeetsRule(rule, newPassword)) {
            setError("The new password doesn't meet the rule below it.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("The passwords don't match.");
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
            setError(error?.message || "Failed to reset password");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-6">
            <motion.div variants={fadeInUp} initial="initial" animate="animate" className="w-full max-w-[440px]">
                <BrandLogo className="mx-auto mb-6 h-9" />
                <Card className="overflow-hidden rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                    <div className="px-5 pt-6 pb-4 text-center sm:px-8">
                        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            {done ? <CheckCircle2 className="size-5" /> : <KeyRound className="size-5" />}
                        </div>
                        <h1 className="mb-1 text-2xl font-semibold tracking-[-0.5px]">
                            {done ? "Password reset" : "Reset your password"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {done ? "You can now log in with your new password." : "Choose a new password for your account."}
                        </p>
                    </div>
                    <CardContent className="p-5 sm:p-8">
                        {done ? (
                            <Button onClick={() => router.push("/login")} className="h-14 w-full rounded-2xl text-base font-bold">
                                Go to sign in
                            </Button>
                        ) : linkState === "checking" ? (
                            <p role="status" className="text-center text-sm text-muted-foreground">Checking your link…</p>
                        ) : linkState === "invalid" ? (
                            <div className="space-y-4"><p role="alert" className="text-sm text-destructive">{token ? "This reset link has expired or has already been used. Links work once, for an hour." : "This reset link is incomplete."} Ask your administrator for a new one.</p><Button variant="outline" className="w-full" onClick={() => router.push("/login")}>Back to sign in</Button></div>
                        ) : (
                            <form onSubmit={submit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="reset-password">New password</Label>
                                    <Input id="reset-password" required autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={submitting} autoFocus aria-describedby="reset-password-rule" />
                                    <PasswordRuleList id="reset-password-rule" rule={rule} password={newPassword} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reset-confirm">Confirm new password</Label>
                                    <Input id="reset-confirm" required autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={submitting} />
                                </div>
                                {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
                                <Button type="submit" disabled={submitting || !newPassword || !confirmPassword} className="h-14 w-full rounded-2xl text-base font-bold">
                                    {submitting ? <><Loader2 className="size-5 animate-spin" /> Resetting…</> : "Reset password"}
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
