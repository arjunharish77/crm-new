"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDate } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { StandardDialog } from "@/components/common/standard-dialog";

export type ReportRoot = "lead" | "opportunity" | "activity";


export const ROOT_OPTIONS: Array<{ value: ReportRoot; label: string }> = [
    { value: "lead", label: "Leads" },
    { value: "opportunity", label: "Opportunities" },
    { value: "activity", label: "Activities" },
];


export const OBJECT_LABELS: Record<string, string> = {
    lead: "Lead",
    leadOwner: "Lead Owner",
    opportunity: "Opportunity",
    opportunityOwner: "Opportunity Owner",
    stage: "Stage",
    activity: "Activity",
    activityType: "Activity Type",
    activityCreator: "Activity Creator",
    assignmentLog: "Assignment Log",
    assignedTo: "Assigned To",
    task: "Task",
    taskOwner: "Task Owner",
    telephonyCall: "Telephony Call",
    telephonyAgent: "Telephony Agent",
    case: "Case",
    caseType: "Case Type",
    caseStatus: "Case Status",
    casePriority: "Case Priority",
    caseOwner: "Case Owner",
    commissionLedger: "Commission Ledger Entry",
    partner: "Partner",
    payout: "Payout",
    communication: "Communication",
    journeyEnrollment: "Journey Enrollment",
    recordScore: "Predictive Score",
};


// Task/TelephonyCallLog/Case are join-only satellites reachable from lead/opportunity roots
// only (see reporting-query.ts's buildJoinContexts) -- not from activity, since Case has no
// activityId at all and this pass kept Task/TelephonyCallLog consistent with it rather than
// giving them a join path Case can't have. Real, pre-existing gap fixed alongside the metric
// layer below: these three (plus their owner/type/status/priority satellites) were already
// supported by the query engine but never appeared in this picker, so the custom-report-builder
// itself couldn't reach them either -- the same class of "built but not wired to the UI" bug as
// the earlier funnel_explorer catalog omission.
const NEW_SATELLITE_OBJECTS = ["task", "taskOwner", "telephonyCall", "telephonyAgent", "case", "caseType", "caseStatus", "casePriority", "caseOwner"];

// Gap checklist Module 17, item 2 ("dataset catalog" -- communications/journeys/scoring).
// Reachable from both lead and opportunity roots, same polymorphic entityType/recordType join
// as assignmentLog.
const SHARED_EVENT_OBJECTS = ["communication", "journeyEnrollment", "recordScore"];

// Opportunity-only: CommissionLedger has no leadId at all -- partner/payout association only
// ever exists at the Opportunity level (see reporting-query.ts's FIELD_CATALOG comments).
const PARTNER_OBJECTS = ["commissionLedger", "partner", "payout"];


export const OBJECTS_BY_ROOT: Record<ReportRoot, string[]> = {
    lead: ["lead", "leadOwner", "opportunity", "opportunityOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo", ...NEW_SATELLITE_OBJECTS, ...SHARED_EVENT_OBJECTS],
    opportunity: ["opportunity", "opportunityOwner", "lead", "leadOwner", "stage", "activity", "activityType", "activityCreator", "assignmentLog", "assignedTo", ...NEW_SATELLITE_OBJECTS, ...SHARED_EVENT_OBJECTS, ...PARTNER_OBJECTS],
    activity: ["activity", "activityType", "activityCreator", "lead", "leadOwner", "opportunity", "opportunityOwner", "stage"],
};


export const REPORT_OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Does not equal" },
    { value: "contains", label: "Contains" },
    { value: "greater_than", label: "Greater than" },
    { value: "less_than", label: "Less than" },
    { value: "gte", label: "Greater or equal" },
    { value: "lte", label: "Less or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Has any value" },
];


const FIELD_LABELS: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    source: "Source",
    status: "Status",
    ownerId: "Owner",
    title: "Title",
    amount: "Deal Value",
    stageId: "Stage",
    typeId: "Type",
    priority: "Priority",
    outcome: "Outcome",
    notes: "Notes",
    slaStatus: "SLA Status",
    createdBy: "Created By",
    createdAt: "Created Date",
    updatedAt: "Updated Date",
    assignedAt: "Assigned Date",
};


