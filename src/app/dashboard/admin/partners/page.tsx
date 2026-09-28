"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/common/skeletons";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { AddPartnerDialog } from "./add-partner-dialog";
import { BulkActionsToolbar } from "@/components/bulk-actions/bulk-toolbar";
import { AddPartnerLoginDialog } from "./add-partner-login-dialog";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { useModuleEnabled } from "@/components/auth/feature-gate";

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
    const router = useRouter();
    const partnersEnabled = useModuleEnabled("PARTNERS");
    const [partners, setPartners] = useState<PartnerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [loginDialogPartner, setLoginDialogPartner] = useState<PartnerProfile | null>(null);
    const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);
    const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchPartners = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch<PartnerProfile[]>("/partners");
            setPartners(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error("Failed to fetch partners");
            setFetchError("Failed to load partners.");
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

    // Bulk suspend -- loops the same single-login PATCH endpoint updatePartner already uses
    // (no bulk endpoint exists, matching the pattern used for Leads/Opportunities delete).
    // Scoped to primary-partner cards, not nested logins, since a "row" in this two-level
    // grouped layout is ambiguous at the login level.
    const handleBulkSuspend = async () => {
        if (selectedPartnerIds.length === 0) return;
        if (!confirm(`Suspend ${selectedPartnerIds.length} partner${selectedPartnerIds.length === 1 ? "" : "s"}?`)) return;
        let suspended = 0;
        let failed = 0;
        for (const id of selectedPartnerIds) {
            try {
                await apiFetch(`/partners/${id}`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) });
                suspended += 1;
            } catch {
                failed += 1;
            }
        }
        toast.success(`${suspended} partner${suspended === 1 ? "" : "s"} suspended${failed ? `, ${failed} failed` : ""}`);
        setSelectedPartnerIds([]);
        fetchPartners();
    };

    return (
        <div className="@container/partners min-w-0">
            <PageHeader title="Partners" description="Manage partner organizations, logins and access to their assigned records." actions={<>
                <QueueExportButton moduleName="PARTNERS" />
                {partnersEnabled && <Button onClick={() => setDialogOpen(true)}><UserPlus className="size-4" />Add Partner</Button>}
            </>} />

            {!partnersEnabled && (
                <p className="mb-3 text-sm text-muted-foreground">
                    The Partners module is disabled for this tenant -- existing partners are still visible below, but new partners/logins can&apos;t be created and existing profiles can&apos;t be edited until it&apos;s re-enabled.
                </p>
            )}

            {loading ? (
                <TableSkeleton rows={6} columns={4} />
            ) : fetchError ? (
                <ErrorState description={fetchError} onRetry={fetchPartners} />
            ) : partners.length === 0 ? (
                <EmptyState
                    title="No partners yet"
                    description="Add a channel partner to give them portal access scoped to their own records."
                    action={
                        partnersEnabled ? (
                            <Button variant="outline" onClick={() => setDialogOpen(true)}>
                                <UserPlus className="size-4" />
                                Add Partner
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <div className="space-y-3">
                    {primaryPartners.map((partner) => {
                        const logins = loginsFor(partner);
                        return (
                        <div
                            key={partner.id}
                            className="min-w-0 rounded-[14px] border bg-card p-4"
                        >
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                                <div className="flex min-w-0 flex-wrap items-center gap-3">
                                    <Checkbox
                                        checked={selectedPartnerIds.includes(partner.id)}
                                        onCheckedChange={(checked) => {
                                            setSelectedPartnerIds((prev) =>
                                                checked ? [...prev, partner.id] : prev.filter((id) => id !== partner.id)
                                            );
                                        }}
                                        aria-label={`Select ${partner.legalBusinessName}`}
                                    />
                                    <Avatar className="bg-primary/10 font-bold text-primary">
                                        <AvatarFallback>
                                            {(partner.user?.name || partner.legalBusinessName || "?").charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1 basis-40 break-words">
                                        <div className="text-sm font-bold">
                                            {partner.legalBusinessName}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {partner.user?.name} · {partner.user?.email}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/settings/partners/${partner.id}`)}>
                                        View Dashboard
                                    </Button>
                                    {partnersEnabled && (
                                        <Button variant="outline" size="sm" onClick={() => setLoginDialogPartner(partner)}>
                                            <UserPlus className="size-4" />
                                            Add Login
                                        </Button>
                                    )}
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
                            <details className="mt-4 rounded-xl border bg-surface-container-low p-3">
                                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                                    <UsersRound className="size-4" />
                                    Partner Logins ({logins.length})
                                </summary>
                                <div className="mt-3 space-y-2">
                                    {logins.map((login) => (
                                        <div key={login.id} className="grid min-w-0 gap-3 @min-[600px]/partners:grid-cols-2 rounded-lg bg-card p-3 @min-[950px]/partners:grid-cols-[minmax(0,1.4fr)_130px_150px_130px_110px] @min-[950px]/partners:items-end">
                                            <div className="min-w-0 @min-[600px]/partners:col-span-2 @min-[950px]/partners:col-span-1">
                                                <div className="break-words text-sm font-semibold">{login.user?.name || login.legalBusinessName}</div>
                                                <div className="break-words text-xs text-muted-foreground">{login.user?.email}</div>
                                            </div>
                                            <div className="min-w-0 space-y-2"><Label htmlFor={`partner-login-partnerLoginRole-${login.id}`}> Login role</Label>
                                            <Select
                                                value={login.partnerLoginRole}
                                                disabled={updatingProfileId === login.id || !partnersEnabled}
                                                onValueChange={(value) => updatePartner(login, { partnerLoginRole: value as PartnerProfile["partnerLoginRole"] })}
                                            >
                                                <SelectTrigger id={`partner-login-partnerLoginRole-${login.id}`} className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PRIMARY">Primary</SelectItem>
                                                    <SelectItem value="MANAGER">Manager</SelectItem>
                                                    <SelectItem value="MEMBER">Member</SelectItem>
                                                    <SelectItem value="FINANCE">Finance</SelectItem>
                                                </SelectContent>
                                            </Select></div>
                                            <div className="min-w-0 space-y-2"><Label htmlFor={`partner-login-parentPartnerProfileId-${login.id}`}> Reports to</Label>
                                            <Select
                                                value={login.parentPartnerProfileId || "__none__"}
                                                disabled={updatingProfileId === login.id || login.id === partner.id || !partnersEnabled}
                                                onValueChange={(value) => updatePartner(login, { parentPartnerProfileId: value === "__none__" ? null : value })}
                                            >
                                                <SelectTrigger id={`partner-login-parentPartnerProfileId-${login.id}`} className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No parent</SelectItem>
                                                    {logins.filter((candidate) => candidate.id !== login.id).map((candidate) => (
                                                        <SelectItem key={candidate.id} value={candidate.id}>
                                                            {candidate.user?.name || candidate.user?.email || candidate.id}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select></div>
                                            <div className="min-w-0 space-y-2"><Label htmlFor={`partner-login-status-${login.id}`}> Status</Label>
                                            <Select
                                                value={login.status}
                                                disabled={updatingProfileId === login.id || !partnersEnabled}
                                                onValueChange={(value) => updatePartner(login, { status: value as PartnerProfile["status"] })}
                                            >
                                                <SelectTrigger id={`partner-login-status-${login.id}`} className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                                </SelectContent>
                                            </Select></div>
                                            <label className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-surface-container-low px-3 py-2 text-xs font-semibold">
                                                Payouts
                                                <Checkbox
                                                    checked={login.canAccessPayouts}
                                                    disabled={updatingProfileId === login.id || !partnersEnabled}
                                                    onCheckedChange={(checked) => updatePartner(login, { canAccessPayouts: checked === true })}
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </details>
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

            <BulkActionsToolbar
                selectedCount={selectedPartnerIds.length}
                onClearSelection={() => setSelectedPartnerIds([])}
                module="partners"
                onSuspend={handleBulkSuspend}
            />
        </div>
    );
}
