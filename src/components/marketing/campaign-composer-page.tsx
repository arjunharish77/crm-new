"use client";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { CampaignComposer } from "@/components/marketing/campaign-composer";

// The composer's own page, for a new campaign (campaignId null) or an existing one.
export function CampaignComposerPage({ campaignId }: { campaignId: string | null }) {
    const marketingEnabled = useModuleEnabled("MARKETING");
    return (
        <div className="@container/marketing min-w-0 space-y-4">
            <PageHeader title={campaignId ? "Edit campaign" : "New campaign"} description="Audience, message and preview. A Draft campaign saves itself; nothing is sent until it's approved and launched." />
            {marketingEnabled ? (
                <CampaignComposer key={campaignId ?? "new"} campaignId={campaignId} />
            ) : (
                <EmptyState title="Marketing is off" description="Ask an admin to turn on Marketing Communications in Settings." />
            )}
        </div>
    );
}