export function formatFieldLabel(field: string) {
    return FIELD_LABELS[field] ?? field.replace(/Id$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}


export const INBUILT_REPORT_OPTIONS = [
    {
        value: "funnel_conversion_by_stage",
        label: "Funnel Conversion by Stage",
        category: "Opportunities",
        endpoint: "/reports/inbuilt/funnel-by-stage",
        description: "Stage-wise opportunity counts, value, win/closed flags, and conversion rates.",
    },
    {
        value: "funnel_conversion_by_source_campaign",
        label: "Funnel by Source & Campaign",
        category: "Marketing",
        endpoint: "/reports/inbuilt/funnel-by-source-campaign",
        description: "Lead-to-opportunity and win conversion by source and campaign.",
    },
    {
        value: "rep_performance",
        label: "Rep Performance",
        category: "Team",
        endpoint: "/reports/inbuilt/rep-performance",
        description: "Rep-owned leads, opportunities, wins, activity volume, and first response.",
    },
    {
        value: "sla_response_breaches",
        label: "SLA Response Breaches",
        category: "Operations",
        endpoint: "/reports/inbuilt/sla-response-breaches",
        description: "Owner-level first response and activity SLA breach counts.",
    },
    {
        value: "lead_source_roi",
        label: "Lead Source ROI",
        category: "Marketing",
        endpoint: "/reports/inbuilt/lead-source-roi",
        description: "Source-level lead volume, open opportunity value, won value, and ROI where spend exists.",
    },
    {
        value: "reassignment_impact",
        label: "Reassignment Impact",
        category: "Operations",
        endpoint: "/reports/inbuilt/reassignment-impact",
        description: "Conversion and response behavior grouped by reassignment count buckets.",
    },
    {
        value: "activity_call_volume_trends",
        label: "Activity & Call Volume Trends",
        category: "Activity",
        endpoint: "/reports/inbuilt/activity-call-volume-trends",
        description: "Period trend for activities, calls, completed work, and overdue work.",
    },
    {
        value: "case_analytics",
        label: "Case Analytics",
        category: "Operations",
        endpoint: "/reports/inbuilt/case-analytics",
        description: "Case volume by channel/type/priority/status, SLA hit rates, backlog aging, reopen/escalation rate, agent productivity, queue health, and CSAT.",
    },
    {
        value: "telephony_call_performance",
        label: "Telephony Call Performance",
        category: "Activity",
        endpoint: "/reports/inbuilt/telephony-call-performance",
        description: "Answer rate, talk time, and per-agent call performance sourced from real telephony call logs.",
    },
    {
        value: "commission_payout_summary",
        label: "Commission & Payout Summary",
        category: "Finance",
        endpoint: "/reports/inbuilt/commission-payout-summary",
        description: "Partner commission ledger, payout states, invoices, and net payout totals.",
    },
    {
        value: "next_best_action_performance",
        label: "Next-Best-Action Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/next-best-action-performance",
        description: "Recommendation accept/dismiss rates by action type, module, and owner.",
    },
    {
        value: "journey_performance",
        label: "Journey Performance",
        category: "Marketing",
        endpoint: "/reports/inbuilt/journey-performance",
        description: "Enrollment, active, exited, converted, and unsubscribed counts per marketing journey.",
    },
    {
        value: "marketing_attribution_summary",
        label: "Marketing Attribution Summary",
        category: "Marketing",
        endpoint: "/reports/inbuilt/marketing-attribution-summary",
        description: "Conversion credit by UTM source across 8 attribution models (first/last touch, linear, U/W-shaped, time decay, and more).",
    },
    {
        // Gap checklist Module 17, item 7 (attribution explorer): same "built but never wired
        // to the UI" gap the funnel explorer had -- the backend/API/tests existed since this
        // module's original pass, but this was never added to the catalog either.
        value: "attribution_explorer",
        label: "Attribution Explorer (touch paths)",
        category: "Marketing",
        endpoint: "/reports/inbuilt/attribution-explorer",
        description: "Full per-record touch paths, assisted conversions, source/journey/partner credit breakdown, and ROI across 8 attribution models.",
    },
    {
        value: "sender_reputation",
        label: "Sender Reputation",
        category: "Marketing",
        endpoint: "/reports/inbuilt/sender-reputation",
        description: "Bounce/complaint/unsubscribe rates, delivery latency, and top failure reasons by channel.",
    },
    {
        value: "campaign_roi",
        label: "Campaign & Journey ROI",
        category: "Marketing",
        endpoint: "/reports/inbuilt/campaign-roi",
        description: "Cost-per-send and ROI per marketing journey, from logged spend/budget and attributed won-deal revenue.",
    },
    {
        value: "period_comparison",
        label: "Period Comparison",
        category: "Cohort",
        endpoint: "/reports/inbuilt/period-comparison",
        description: "Leads, opportunities, wins, and win rate for this period vs. the prior one (week/month/quarter), with percent change.",
    },
    {
        // Gap checklist Module 17, item 12 (funnel explorer): the backend/API for this report
        // has existed and been tested since this module's original pass, but was never actually
        // added to this catalog -- unreachable from the UI until now.
        value: "funnel_explorer",
        label: "Funnel Explorer",
        category: "Cohort",
        endpoint: "/reports/inbuilt/funnel-explorer",
        description: "Stage aging, drop-off reasons, re-entry, and win-rate comparison by source, owner, opportunity type, or partner.",
    },
    {
        value: "cohort_funnel_progression",
        label: "Cohort Funnel Progression",
        category: "Cohort",
        endpoint: "/reports/inbuilt/cohort-funnel-progression",
        description: "Lead cohorts (by created date, source, campaign, score band, owner, or sales group) and how each progresses through opportunity stages.",
    },
    {
        // Gap checklist Module 17, item 9 (anomaly detection). All 7 domains share one
        // rolling-average ± standard-deviation baseline -- see the preview-row mapping below
        // for how each domain's summary is flattened for this table.
        value: "anomaly_detection",
        label: "Anomaly Detection",
        category: "Governance",
        endpoint: "/reports/inbuilt/anomaly-detection",
        description: "Lead volume, conversions, SLA breaches, payout amounts, campaign performance, scoring drift, and service backlog vs. a 14-day rolling baseline.",
    },
    {
        // Gap checklist Module 17, item 10 (forecasting-lite). All 4 buildable domains share
        // one linear-regression trend projection method -- see the preview-row mapping below.
        value: "forecast",
        label: "Forecast",
        category: "Governance",
        endpoint: "/reports/inbuilt/forecast",
        description: "Linear-regression trend projection for campaign volume, task backlog, SLA breach risk, and partner payout, 7 days ahead.",
    },
    {
        // Gap checklist Module 17, item 12 (executive scorecards). One combined page across
        // the 8 buildable areas (admissions summary stays excluded -- no Application schema).
        // Sensitive by nature, gated the same way campaign_roi already is.
        value: "executive_scorecard",
        label: "Executive Scorecard",
        category: "Governance",
        endpoint: "/reports/inbuilt/executive-scorecard",
        description: "Marketing ROI, counselor productivity, partner performance, payout exposure, scoring quality, service SLA, telephony, and data quality in one view.",
    },
    {
        value: "data_quality",
        label: "Data Quality",
        category: "Governance",
        endpoint: "/reports/inbuilt/data-quality",
        description: "Duplicate, stale, ownerless, missing-field, invalid-UTM, SLA-breach, and stage-required-field data-quality issues.",
    },
    {
        value: "data_quality_history",
        label: "Data Quality Trend",
        category: "Governance",
        endpoint: "/reports/inbuilt/data-quality-history",
        description: "Scheduled data-quality scorecard snapshots over time, one row per scan.",
    },
    {
        value: "task_sla_performance",
        label: "Task SLA Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/task-sla-performance",
        description: "Owner-level task first-action and completion SLA breach counts, plus a breakdown by module.",
    },
    {
        value: "automation_performance",
        label: "Automation Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/automation-performance",
        description: "Per-automation run counts, success rate, and average execution time, including automations that have never fired.",
    },
    {
        value: "form_drop_off",
        label: "Form Drop-off Analytics",
        category: "Marketing",
        endpoint: "/reports/inbuilt/form-drop-off",
        description: "Per-form, per-tab visitor drop-off funnel showing where real visitors abandon a multi-step form before submitting.",
    },
    {
        value: "split_test_performance",
        label: "Split Test Performance",
        category: "Operations",
        endpoint: "/reports/inbuilt/split-test-performance",
        description: "Per-automation split-test variant distribution and completion rate, computed from real execution history.",
    },
    {
        value: "distribution_fairness",
        label: "Distribution Fairness",
        category: "Operations",
        endpoint: "/reports/inbuilt/distribution-fairness",
        description: "Per-user record assignment counts and how far each user is from an even split, across all distribution rules.",
    },
];


export function formatReportCell(value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}


type MetricFieldRefState = { object: string; field: string };


// Gap checklist Module 17 ("dashboard/report versioning" -- change history + rollback).
export function ReportVersionHistoryDialog({ reportId, onClose, onRestored }: { reportId: string | null; onClose: () => void; onRestored: () => void }) {
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

    useEffect(() => {
        if (!reportId) return;
        setLoading(true);
        apiFetch<any[]>(`/reports/custom/${reportId}/versions`)
            .then((data) => setVersions(Array.isArray(data) ? data : []))
            .catch((error: any) => toast.error(error.message || "Failed to load version history"))
            .finally(() => setLoading(false));
    }, [reportId]);

    const restore = async (version: number) => {
        if (!reportId) return;
        setRestoringVersion(version);
        try {
            await apiFetch(`/reports/custom/${reportId}/versions/${version}/restore`, { method: "POST" });
            toast.success(`Version ${version} is now the draft`, { description: "Publish it to make it what runs." });
            onRestored();
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to restore version");
        } finally {
            setRestoringVersion(null);
        }
    };

    return (
        <StandardDialog open={!!reportId} onClose={onClose} title="Version history" subtitle="Restoring a version makes it the draft; nothing that runs changes until you publish.">
            {loading ? (
                <Skeleton className="m-4 h-24 rounded-xl" />
            ) : versions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No published versions yet. Publish the report to create the first one.</p>
            ) : (
                <div className="space-y-2 p-4">
                    {versions.map((version) => (
                        <div key={version.id} className="flex min-w-0 flex-wrap items-center justify-between rounded-lg bg-accent p-3">
                            <div>
                                <div className="text-sm font-bold">Version {version.version}</div>
                                <div className="text-xs text-muted-foreground">
                                    {version.publishNotes || "No notes"} • {formatWorkspaceDate(version.publishedAt)}
                                </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => restore(version.version)} disabled={restoringVersion === version.version}>
                                <RotateCcw className="size-4" />
                                {restoringVersion === version.version ? "Restoring..." : "Restore as draft"}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </StandardDialog>
    );
}
