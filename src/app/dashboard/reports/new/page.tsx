"use client";

import { PageHeader } from "@/components/layout/page-header";
import { CustomReportBuilder } from "../_components/report-sections";

// Reports › New report (decision 30): the builder on its own page.
export default function NewReportPage() {
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title="New report" backHref="/dashboard/reports" backLabel="Reports" />
            <CustomReportBuilder />
        </div>
    );
}
