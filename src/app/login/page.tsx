"use client";

import Link from "next/link";
import { PasswordRuleList, passwordMeetsRule, type PasswordRule } from "@/components/account/password-rule";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { safeReturnPath } from "@/lib/safe-return-path";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { BrandLogo } from "@/components/brand/brand-logo";

const formSchema = z.object({
    email: z.string().email("Enter your email address, like name@company.com"),
    // Only required here: the workspace's rule applies when a password is set, not when signing in.
    password: z.string().min(1, "Enter your password"),
});

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const [submitError, setSubmitError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [resetAvailable, setResetAvailable] = useState(false);
    useEffect(() => {
        fetch("/api/auth/forgot-password").then((response) => response.json()).then((data) => setResetAvailable(!!data?.available)).catch(() => setResetAvailable(false));
    }, []);

    // "Default landing page" (gap checklist Module 10's user workspace personalization item) --
    // redirects to the user's own saved preference (if any) instead of always /dashboard.
    // Falls back to /dashboard on any failure (e.g. a fresh account with no preference set yet).
    async function redirectAfterLogin() {
        await login();
        // A link from an email or notification (?from=, added by the proxy and the sign-in
        // redirects) wins over the saved landing page (UI/UX plan B16).
        const returnTo = safeReturnPath(new URLSearchParams(window.location.search).get("from"), window.location.origin);
        if (returnTo) {
            router.push(returnTo);
            return;
        }
        try {
            const personalization = await apiFetch("/settings/personalization");
            router.push(personalization?.defaultLandingPage || "/dashboard");
        } catch {
            router.push("/dashboard");
        }
    }

    // Step 2 of login when the account has MFA enabled -- see auth/login/route.ts, which
    // returns { mfaRequired, mfaToken } instead of a real session in that case.
    const [mfaToken, setMfaToken] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const [rememberDevice, setRememberDevice] = useState(false);
    const [verifying, setVerifying] = useState(false);

    // Step triggered when SecurityPolicy.passwordExpiryDays has passed for this account -- see
    // auth/login/route.ts and auth/mfa/verify/route.ts, both of which can return
    // { passwordExpired, passwordChangeToken } instead of a real session.
    const [passwordChangeToken, setPasswordChangeToken] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);
    // The workspace's password rule, sent with the expiry response.
    const [passwordRule, setPasswordRule] = useState<PasswordRule | null>(null);

    const { control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (loading) return;
        setSubmitError("");
        setLoading(true);
        try {
            const res = await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify(values),
            });

            if (res.mfaRequired) {
                setMfaToken(res.mfaToken);
                return;
            }

            if (res.passwordExpired) {
                setPasswordChangeToken(res.passwordChangeToken);
                setPasswordRule(res.passwordRule ?? null);
                return;
            }

            await redirectAfterLogin();
            toast.success("Logged in successfully");
        } catch (error: any) {
            setSubmitError(error.message || "Failed to login");
        } finally {
            setLoading(false);
        }
    }

    async function onVerifyMfa(event: React.FormEvent) {
        event.preventDefault();
        if (mfaCode.trim().length < 6) return;
        if (verifying) return;
        setSubmitError("");
        setVerifying(true);
        try {
            const res = await apiFetch("/auth/mfa/verify", {
                method: "POST",
                body: JSON.stringify({ mfaToken, code: mfaCode.trim(), rememberDevice }),
            });

            if (res.passwordExpired) {
                setMfaToken(null);
                setPasswordChangeToken(res.passwordChangeToken);
                setPasswordRule(res.passwordRule ?? null);
                return;
            }

            await redirectAfterLogin();
            toast.success("Logged in successfully");
        } catch (error: any) {
            setSubmitError(error.message || "Invalid code");
        } finally {
            setVerifying(false);
        }
    }

    async function onChangeExpiredPassword(event: React.FormEvent) {
        event.preventDefault();
        if (changingPassword) return;
        setSubmitError("");
        if (!passwordMeetsRule(passwordRule, newPassword)) {
            setSubmitError("The new password doesn't meet the rule below it.");
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setSubmitError("The new passwords don't match.");
            return;
        }
        setChangingPassword(true);
        try {
            const res = await apiFetch("/auth/change-expired-password", {
                method: "POST",
                body: JSON.stringify({ passwordChangeToken, newPassword }),
            });
            await redirectAfterLogin();
            toast.success("Password changed and logged in");
        } catch (error: any) {
            setSubmitError(error.message || "Failed to change password");
        } finally {
            setChangingPassword(false);
        }
    }

    return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-6">
            <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                className="w-full max-w-[440px]"
            >
                <BrandLogo className="mx-auto mb-6 h-9" />
                <Card className="overflow-hidden rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                    <div className="px-5 pt-6 pb-4 text-center sm:px-8">
                        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            {passwordChangeToken ? <KeyRound className="size-5" /> : mfaToken ? <ShieldCheck className="size-5" /> : <LogIn className="size-5" />}
                        </div>
                        <h1 className="mb-1 text-2xl font-semibold tracking-[-0.5px]">
                            {passwordChangeToken ? "Update your password" : mfaToken ? "Two-factor authentication" : "Welcome back"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {passwordChangeToken
                                ? "Your password has expired. Choose a new one to continue."
                                : mfaToken
                                    ? "Enter the code from your authenticator app"
                                    : "Log in to your account to continue"}
                        </p>
                    </div>

                    {submitError && <p role="alert" className="mx-5 break-words text-sm text-destructive sm:mx-8">{submitError}</p>}
                    {passwordChangeToken ? (
                        <CardContent className="p-5 sm:p-8">
                            <form onSubmit={onChangeExpiredPassword} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="expired-password">New password</Label>
                                    <Input
                                        type="password"
                                        id="expired-password" autoComplete="new-password" required
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                        aria-describedby="expired-password-rule"
                                        autoFocus
                                    />
                                    <PasswordRuleList id="expired-password-rule" rule={passwordRule} password={newPassword} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expired-confirm">Confirm new password</Label>
                                    <Input
                                        type="password"
                                        id="expired-confirm" autoComplete="new-password" required
                                        value={confirmNewPassword}
                                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                    />
                                </div>
                                <Button type="submit" disabled={changingPassword || !newPassword || !confirmNewPassword} className="min-h-14 h-auto w-full whitespace-normal py-3 rounded-2xl text-base font-bold">
                                    {changingPassword ? <><Loader2 className="size-5 animate-spin" /> Updating…</> : "Update password and sign in"}
                                </Button>
                            </form>
                        </CardContent>
                    ) : mfaToken ? (
                        <CardContent className="p-5 sm:p-8">
                            <form onSubmit={onVerifyMfa} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="mfa-code">Authentication code</Label>
                                    <Input
                                        id="mfa-code" autoComplete="one-time-code" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                                        aria-describedby="mfa-code-help"
                                        value={mfaCode}
                                        onChange={(event) => setMfaCode(event.target.value.replace(/\s/g, "").slice(0, 12))}
                                        placeholder="000000"
                                            autoFocus
                                        disabled={verifying}
                                        className="text-center text-lg tracking-widest"
                                    />
                                    <p id="mfa-code-help" className="text-sm text-muted-foreground">The 6-digit code from your authenticator app, or one of your backup codes.</p>
                                </div>

                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Checkbox checked={rememberDevice} onCheckedChange={(checked) => setRememberDevice(!!checked)} disabled={verifying} />
                                    Remember this device for 30 days
                                </label>

                                <Button type="submit" disabled={verifying || mfaCode.trim().length < 6} className="min-h-14 h-auto w-full whitespace-normal py-3 rounded-2xl text-base font-bold">
                                    {verifying ? <><Loader2 className="size-5 animate-spin" /> Verifying…</> : "Verify"}
                                </Button>

                                <button
                                    type="button"
                                    disabled={verifying}
                                    onClick={() => { setMfaToken(null); setMfaCode(""); setRememberDevice(false); setSubmitError(""); }}
                                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                                >
                                    Back to sign in
                                </button>
                            </form>
                        </CardContent>
                    ) : (
                    <CardContent className="p-5 sm:p-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <Controller
                                name="email"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <Label htmlFor="login-email">Email address</Label>
                                        <div className="relative">
                                            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                {...field}
                                                className="pl-9"
                                                id="login-email"
                                                type="email"
                                                autoComplete="username"
                                                placeholder="name@company.com"
                                                disabled={loading}
                                                aria-invalid={!!errors.email}
                                            />
                                        </div>
                                        {errors.email ? (
                                            <p className="text-xs text-destructive">{errors.email.message}</p>
                                        ) : null}
                                    </div>
                                )}
                            />

                            <Controller
                                name="password"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <Label htmlFor="login-password">Password</Label>
                                            {/* Shown only when the deployment can send the email (decision 16). */}
                                            {resetAvailable ? <Link href="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link> : null}
                                        </div>
                                        <div className="relative">
                                            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                {...field}
                                                id="login-password"
                                                autoComplete="current-password"
                                                type={showPassword ? "text" : "password"}
                                                className="pl-9 pr-9"
                                                disabled={loading}
                                                aria-invalid={!!errors.password}
                                            />
                                            <button
                                                type="button"
                                                aria-label={showPassword ? "Hide password" : "Show password"}
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                            </button>
                                        </div>
                                        {errors.password ? (
                                            <p className="text-sm text-destructive">{errors.password.message}</p>
                                        ) : null}
                                    </div>
                                )}
                            />

                            <Button type="submit" disabled={loading} className="mt-2 min-h-14 h-auto w-full whitespace-normal py-3 rounded-2xl text-base font-bold">
                                {loading ? <><Loader2 className="size-5 animate-spin" /> Signing in…</> : "Sign in"}
                            </Button>
                        </form>
                    </CardContent>
                    )}
                </Card>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Need help? Contact your administrator
                </p>
            </motion.div>
        </div>
    );
}
