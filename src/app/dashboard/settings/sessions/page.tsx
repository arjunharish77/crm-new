"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, LogOut } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWorkspaceDateTime, formatWorkspaceRelativeTime } from "@/lib/date-format";

type SessionRow = {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    lastActiveAt: string;
    expiresAt: string;
    isCurrent: boolean;
};

function describeDevice(userAgent: string | null) {
    if (!userAgent) return "Unknown device";
    if (/mobile/i.test(userAgent)) return "Mobile browser";
    if (/chrome/i.test(userAgent)) return "Chrome";
    if (/firefox/i.test(userAgent)) return "Firefox";
    if (/safari/i.test(userAgent)) return "Safari";
    if (/edg/i.test(userAgent)) return "Edge";
    return "Browser";
}

export default function ActiveSessionsPage() {
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    const [loadError, setLoadError] = useState(false);
    const load = () => {
        setLoadError(false);
        setLoading(true);
        apiFetch<SessionRow[]>("/sessions")
            .then((data) => setSessions(Array.isArray(data) ? data : []))
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const revoke = async (session: SessionRow) => {
        if (session.isCurrent && !window.confirm("This is your current session -- revoking it will log you out immediately. Continue?")) return;
        setRevokingId(session.id);
        try {
            await apiFetch(`/sessions/${session.id}`, { method: "DELETE" });
            if (session.isCurrent) {
                window.location.href = "/login";
                return;
            }
            toast.success("Session revoked");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to revoke session");
        } finally {
            setRevokingId(null);
        }
    };

    const revokeAllOthers = async () => {
        if (!window.confirm("Log out every other device? This won't affect your current session.")) return;
        setRevokingAll(true);
        try {
            await apiFetch("/sessions/revoke-others", { method: "POST" });
            toast.success("Signed out of all other sessions");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Failed to revoke other sessions");
        } finally {
            setRevokingAll(false);
        }
    };

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Active Sessions" description="Devices currently signed in to your account." actions={
                <Button variant="outline" size="sm" disabled={loading || loadError || revokingAll || !!revokingId || sessions.length <= 1} onClick={revokeAllOthers}>
                    <LogOut className="size-3.5" /> Log Out Other Devices
                </Button>
            } />

            <Card className="overflow-hidden py-0">
                {loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : loadError ? <ErrorState description="Active sessions could not be loaded." onRetry={load} /> : sessions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No active sessions.</p>
                ) : (
                    <div className="divide-y">
                        {sessions.map((session) => (
                            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                <div className="flex min-w-0 max-w-full items-start gap-3">
                                    <Laptop className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 break-words">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium">{describeDevice(session.userAgent)}</p>
                                            {session.isCurrent && (
                                                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                                    This device
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {session.ipAddress || "Unknown IP"} -- signed in {formatWorkspaceDateTime(session.createdAt)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Last active {formatWorkspaceRelativeTime(session.lastActiveAt)}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" disabled={!!revokingId || revokingAll} onClick={() => revoke(session)}>
                                    {session.isCurrent ? "Log Out" : "Revoke"}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
