"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ReportSchedulesSection } from "../_components/report-sections";

export default function ReportSchedulesPage() {
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title="Report schedules" description="Reports emailed on a schedule." backHref="/dashboard/reports" backLabel="Reports" />
            <ReportSchedulesSection />
        </div>
    );
}
