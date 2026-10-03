"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { FieldsEditor, type ObjectType } from "@/components/admin/fields-editor";

const TABS = [
    { value: "LEAD", label: "Leads" },
    { value: "OPPORTUNITY", label: "Opportunities" },
    { value: "ACTIVITY", label: "Activities" },
] as const;

// Settings › Data model › Objects & fields (UI/UX plan §11.5): one editor for custom fields on
// leads, opportunities and activities. Fields for one opportunity or activity type are shown
// here, marked "Only for …", and are also edited from that type's page.
export default function ObjectsAndFieldsPage() {
    const [tab, setTab] = usePageTab(TABS, "LEAD", "object");
    return (
        <div className="min-w-0">
            <PageHeader title="Objects & fields" description="Extra fields people fill in on records and forms." />
            <PageTabs tabs={TABS} value={tab} onChange={setTab} label="Object" className="mb-4" />
            <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
                <FieldsEditor key={tab} objectType={tab as ObjectType} />
            </div>
        </div>
    );
}
