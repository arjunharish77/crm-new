"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { DuplicateRulesPanel } from "./rules-panel";
import { DuplicateReviewPanel } from "./review-panel";

// Settings › Data model › Duplicates (UI/UX plan §11.5): the duplicate rules and the review and
// merge queue on one page. They were two pages, "Duplicate rules" and "Dedupe & Merge".
export default function DuplicatesSettingsPage() {
    const reviewEnabled = useModuleEnabled("DATA_PLATFORM");
    const tabs = reviewEnabled
        ? ([{ value: "rules", label: "Rules" }, { value: "review", label: "Review and merge" }] as const)
        : ([{ value: "rules", label: "Rules" }] as const);
    const [tab, setTab] = usePageTab(tabs, "rules");
    return (
        <div className="min-w-0">
            <PageHeader title="Duplicates" description="How duplicates are spotted when records are saved, and the duplicates found so far." />
            {tabs.length > 1 ? <PageTabs tabs={tabs} value={tab} onChange={setTab} label="Duplicates" className="mb-4" /> : null}
            <div role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `tab-${tab}` : undefined}>
                {tab === "review" && reviewEnabled ? <DuplicateReviewPanel embedded /> : <DuplicateRulesPanel embedded />}
            </div>
        </div>
    );
}
