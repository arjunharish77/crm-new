"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    setupToken: z.string().trim().min(1, "Enter the setup token from the server settings"),
});

export default function BootstrapPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [statusError, setStatusError] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [created, setCreated] = useState(false);
    const [needsBootstrap, setNeedsBootstrap] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            setupToken: "",
        },
    });

    const checkStatus = useCallback(async () => {
        setCheckingStatus(true);
        setStatusError(false);
        try {
            const res = await apiFetch("/auth/bootstrap/status");
            setNeedsBootstrap(res.needsBootstrap);
        } catch {
            setStatusError(true);
        } finally {
            setCheckingStatus(false);
        }
    }, []);

    useEffect(() => { checkStatus(); }, [checkStatus]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (loading || created) return;
        setSubmitError("");
        setLoading(true);
        try {
            await apiFetch("/auth/bootstrap", {
                method: "POST",
                body: JSON.stringify(values),
            });

            toast.success("Platform admin created successfully!");
            setCreated(true);
        } catch (error: any) {
            // A wrong or missing setup token is a 403; show the server's own wording for it.
            setSubmitError((error.status === 403 && error.originalMessage) || error.message || "Failed to create platform admin");
        } finally {
            setLoading(false);
        }
    }

    if (checkingStatus) {
        return (
            <div className="flex min-h-dvh w-full items-center justify-center px-4 py-6">
                <Card className="mx-auto max-w-sm w-full">
                    <CardHeader>
                        <CardTitle role="status">Checking Bootstrap Status...</CardTitle>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (statusError) return <div className="flex min-h-dvh items-center justify-center px-4 py-6">
        <Card className="w-full max-w-sm"><CardHeader><CardTitle>Setup status unavailable</CardTitle></CardHeader>
            <CardContent className="space-y-4"><p role="alert" className="text-sm">Could not check whether setup is needed. Try again.</p>
                <Button onClick={checkStatus}>Try again</Button></CardContent></Card>
    </div>;

    if (created || !needsBootstrap) {
        return (
            <div className="flex min-h-dvh w-full items-center justify-center px-4 py-6">
                <Card className="mx-auto max-w-sm w-full">
                    <CardHeader>
                        <CardTitle>Bootstrap Complete</CardTitle>
                        <CardDescription>
                            {created ? "Platform admin created successfully. Sign in to continue." : "A platform admin already exists. Sign in to continue."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent><Button onClick={() => router.push("/login")}>Go to Sign In</Button></CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-dvh w-full items-center justify-center px-4 py-6">
            <Card className="mx-auto max-w-sm w-full">
                <CardHeader>
                    <CardTitle className="text-2xl">Bootstrap Platform Admin</CardTitle>
                    <CardDescription>
                        Create the first platform administrator account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="setupToken"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Setup token</FormLabel>
                                        <FormControl>
                                            <Input disabled={loading} autoComplete="off" type="password" {...field} />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">The BOOTSTRAP_TOKEN value from the server&apos;s settings file.</p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl>
                                            <Input disabled={loading} autoComplete="name" placeholder="John Doe" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input disabled={loading} type="email" autoComplete="username" placeholder="admin@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input disabled={loading} autoComplete="new-password" type="password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <p className="text-xs text-muted-foreground">Use at least 8 characters for your password.</p>
                            {submitError && <p role="alert" className="break-words text-sm text-destructive">{submitError}</p>}
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Creating..." : "Create Platform Admin"}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
