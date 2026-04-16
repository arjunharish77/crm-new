'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut } from 'lucide-react';

export function ImpersonationBanner() {
    const { isImpersonating, user, exitImpersonate } = useAuth();

    if (!isImpersonating) {
        return null;
    }

    return (
        <div className="bg-yellow-500 text-yellow-950 border-b border-yellow-600">
            <div className="container mx-auto px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 wh-5" />
                    <div>
                        <span className="font-semibold">Impersonating:</span>{' '}
                        <span className="font-medium">{user?.name}</span> ({user?.email})
                    </div>
                </div>
                <Button
                    onClick={exitImpersonate}
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
