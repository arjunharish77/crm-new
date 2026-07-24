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
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2 } from "lucide-react";
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

            login(res.access_token);
            toast.success("Logged in successfully");
            router.push("/dashboard");
        } catch (error: any) {
            toast.error(error.message || "Failed to login");
        } finally {
            setLoading(false);
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
                            <LogIn className="size-5" />
                        </div>
                        <h1 className="mb-1 text-2xl font-extrabold tracking-[-0.5px]">Welcome back</h1>
                        <p className="text-sm text-muted-foreground">Log in to your account to continue</p>
                    </div>

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
                </Card>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Need help? Contact your administrator
                </p>
            </motion.div>
        </div>
    );
}
