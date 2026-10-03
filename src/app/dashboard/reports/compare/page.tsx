"use client";

import { PageHeader } from "@/components/layout/page-header";
import { SegmentComparisonSection } from "../_components/report-sections";

export default function CompareSegmentsPage() {
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title="Compare segments" description="Two segments of leads or opportunities side by side." backHref="/dashboard/reports" backLabel="Reports" />
            <SegmentComparisonSection />
        </div>
    );
}
