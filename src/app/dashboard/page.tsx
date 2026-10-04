'use client';

import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import dynamic from "next/dynamic";
import { DashboardSkeleton } from "@/components/common/skeletons";
import { MyDay } from "@/components/dashboard/my-day";
import { useModuleAccess } from "@/hooks/use-module-access";
import { OnboardingChecklistBanner } from "@/components/dashboard/onboarding-checklist-banner";

// The dashboard editor and its charts load only when the Dashboards tab is opened (round-2 plan P4).
const DashboardManager = dynamic(() => import("@/components/dashboard/dashboard-manager").then((mod) => mod.DashboardManager), { ssr: false, loading: () => <DashboardSkeleton /> });

const TABS = [
    { value: "my-day", label: "My day" },
    { value: "dashboards", label: "Dashboards" },
] as const;

// Home (UI/UX plan §10.3, decision 21): "My day" first -- what to do today -- with the
// configurable widget dashboards one tab over.
export default function DashboardPage() {
    // The Dashboards tab follows the role's Dashboards permission; My day is always there.
    const can = useModuleAccess();
    const tabs = can("dashboard") ? TABS : TABS.filter((item) => item.value === "my-day");
    const [tab, setTab] = usePageTab(tabs, "my-day", "view");
    return (
        <div id="dashboard-workspace" className="min-w-0 space-y-4">
            <OnboardingChecklistBanner />
            <div className="min-w-0">
                <PageHeader title="Dashboard" className="mb-2" />
                {tabs.length > 1 ? <PageTabs tabs={tabs} value={tab} onChange={setTab} label="Dashboard views" className="mb-4" /> : null}
                <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
                    {tab === "my-day" ? <MyDay /> : <DashboardManager />}
                </div>
            </div>
        </div>
    );
}
