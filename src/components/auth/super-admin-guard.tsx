"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Box, CircularProgress } from "@mui/material";

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
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'surfaceContainerLowest' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user || !user.isPlatformAdmin) {
        return null; // Will redirect
    }

    return <>{children}</>;
}
