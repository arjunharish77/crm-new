"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, LogOut, ShieldCheck } from "lucide-react";
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

    const load = () => {
        setLoading(true);
        apiFetch<SessionRow[]>("/sessions")
            .then((data) => setSessions(Array.isArray(data) ? data : []))
            .catch(() => toast.error("Failed to load active sessions"))
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
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <ShieldCheck className="size-5" />
                        Active Sessions
                    </h1>
                    <p className="text-sm text-muted-foreground">Devices currently signed in to your account.</p>
                </div>
                <Button variant="outline" size="sm" disabled={revokingAll || sessions.length <= 1} onClick={revokeAllOthers}>
                    <LogOut className="size-3.5" />
                    Log Out Other Devices
                </Button>
            </div>

            <Card className="overflow-hidden py-0">
                {loading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : sessions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No active sessions.</p>
                ) : (
                    <div className="divide-y">
                        {sessions.map((session) => (
                            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                <div className="flex items-start gap-3">
                                    <Laptop className="mt-0.5 size-5 text-muted-foreground" />
                                    <div>
                                        <div className="flex items-center gap-2">
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
                                <Button variant="ghost" size="sm" disabled={revokingId === session.id} onClick={() => revoke(session)}>
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
