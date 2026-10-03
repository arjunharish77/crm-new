'use client';

import { useEffect, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';

const DISMISS_KEY = 'unnatify.maintenanceBannerDismissed';

// Distinct from tenant suspension (which blocks access outright) -- a tenant can be fully
// usable but flagged with an informational banner (e.g. "scheduled maintenance tonight",
// "data migration in progress, some numbers may be temporarily off"). Sourced from the
// current user's own profile (populated by getCurrentUser/auth-admin-postgres.ts), not a
// separate fetch, so it appears immediately alongside everything else auth-gated.
// Dismissible for the browser session (UI/UX plan §11.6 M); a new message shows again.
export function MaintenanceBanner() {
    const { user } = useAuth();
    const message: string = (user as any)?.maintenanceMessage || 'This workspace is undergoing scheduled maintenance. Some features may be temporarily unavailable.';
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        try {
            setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === message);
        } catch {
            setDismissed(false);
        }
    }, [message]);

    if (!(user as any)?.maintenanceActive || dismissed) {
        return null;
    }

    const dismiss = () => {
        setDismissed(true);
        try { window.sessionStorage.setItem(DISMISS_KEY, message); } catch { /* Shown again next load. */ }
    };

    return (
        <div role="status" className="border-b border-status-warning-foreground/30 bg-status-warning text-status-warning-foreground">
            <div className="container mx-auto flex items-center gap-3 px-4 py-2">
                <Wrench className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-medium">{message}</span>
                <button type="button" onClick={dismiss} aria-label="Dismiss maintenance notice" className="rounded-sm p-1 hover:bg-status-warning-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="size-4" />
                </button>
            </div>
        </div>
    );
}
