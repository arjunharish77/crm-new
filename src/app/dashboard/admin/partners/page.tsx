"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { AddPartnerDialog } from "./add-partner-dialog";
import { AddPartnerLoginDialog } from "./add-partner-login-dialog";
import { QueueExportButton } from "@/components/exports/queue-export-button";

type PartnerProfile = {
    id: string;
    legalBusinessName: string;
    gstin: string | null;
    status: "ACTIVE" | "SUSPENDED";
    invoiceNumberPrefix: string;
    partnerOrganizationId: string | null;
    parentPartnerProfileId: string | null;
    canAccessPayouts: boolean;
    partnerLoginRole: "PRIMARY" | "MANAGER" | "MEMBER" | "FINANCE";
    user: { id: string; name: string; email: string; status: string } | null;
};

export default function PartnersPage() {
    const [partners, setPartners] = useState<PartnerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [loginDialogPartner, setLoginDialogPartner] = useState<PartnerProfile | null>(null);
    const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);

    const fetchPartners = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch<PartnerProfile[]>("/partners");
            setPartners(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error("Failed to fetch partners");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPartners();
    }, [fetchPartners]);

    const primaryPartners = partners.filter((partner) => partner.partnerLoginRole === "PRIMARY" || !partner.parentPartnerProfileId);
    const loginsFor = (partner: PartnerProfile) =>
        partners.filter((candidate) => {
            if (partner.partnerOrganizationId && candidate.partnerOrganizationId === partner.partnerOrganizationId) return true;
            return candidate.id === partner.id;
        });

    const updatePartner = async (partner: PartnerProfile, patch: Partial<PartnerProfile>) => {
        setUpdatingProfileId(partner.id);
        try {
            await apiFetch(`/partners/${partner.id}`, { method: "PATCH", body: JSON.stringify(patch) });
            toast.success("Partner login updated");
            fetchPartners();
        } catch (error: any) {
            toast.error(error.message || "Failed to update partner login");
        } finally {
            setUpdatingProfileId(null);
        }
    };

    return (
        <div className="mx-auto max-w-[1600px] p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-lg font-extrabold">Partners</h1>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Channel partners see only their own assigned leads/opportunities and their own commission/payout data.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <QueueExportButton moduleName="PARTNERS" />
                    <Button onClick={() => setDialogOpen(true)}>
                        <UserPlus className="size-4" />
                        Add Partner
                    </Button>
                </div>
            </div>

            {loading ? (
                <TableSkeleton rows={6} columns={4} />
            ) : partners.length === 0 ? (
                <EmptyState
                    title="No partners yet"
                    description="Add a channel partner to give them portal access scoped to their own records."
                    action={
                        <Button variant="outline" onClick={() => setDialogOpen(true)}>
                            <UserPlus className="size-4" />
                            Add Partner
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {primaryPartners.map((partner) => {
                        const logins = loginsFor(partner);
                        return (
                        <div
                            key={partner.id}
                            className="rounded-[14px] border bg-card p-4"
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar className="bg-primary/10 font-bold text-primary">
                                        <AvatarFallback>
                                            {(partner.user?.name || partner.legalBusinessName || "?").charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-bold">
                                            {partner.legalBusinessName}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {partner.user?.name} · {partner.user?.email}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setLoginDialogPartner(partner)}>
                                        <UserPlus className="size-4" />
                                        Add Login
                                    </Button>
                                    <Badge variant="outline" className="rounded-md text-[0.65rem] font-semibold">
                                        {partner.gstin ? "GST Registered" : "Unregistered"}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={
                                            partner.status === "ACTIVE"
                                                ? "rounded-md border-primary/20 bg-primary/10 text-[0.65rem] font-semibold text-primary"
                                                : "rounded-md border-border bg-muted text-[0.65rem] font-semibold text-muted-foreground"
                                        }
                                    >
                                        {partner.status}
                                    </Badge>
                                </div>
                            </div>
                            <div className="mt-4 rounded-xl border bg-surface-container-low p-3">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                                    <UsersRound className="size-4" />
                                    Partner Logins
                                </div>
                                <div className="space-y-2">
                                    {logins.map((login) => (
                                        <div key={login.id} className="grid gap-3 rounded-lg bg-card p-3 lg:grid-cols-[1.4fr_150px_150px_150px_120px] lg:items-center">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{login.user?.name || login.legalBusinessName}</div>
                                                <div className="truncate text-xs text-muted-foreground">{login.user?.email}</div>
                                            </div>
                                            <Select
                                                value={login.partnerLoginRole}
                                                disabled={updatingProfileId === login.id}
                                                onValueChange={(value) => updatePartner(login, { partnerLoginRole: value as PartnerProfile["partnerLoginRole"] })}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PRIMARY">Primary</SelectItem>
                                                    <SelectItem value="MANAGER">Manager</SelectItem>
                                                    <SelectItem value="MEMBER">Member</SelectItem>
                                                    <SelectItem value="FINANCE">Finance</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={login.parentPartnerProfileId || "__none__"}
                                                disabled={updatingProfileId === login.id || login.id === partner.id}
                                                onValueChange={(value) => updatePartner(login, { parentPartnerProfileId: value === "__none__" ? null : value })}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No parent</SelectItem>
                                                    {logins.filter((candidate) => candidate.id !== login.id).map((candidate) => (
                                                        <SelectItem key={candidate.id} value={candidate.id}>
                                                            {candidate.user?.name || candidate.user?.email || candidate.id}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={login.status}
                                                disabled={updatingProfileId === login.id}
                                                onValueChange={(value) => updatePartner(login, { status: value as PartnerProfile["status"] })}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <label className="flex items-center justify-between gap-2 rounded-md border bg-surface-container-low px-3 py-2 text-xs font-semibold">
                                                Payouts
                                                <Checkbox
                                                    checked={login.canAccessPayouts}
                                                    disabled={updatingProfileId === login.id}
                                                    onCheckedChange={(checked) => updatePartner(login, { canAccessPayouts: checked === true })}
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )})}
                </div>
            )}

            <AddPartnerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchPartners();
                }}
            />
            <AddPartnerLoginDialog
                open={!!loginDialogPartner}
                onOpenChange={(open) => {
                    if (!open) setLoginDialogPartner(null);
                }}
                partner={loginDialogPartner}
                logins={loginDialogPartner ? loginsFor(loginDialogPartner) : []}
                onSuccess={() => {
                    setLoginDialogPartner(null);
                    fetchPartners();
                }}
            />
        </div>
    );
}
