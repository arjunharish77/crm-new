"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/brand-logo";

// "Forgot password?" (decision 16). The answer is the same whether or not the email belongs to
// an account, so the page can't be used to find out who has one.
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [sentMessage, setSentMessage] = useState("");

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (sending) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter your email address, like name@company.com"); return; }
        setError("");
        setSending(true);
        try {
            const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setError(data?.message || "That didn't work. Try again in a few minutes."); return; }
            setSentMessage(data?.message || "If an account uses that email, we've sent it a link to reset the password.");
        } catch {
            setError("That didn't work. Check your connection and try again.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-6">
            <div className="w-full max-w-[440px]">
                <BrandLogo className="mx-auto mb-6 h-9" />
                <Card className="w-full overflow-hidden">
                    <div className="px-5 pt-6 pb-2 text-center sm:px-8">
                        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            {sentMessage ? <MailCheck className="size-5" aria-hidden /> : <KeyRound className="size-5" aria-hidden />}
                        </div>
                        <h1 className="mb-1 text-2xl font-semibold">{sentMessage ? "Check your email" : "Forgot your password?"}</h1>
                        <p className="text-sm text-muted-foreground">{sentMessage ? "" : "Enter the email you sign in with and we'll send you a link to choose a new password."}</p>
                    </div>
                    <CardContent className="p-5 sm:p-8">
                        {sentMessage ? (
                            <div className="space-y-4">
                                <p role="status" className="text-sm">{sentMessage}</p>
                                <p className="text-sm text-muted-foreground">Nothing after a few minutes? Check your spam folder, or ask your administrator for a reset link.</p>
                                <Button asChild variant="outline" className="w-full"><Link href="/login">Back to sign in</Link></Button>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="space-y-5" noValidate>
                                <div className="space-y-1.5">
                                    <Label htmlFor="forgot-email">Email</Label>
                                    <Input id="forgot-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? "forgot-email-error" : undefined} autoFocus />
                                    {error ? <p id="forgot-email-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
                                </div>
                                <Button type="submit" className="h-11 w-full" isLoading={sending}>Send reset link</Button>
                                <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
