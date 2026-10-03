'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut } from 'lucide-react';

export function ImpersonationBanner() {
    const { isImpersonating, user, login } = useAuth();
    const router = useRouter();
    const [exiting, setExiting] = useState(false);

    if (!isImpersonating) {
        return null;
    }

    // F06 fix (WP05): previously read the platform admin's own raw session token back out of
    // sessionStorage and reapplied it directly -- a token sitting in sessionStorage is exactly
    // as XSS-exposed as one in a JS-readable cookie, and it was never actually invalidated, just
    // reused. This now asks the server to issue the admin a genuinely NEW session, using the
    // impersonation session's own server-side `impersonatedBy` reference to know who to return
    // to (see /api/platform-admin/exit-impersonation), and revokes the impersonation session.
    const stopImpersonation = async () => {
        setExiting(true);
        try {
            await apiFetch('/platform-admin/exit-impersonation', { method: 'POST' });
            await login();
            router.push('/platform-admin/tenants');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to exit impersonation');
            window.location.href = '/login';
        } finally {
            setExiting(false);
        }
    };

    return (
        <div className="border-b border-status-warning-foreground/30 bg-status-warning text-status-warning-foreground">
            <div className="container mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3 break-words">
                    <AlertTriangle className="size-5 shrink-0" aria-hidden />
                    <div>
                        <span className="font-semibold">Impersonating:</span>{' '}
                        <span className="font-medium">{user?.name}</span> ({user?.email})
                    </div>
                </div>
                <Button
                    onClick={stopImpersonation}
                    disabled={exiting}
                    size="sm"
                    variant="outline"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-700"
                >
                    <LogOut className="h-4 w-4 mr-2" />
                    Exit Impersonation
                </Button>
            </div>
        </div>
    );
}
