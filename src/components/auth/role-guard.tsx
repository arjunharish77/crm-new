
"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loginPathFromHere } from "@/lib/safe-return-path";

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

// "Tenant Admin" uses the server's own definition (`isTenantAdmin`: All-records access or full
// admin module access), so the Settings guard and the admin APIs agree on who is an admin. It
// used to match on the role's *name* ("…admin…"), which let a "Sales admin" with Team access
// into Settings where every save failed, and kept an All-access "Manager" out.
function roleMatches(userRole: unknown, requiredRole: string, isPlatformAdmin?: boolean, isTenantAdmin?: boolean) {
    if (isPlatformAdmin) return true;
    // A PARTNER-flagged role never satisfies any requiredRole check here, regardless
    // of what an admin happens to name it — partner exclusion from admin/settings
    // screens must not depend on name-string matching.
    if (userRole && typeof userRole === "object" && (userRole as any).permissions?.isPartnerRole) {
        return false;
    }
    const required = requiredRole.toLowerCase();
    if (required === "tenant admin") return !!isTenantAdmin;
    return roleName(userRole).toLowerCase() === required;
}

export function RoleGuard({ children, requiredRole, fallbackRoute = "/dashboard" }: RoleGuardProps) {
    const { user, isLoading, isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                router.push(loginPathFromHere());
                return;
            }

            if (!roleMatches(user?.role, requiredRole, user?.isPlatformAdmin, (user as any)?.isTenantAdmin)) {
                // If user doesn't have the role, redirect
                router.push(fallbackRoute);
            }
        }
    }, [user, isLoading, isAuthenticated, requiredRole, fallbackRoute, router]);

    if (isLoading) {
        return <div className="flex items-center justify-center p-8">Loading authorization...</div>;
    }

    if (!user || !roleMatches(user.role, requiredRole, user.isPlatformAdmin, (user as any).isTenantAdmin)) {
        return null; // Don't render children while redirecting
    }

    return <>{children}</>;
}
