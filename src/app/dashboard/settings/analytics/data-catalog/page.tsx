"use client";

import { PageHeader } from "@/components/layout/page-header";
import { DataCatalogSection } from "@/app/dashboard/reports/_components/report-sections";

// Settings › Analytics › Data catalog (decision 30): the objects and fields reports can use.
export default function DataCatalogSettingsPage() {
    return (
        <div className="@container/reports min-w-0">
            <PageHeader title="Data catalog" description="The objects and fields that reports, metrics and the report builder can use." />
            <DataCatalogSection />
        </div>
    );
}
