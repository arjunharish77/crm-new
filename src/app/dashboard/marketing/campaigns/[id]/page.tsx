import { CampaignComposerPage } from "@/components/marketing/campaign-composer-page";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <CampaignComposerPage campaignId={id} />;
}
