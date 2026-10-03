"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { InbuiltReportsSection, INBUILT_REPORT_OPTIONS } from "../../_components/report-sections";

// Reports › a standard report (decision 30): the report on its own page, run when it opens.
export default function StandardReportPage() {
    const { key } = useParams<{ key: string }>();
    const option = INBUILT_REPORT_OPTIONS.find((item) => item.value === key);
    if (!option) {
        return <ErrorState kind="permission" title="Report not found" description="It may have been renamed or removed." action={<Button variant="outline" asChild><Link href="/dashboard/reports">All reports</Link></Button>} />;
    }
    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader title={option.label} backHref="/dashboard/reports" backLabel="Reports" meta={<span>{option.category}</span>} />
            <InbuiltReportsSection key={key} reportKey={key} />
        </div>
    );
}
