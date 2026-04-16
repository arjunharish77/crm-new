"use client";

import { useState, useEffect } from "react";
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
});

export default function BootstrapPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [needsBootstrap, setNeedsBootstrap] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
        },
    });

    useEffect(() => {
        // Check if bootstrap is needed
        async function checkStatus() {
            try {
                const res = await apiFetch("/auth/bootstrap/status");
                setNeedsBootstrap(res.needsBootstrap);
                if (!res.needsBootstrap) {
                    toast.info("Platform admin already exists. Redirecting to login...");
                    setTimeout(() => router.push("/login"), 2000);
                }
            } catch (error) {
                toast.error("Failed to check bootstrap status");
            } finally {
                setCheckingStatus(false);
            }
        }
        checkStatus();
    }, [router]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        try {
            await apiFetch("/auth/bootstrap", {
                method: "POST",
                body: JSON.stringify(values),
            });

            toast.success("Platform admin created successfully!");
            setTimeout(() => router.push("/login"), 2000);
        } catch (error: any) {
            toast.error(error.message || "Failed to create platform admin");
        } finally {
            setLoading(false);
        }
    }

    if (checkingStatus) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Card className="mx-auto max-w-sm w-full">
                    <CardHeader>
                        <CardTitle>Checking Bootstrap Status...</CardTitle>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (!needsBootstrap) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Card className="mx-auto max-w-sm w-full">
                    <CardHeader>
                        <CardTitle>Bootstrap Complete</CardTitle>
                        <CardDescription>
                            Platform admin already exists. Redirecting to login...
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full items-center justify-center px-4">
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
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="John Doe" {...field} />
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
                                            <Input placeholder="admin@example.com" {...field} />
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
                                            <Input type="password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
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
