"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { formatWorkspaceDate } from "@/lib/date-format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, DollarSign, Wallet, Clock3 } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

type PartnerProfile = {
    id: string; legalBusinessName: string; gstin: string | null; status: "ACTIVE" | "SUSPENDED";
    invoiceNumberPrefix: string; canAccessPayouts: boolean; partnerLoginRole: string;
    user: { id: string; name: string; email: string } | null;
};
type PartnerDashboard = {
    totals: { totalEarned: number; totalPaid: number; pendingPayouts: number };
    recentLedgerEntries: Array<{ id: string; entryType: string; commissionAmount: number; triggerEvent: string; createdAt: string }>;
    recentPayouts: Array<{ id: string; status: string; totalCommissionAmount: number; createdAt: string }>;
};

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards"). Previously there was no per-partner detail page anywhere in this codebase --
// settings/partners was a flat admin list only -- so this is a genuinely new page, not a widget
// dropped into an existing one. The mini-dashboard reuses the existing commission-ledger/payout
// data-fetching paths (already partnerId-addressable for tenant-admin callers) rather than a
// new aggregation pipeline.
export default function PartnerDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [profile, setProfile] = useState<PartnerProfile | null>(null);
    const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [profileData, dashboardData] = await Promise.all([
                apiFetch<PartnerProfile>(`/partners/${params.id}`),
                apiFetch<PartnerDashboard>(`/partners/${params.id}/dashboard`),
            ]);
            setProfile(profileData);
            setDashboard(dashboardData);
        } catch (error: any) {
            if (error?.status === 404) setNotFound(true);
            else toast.error(error.message || "Failed to load partner");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    if (loading) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Skeleton className="mb-4 h-8 w-64" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (notFound || !profile) {
        return (
            <div className="mx-auto max-w-[1200px] p-4">
                <Button variant="ghost" onClick={() => router.push("/dashboard/settings/partners")}>
                    <ArrowLeft className="size-4" />
                    Back to Partners
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">Partner not found.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] p-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/settings/partners")} className="mb-3">
                <ArrowLeft className="size-4" />
                Back to Partners
            </Button>

            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Avatar className="size-12 bg-primary/10 text-primary">
                        <AvatarFallback>{(profile.user?.name || profile.legalBusinessName || "?").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-xl font-extrabold">{profile.legalBusinessName}</h1>
                        <p className="text-sm text-muted-foreground">{profile.user?.name} &middot; {profile.user?.email}</p>
                    </div>
                </div>
                <Badge variant="outline" className={profile.status === "ACTIVE" ? "border-primary/20 bg-primary/10 text-primary" : "text-muted-foreground"}>
                    {profile.status}
                </Badge>
            </div>

            {dashboard ? (
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <StatCard title="Total Commission Earned" value={formatCurrency(dashboard.totals.totalEarned)} icon={<DollarSign />} />
                    <StatCard title="Total Paid Out" value={formatCurrency(dashboard.totals.totalPaid)} icon={<Wallet />} />
                    <StatCard title="Pending Payouts" value={dashboard.totals.pendingPayouts} icon={<Clock3 />} />
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-2xl">
                    <CardContent className="p-6">
                        <h2 className="mb-3 text-lg font-bold">Recent Commission Ledger</h2>
                        {!dashboard?.recentLedgerEntries.length ? (
                            <p className="text-sm text-muted-foreground">No commission ledger entries yet.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dashboard.recentLedgerEntries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="text-xs">{entry.entryType}</TableCell>
                                            <TableCell>{formatCurrency(entry.commissionAmount)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{formatWorkspaceDate(entry.createdAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl">
                    <CardContent className="p-6">
                        <h2 className="mb-3 text-lg font-bold">Recent Payouts</h2>
                        {!dashboard?.recentPayouts.length ? (
                            <p className="text-sm text-muted-foreground">No payouts yet.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dashboard.recentPayouts.map((payout) => (
                                        <TableRow key={payout.id}>
                                            <TableCell><Badge variant="outline" className="text-xs">{payout.status}</Badge></TableCell>
                                            <TableCell>{formatCurrency(payout.totalCommissionAmount)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{formatWorkspaceDate(payout.createdAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
