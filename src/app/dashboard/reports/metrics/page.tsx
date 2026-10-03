"use client";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsSections } from "@/components/layout/settings-sections";
import { CalculatedMetricsSection, MetricsSection } from "../_components/report-sections";

export default function ReportMetricsPage() {
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title="Metrics" description="Shared measures that reports and dashboards use, and metrics calculated from them." backHref="/dashboard/reports" backLabel="Reports" />
            <SettingsSections label="Metric section" urlKey="metric" sections={[
                { id: "metrics", label: "Metrics", content: <MetricsSection /> },
                { id: "calculated", label: "Calculated metrics", content: <CalculatedMetricsSection /> },
            ]} />
        </div>
    );
}
