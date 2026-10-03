"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, Plus, Sigma } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { ListToolbar } from "@/components/common/list-toolbar";
import { Button } from "@/components/ui/button";
import { useFeature } from "@/components/auth/feature-gate";
import { QueueExportButton } from "@/components/exports/queue-export-button";
import { CustomReportsSection, INBUILT_REPORT_OPTIONS } from "./_components/report-sections";

const TABS = [
    { value: "standard", label: "Standard reports" },
    { value: "saved", label: "Saved reports" },
] as const;

// Compare segments is a standard report with its own page (decision 30).
const EXTRA_STANDARD = [{ value: "compare", label: "Compare segments", category: "Analysis", description: "Put two segments of leads or opportunities side by side on the same measures.", href: "/dashboard/reports/compare" }];

// Reports › Library (UI/UX plan decision 30): find a standard or saved report and open it on its
// own page. Builder, schedules and metrics have their own pages too.
export default function ReportsLibraryPage() {
    const router = useRouter();
    const payoutsEnabled = useFeature("payoutsEnabled");
    const [tab, setTab] = usePageTab(TABS, "standard");
    const [search, setSearch] = useState("");

    // Old links: scheduled-report emails (?report=<key>, ?report=custom:<id>), global search
    // (?reportId=) and the Create menu (?create=1) open the new pages.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const report = params.get("report");
        const reportId = params.get("reportId");
        if (report?.startsWith("custom:")) router.replace(`/dashboard/reports/custom/${report.slice("custom:".length)}`);
        else if (report) router.replace(`/dashboard/reports/standard/${encodeURIComponent(report)}`);
        else if (reportId) router.replace(`/dashboard/reports/custom/${reportId}`);
        else if (params.get("create") === "1") router.replace("/dashboard/reports/new");
    }, [router]);

    const standard = useMemo(() => {
        const options = [
            ...INBUILT_REPORT_OPTIONS.filter((option) => option.value !== "commission_payout_summary" || payoutsEnabled).map((option) => ({ ...option, href: `/dashboard/reports/standard/${option.value}` })),
            ...EXTRA_STANDARD,
        ];
        const needle = search.trim().toLowerCase();
        const matching = needle ? options.filter((option) => `${option.label} ${option.category} ${option.description}`.toLowerCase().includes(needle)) : options;
        const groups = new Map<string, typeof matching>();
        for (const option of matching) groups.set(option.category, [...(groups.get(option.category) ?? []), option]);
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [payoutsEnabled, search]);

    return (
        <div className="@container/reports min-w-0 pb-8">
            <PageHeader
                title="Reports"
                description="Standard reports, and reports your team has built."
                primaryAction={<Button asChild><Link href="/dashboard/reports/new"><Plus className="size-4" />New report</Link></Button>}
                secondaryActions={<>
                    <Button variant="outline" asChild><Link href="/dashboard/reports/schedules"><CalendarClock className="size-4" />Schedules</Link></Button>
                    <Button variant="outline" asChild><Link href="/dashboard/reports/metrics"><Sigma className="size-4" />Metrics</Link></Button>
                    {/* Exports the list of saved reports this person can see (each report has its own Export). */}
                    <QueueExportButton moduleName="REPORTS" label="Export report list" />
                </>}
            />
            <PageTabs tabs={TABS} value={tab} onChange={setTab} label="Reports" className="mb-4" />
            <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab === "saved" ? <CustomReportsSection /> : (
                    <div className="space-y-6">
                        <ListToolbar search={{ value: search, onChange: setSearch, placeholder: "Search reports", label: "Search standard reports", inputId: "reports-search" }} />
                        {standard.length === 0 ? <p className="text-sm text-muted-foreground">No standard reports match “{search}”.</p> : null}
                        {standard.map(([category, options]) => (
                            <section key={category} aria-labelledby={`reports-${category}`}>
                                <h2 id={`reports-${category}`} className="mb-2 text-sm font-semibold">{category}</h2>
                                <ul className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
                                    {options.map((option) => (
                                        <li key={option.value} className="bg-card">
                                            <Link href={option.href} className="flex h-full items-start justify-between gap-3 p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium">{option.label}</span>
                                                    <span className="block text-sm text-muted-foreground">{option.description}</span>
                                                </span>
                                                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
