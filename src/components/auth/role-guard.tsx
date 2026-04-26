
"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RoleGuardProps {
    children: React.ReactNode;
    requiredRole: string; // e.g. "Admin"
    fallbackRoute?: string;
}

function roleName(userRole: unknown) {
    if (typeof userRole === "string") return userRole;
    if (userRole && typeof userRole === "object" && "name" in userRole) {
        return String((userRole as { name?: unknown }).name ?? "");
    }
    return "";
}

function roleMatches(userRole: unknown, requiredRole: string, isPlatformAdmin?: boolean) {
    if (isPlatformAdmin) return true;
    const current = roleName(userRole).toLowerCase();
    const required = requiredRole.toLowerCase();
    if (current === required) return true;

    const adminAliases = new Set(["tenant admin", "admin", "administrator", "demo admin"]);
    if (required === "tenant admin" && adminAliases.has(current)) return true;
    return false;
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

            if (!roleMatches(user?.role, requiredRole, user?.isPlatformAdmin)) {
                // If user doesn't have the role, redirect
                router.push(fallbackRoute);
            }
        }
    }, [user, isLoading, isAuthenticated, requiredRole, fallbackRoute, router]);

    if (isLoading) {
        return <div className="flex items-center justify-center p-8">Loading authorization...</div>;
    }

    if (!user || !roleMatches(user.role, requiredRole, user.isPlatformAdmin)) {
        return null; // Don't render children while redirecting
    }

    return <>{children}</>;
}
