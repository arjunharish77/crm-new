"use client";

import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut } from "lucide-react";

export function ImpersonationBanner() {
    const { user, login } = useAuth();

    if (!user?.isImpersonating) return null;

    const stopImpersonation = () => {
        const adminToken = sessionStorage.getItem('adminToken');
        if (adminToken) {
            login(adminToken);
            sessionStorage.removeItem('adminToken');
            window.location.href = '/platform-admin/tenants';
        } else {
            // Fallback if token lost
            window.location.href = '/login';
        }
    };

    return (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">
                    You are impersonating <strong>{user.email}</strong> as an Admin.
                </span>
            </div>
            <Button
                variant="secondary"
                size="sm"
                onClick={stopImpersonation}
                className="bg-white text-amber-600 hover:bg-amber-50 border-0"
            >
                <LogOut className="h-4 w-4 mr-2" />
                Stop Impersonation
            </Button>
        </div>
    );
}
