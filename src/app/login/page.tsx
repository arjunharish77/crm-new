"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

const formSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const [submitError, setSubmitError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // "Default landing page" (gap checklist Module 10's user workspace personalization item) --
    // redirects to the user's own saved preference (if any) instead of always /dashboard.
    // Falls back to /dashboard on any failure (e.g. a fresh account with no preference set yet).
    async function redirectAfterLogin() {
        await login();
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
        if (changingPassword || newPassword.length < 6) return;
        setSubmitError("");
        if (newPassword !== confirmNewPassword) {
            setSubmitError("New passwords do not match");
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
                <Card className="overflow-hidden rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                    <div className="px-5 pt-6 pb-4 text-center sm:px-8">
                        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            {passwordChangeToken ? <KeyRound className="size-5" /> : mfaToken ? <ShieldCheck className="size-5" /> : <LogIn className="size-5" />}
                        </div>
                        <h1 className="mb-1 text-2xl font-extrabold tracking-[-0.5px]">
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
                                    <Label htmlFor="expired-password">New Password</Label>
                                    <Input
                                        type="password"
                                        id="expired-password" autoComplete="new-password" required
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expired-confirm">Confirm New Password</Label>
                                    <Input
                                        type="password"
                                        id="expired-confirm" autoComplete="new-password" required
                                        value={confirmNewPassword}
                                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                    />
                                </div>
                                <Button type="submit" disabled={changingPassword || newPassword.length < 6} className="min-h-14 h-auto w-full whitespace-normal py-3 rounded-2xl text-base font-bold">
                                    {changingPassword ? <><Loader2 className="size-5 animate-spin" /> Updating…</> : "Update Password & Sign In"}
                                </Button>
                            </form>
                        </CardContent>
                    ) : mfaToken ? (
                        <CardContent className="p-5 sm:p-8">
                            <form onSubmit={onVerifyMfa} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="mfa-code">Authentication code</Label>
                                    <Input
                                        id="mfa-code" autoComplete="one-time-code"
                                        value={mfaCode}
                                        onChange={(event) => setMfaCode(event.target.value.replace(/\s/g, "").slice(0, 12))}
                                        placeholder="000000"
                                            autoFocus
                                        disabled={verifying}
                                        className="text-center text-lg tracking-widest"
                                    />
                                    <p className="text-xs text-muted-foreground">You can also use one of your backup codes.</p>
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
                                        <Label htmlFor="login-password">Password</Label>
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
                                            <p className="text-xs text-destructive">{errors.password.message}</p>
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
