"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ReportAnnotationsSection } from "@/app/dashboard/reports/_components/report-sections";

// Settings › Analytics › Annotations (decision 30): notes on report timelines, such as a campaign
// launch or a price change. Moved here from Reports.
export default function AnnotationsSettingsPage() {
    return (
        <div className="@container/reports min-w-0">
            <PageHeader title="Annotations" description="Notes that appear on report charts at a date, such as a campaign launch or a price change." />
            <ReportAnnotationsSection />
        </div>
    );
}
