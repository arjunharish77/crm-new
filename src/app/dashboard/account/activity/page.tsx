"use client";

import { PageHeader } from "@/components/layout/page-header";
import { MyActivityTab } from "@/components/settings/my-activity-tab";

export default function AccountActivityPage() {
    return (
        <div className="min-w-0">
            <PageHeader title="My activity" description="What you've changed today, grouped by kind of record." />
            <MyActivityTab />
        </div>
    );
}
