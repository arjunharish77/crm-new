
"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RoleGuardProps {
    children: React.ReactNode;
    requiredRole: string; // e.g. "Admin"
    fallbackRoute?: string;
}

export function RoleGuard({ children, requiredRole, fallbackRoute = "/dashboard" }: RoleGuardProps) {
    const { user, isLoading, isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                router.push("/login");
                return;
            }

            if (user?.role !== requiredRole) {
                // If user doesn't have the role, redirect
                router.push(fallbackRoute);
            }
        }
    }, [user, isLoading, isAuthenticated, requiredRole, fallbackRoute, router]);

    if (isLoading) {
        return <div className="flex items-center justify-center p-8">Loading authorization...</div>;
    }

    if (!user || user.role !== requiredRole) {
        return null; // Don't render children while redirecting
    }

    return <>{children}</>;
}
