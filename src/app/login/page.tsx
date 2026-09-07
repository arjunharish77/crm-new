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
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // "Default landing page" (gap checklist Module 10's user workspace personalization item) --
    // redirects to the user's own saved preference (if any) instead of always /dashboard.
    // Falls back to /dashboard on any failure (e.g. a fresh account with no preference set yet).
    async function redirectAfterLogin(accessToken: string) {
        await login(accessToken);
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

            await redirectAfterLogin(res.access_token);
            toast.success("Logged in successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to login");
        } finally {
            setLoading(false);
        }
    }

    async function onVerifyMfa(event: React.FormEvent) {
        event.preventDefault();
        if (mfaCode.trim().length < 6) return;
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

            await redirectAfterLogin(res.access_token);
            toast.success("Logged in successfully");
        } catch (error: any) {
            toast.error(error.message || "Invalid code");
        } finally {
            setVerifying(false);
        }
    }

    async function onChangeExpiredPassword(event: React.FormEvent) {
        event.preventDefault();
        if (newPassword.length < 6) return;
        if (newPassword !== confirmNewPassword) {
            toast.error("New passwords do not match");
            return;
        }
        setChangingPassword(true);
        try {
            const res = await apiFetch("/auth/change-expired-password", {
                method: "POST",
                body: JSON.stringify({ passwordChangeToken, newPassword }),
            });
            await redirectAfterLogin(res.access_token);
            toast.success("Password changed and logged in");
        } catch (error: any) {
            toast.error(error.message || "Failed to change password");
        } finally {
            setChangingPassword(false);
        }
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background px-4">
            <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                className="w-full max-w-[440px]"
            >
                <Card className="overflow-hidden rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                    <div className="p-8 pb-4 text-center">
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

                    {passwordChangeToken ? (
                        <CardContent className="p-8">
                            <form onSubmit={onChangeExpiredPassword} className="space-y-6">
                                <div className="space-y-2">
                                    <Label>New Password</Label>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Confirm New Password</Label>
                                    <Input
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                                        disabled={changingPassword}
                                    />
                                </div>
                                <Button type="submit" disabled={changingPassword || newPassword.length < 6} className="h-14 w-full rounded-2xl text-base font-bold">
                                    {changingPassword ? <Loader2 className="size-5 animate-spin" /> : "Update Password & Sign In"}
                                </Button>
                            </form>
                        </CardContent>
                    ) : mfaToken ? (
                        <CardContent className="p-8">
                            <form onSubmit={onVerifyMfa} className="space-y-6">
                                <div className="space-y-2">
                                    <Label>Authentication code</Label>
                                    <Input
                                        value={mfaCode}
                                        onChange={(event) => setMfaCode(event.target.value.replace(/\s/g, "").slice(0, 12))}
                                        placeholder="000000"
                                        inputMode="numeric"
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

                                <Button type="submit" disabled={verifying || mfaCode.trim().length < 6} className="h-14 w-full rounded-2xl text-base font-bold">
                                    {verifying ? <Loader2 className="size-5 animate-spin" /> : "Verify"}
                                </Button>

                                <button
                                    type="button"
                                    onClick={() => { setMfaToken(null); setMfaCode(""); }}
                                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                                >
                                    Back to sign in
                                </button>
                            </form>
                        </CardContent>
                    ) : (
                    <CardContent className="p-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <Controller
                                name="email"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <Label>Email address</Label>
                                        <div className="relative">
                                            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                {...field}
                                                className="pl-9"
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
                                        <Label>Password</Label>
                                        <div className="relative">
                                            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                {...field}
                                                type={showPassword ? "text" : "password"}
                                                className="pl-9 pr-9"
                                                disabled={loading}
                                                aria-invalid={!!errors.password}
                                            />
                                            <button
                                                type="button"
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

                            <Button type="submit" disabled={loading} className="mt-2 h-14 w-full rounded-2xl text-base font-bold">
                                {loading ? <Loader2 className="size-5 animate-spin" /> : "Sign in"}
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
