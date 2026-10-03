"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { CustomReportBuilder } from "../../_components/report-sections";

// Reports › a saved report (decision 30): open it, run it, change it and save.
export default function SavedReportPage() {
    const { id } = useParams<{ id: string }>();
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title="Saved report" backHref="/dashboard/reports?tab=saved" backLabel="Saved reports" />
            <CustomReportBuilder key={id} reportId={id} />
        </div>
    );
}
