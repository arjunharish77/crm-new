"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user) {
            // Only redirect to dashboard if explicitly not a platform admin
            // This avoids redirecting if the property is still loading from /auth/me
            if (user.isPlatformAdmin === false) {
                router.push("/dashboard");
            }
        } else if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user || !user.isPlatformAdmin) {
        return null; // Will redirect
    }

    return <>{children}</>;
}
