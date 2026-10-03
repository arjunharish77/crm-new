"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, LogOut } from "lucide-react";
import { useConfirm } from "@/components/common/dialogs-provider";
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

// Sign-in & security › Sessions (My account, UI/UX plan decision 8).
export function SessionsSection() {
    const confirm = useConfirm();
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
        if (session.isCurrent) {
            const ok = await confirm({ title: "Sign out of this device?", description: "This is the session you're using now, so you'll be signed out straight away.", confirmLabel: "Sign out", destructive: true });
            if (!ok) return;
        }
        setRevokingId(session.id);
        try {
            await apiFetch(`/sessions/${session.id}`, { method: "DELETE" });
            if (session.isCurrent) {
                window.location.href = "/login";
                return;
            }
            toast.success("Device signed out");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't sign that device out");
        } finally {
            setRevokingId(null);
        }
    };

    const revokeAllOthers = async () => {
        const ok = await confirm({ title: "Sign out of every other device?", description: "Every other browser and phone signed in as you is signed out. This one stays signed in.", confirmLabel: "Sign out others", destructive: true });
        if (!ok) return;
        setRevokingAll(true);
        try {
            await apiFetch("/sessions/revoke-others", { method: "POST" });
            toast.success("Signed out of every other device");
            load();
        } catch (error: any) {
            toast.error(error?.message || "Couldn't sign out the other devices");
        } finally {
            setRevokingAll(false);
        }
    };

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Browsers and phones signed in as you.</p>
                <Button variant="outline" size="sm" disabled={loading || loadError || revokingAll || !!revokingId || sessions.length <= 1} onClick={revokeAllOthers} isLoading={revokingAll}>
                    <LogOut className="size-3.5" /> Sign out other devices
                </Button>
            </div>

            <Card className="overflow-hidden py-0">
                {loading ? (
                    <p role="status" className="p-4 text-sm text-muted-foreground">Loading…</p>
                ) : loadError ? <ErrorState variant="inline" description="Sessions couldn't be loaded." onRetry={load} /> : sessions.length === 0 ? (
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
                                                <Badge tone="success">This device</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {session.ipAddress || "Unknown IP"} · signed in {formatWorkspaceDateTime(session.createdAt)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Last active {formatWorkspaceRelativeTime(session.lastActiveAt)}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" disabled={!!revokingId || revokingAll} onClick={() => revoke(session)}>
                                    Sign out
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
