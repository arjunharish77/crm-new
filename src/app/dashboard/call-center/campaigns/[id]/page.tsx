"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PhoneCall, SkipForward } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClickToCall } from "@/hooks/use-click-to-call";
import { LogCallOutcomeDialog } from "@/components/telephony/log-call-outcome-dialog";

type CampaignRecord = {
    id: string;
    name?: string;
    title?: string;
    phone?: string | null;
    lead?: { phone?: string | null };
};

type NextCall = {
    member: { id: string; leadId: string | null; opportunityId: string | null; attempts: number };
    record: CampaignRecord;
} | null;

export default function CallCampaignWorkspacePage() {
    const params = useParams();
    const campaignId = params.id as string;
    const [current, setCurrent] = useState<NextCall>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showLogOutcome, setShowLogOutcome] = useState(false);
    const [dispositionGroupId, setDispositionGroupId] = useState<string | null>(null);
    const { call, calling } = useClickToCall();

    useEffect(() => {
        apiFetch<{ dispositionGroupId: string | null }>(`/call-campaigns/${campaignId}`)
            .then((data) => setDispositionGroupId(data?.dispositionGroupId ?? null))
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaignId]);

    const getNext = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const next = await apiFetch<NextCall>(`/call-campaigns/${campaignId}/next-call`, { method: "POST" });
            if (!next) {
                toast.success("No more calls due right now -- campaign queue is empty.");
            }
            setCurrent(next);
        } catch (error: any) {
            setFetchError(error?.message || "Failed to fetch next call.");
        } finally {
            setLoading(false);
        }
    };

    const placeCall = () => {
        if (!current) return;
        const phone = current.member.leadId ? current.record?.phone : current.record?.lead?.phone;
        call(phone, { leadId: current.member.leadId ?? undefined, opportunityId: current.member.opportunityId ?? undefined });
    };

    const recordLabel = current?.record?.name || current?.record?.title || "Unknown";
    const recordHref = current?.member.leadId
        ? `/dashboard/leads/${current.member.leadId}`
        : current?.member.opportunityId
            ? `/dashboard/opportunities/${current.member.opportunityId}`
            : null;

    return (
        <div className="space-y-4">
            <PageHeader title="Call Campaign Workspace" description="Get the next due record, place a call and log its outcome." actions={<Button variant="outline" asChild><Link href="/dashboard/call-center">Back to Call Center</Link></Button>} />

            {fetchError && <ErrorState description={fetchError} onRetry={getNext} />}
            {!current ? (
                <Card className="p-6 text-center">
                    <p className="mb-3 text-sm text-muted-foreground">Click below to get the next call due in this campaign.</p>
                    <Button disabled={loading} onClick={getNext}>
                        <SkipForward className="size-4" />
                        Get Next Call
                    </Button>
                </Card>
            ) : (
                <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {recordHref ? (
                            <Link href={recordHref} className="min-w-0 break-words text-lg font-bold text-primary hover:underline">
                                {recordLabel}
                            </Link>
                        ) : (
                            <span className="min-w-0 break-words text-lg font-bold">{recordLabel}</span>
                        )}
                        <Badge variant="outline">Attempt {current.member.attempts}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{current.record?.phone || current.record?.lead?.phone || "No phone on record"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button disabled={calling} onClick={placeCall}>
                            <PhoneCall className="size-4" />
                            Call
                        </Button>
                        <Button variant="outline" onClick={() => setShowLogOutcome(true)}>
                            Log Outcome
                        </Button>
                        <Button variant="ghost" disabled={loading} onClick={getNext}>
                            <SkipForward className="size-4" />
                            Skip / Next
                        </Button>
                    </div>
                </Card>
            )}

            {current && (
                <LogCallOutcomeDialog
                    open={showLogOutcome}
                    onClose={() => setShowLogOutcome(false)}
                    leadId={current.member.leadId}
                    opportunityId={current.member.opportunityId}
                    campaignMemberId={current.member.id}
                    restrictToGroupId={dispositionGroupId}
                    onLogged={() => {
                        setShowLogOutcome(false);
                        setCurrent(null);
                    }}
                />
            )}
        </div>
    );
}
