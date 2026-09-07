'use client';

import { useAuth } from '@/providers/auth-provider';
import { Wrench } from 'lucide-react';

// Distinct from tenant suspension (which blocks access outright) -- a tenant can be fully
// usable but flagged with an informational banner (e.g. "scheduled maintenance tonight",
// "data migration in progress, some numbers may be temporarily off"). Sourced from the
// current user's own profile (populated by getCurrentUser/auth-admin-postgres.ts), not a
// separate fetch, so it appears immediately alongside everything else auth-gated.
export function MaintenanceBanner() {
    const { user } = useAuth();

    if (!(user as any)?.maintenanceActive) {
        return null;
    }

    return (
        <div className="bg-amber-500 text-amber-950 border-b border-amber-600">
            <div className="container mx-auto flex items-center gap-3 px-4 py-2">
                <Wrench className="h-5 w-5 shrink-0" />
                <span className="font-medium">
                    {(user as any).maintenanceMessage || 'This workspace is undergoing scheduled maintenance. Some features may be temporarily unavailable.'}
                </span>
            </div>
        </div>
    );
}
