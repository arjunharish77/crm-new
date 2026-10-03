"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";


const CATALOG_OBJECT_LABELS: Record<string, string> = {
    lead: "Lead",
    opportunity: "Opportunity",
    activity: "Activity",
    stage: "Opportunity Stage",
    activityType: "Activity Type",
    leadOwner: "Lead Owner",
    opportunityOwner: "Opportunity Owner",
    activityCreator: "Activity Creator",
    assignedTo: "Assigned To",
    assignmentLog: "Assignment Log",
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


// Gap checklist Module 17, item 2 (analytics dataset catalog). A real, browsable listing of
// what the custom-report-builder's query engine already models as a joinable object graph
// (`getReportQueryCatalog`/`FIELD_CATALOG` in reporting-query.ts) -- reusing the exact same
// `GET /reports/query` endpoint the builder's own field picker already calls, not a new
// backend. Deliberately NOT a claim of full dataset-catalog coverage: this surfaces the 3
// root objects (lead/opportunity/activity), their existing join targets, Task/TelephonyCallLog/
// Case (join-only satellites reachable via leadId/opportunityId), and -- as of this pass --
// partners/payouts (Opportunity-only, via CommissionLedger), communications, journeys, and
// scoring (all three reachable from both lead/opportunity roots via a polymorphic entityType/
// recordType FK, the same pattern AssignmentLog already used), and custom fields (via a real
// CustomFieldValue table, resolved by FieldDefinition id -- deliberately excluded from this
// static catalog object below since its field list is per-tenant dynamic, not fixed; see the
// "customField" entry in reporting-query.ts's FIELD_CATALOG for the full design rationale).
// Still missing: applications (no schema exists at all -- Module 12's Product Catalog, unbuilt).
export function DataCatalogSection() {
    const [catalog, setCatalog] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch<{ objects: Record<string, string[]> }>("/reports/query")
            .then((data) => setCatalog(data.objects ?? {}))
            .catch(() => toast.error("Failed to load the data catalog"))
            .finally(() => setLoading(false));
    }, []);

    const objects = Object.entries(catalog);

    return (
        <Card className="rounded-2xl">
            <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
                <div>
                    <h2 className="text-lg font-bold">Data Catalog</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Objects and fields available to the Custom Report Builder and Advanced Filters.
                    </p>
                </div>

                {loading ? (
                    <Skeleton className="h-32 w-full rounded-xl" />
                ) : objects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No catalog data available.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {objects.map(([object, fields]) => (
                            <div key={object} className="rounded-xl border p-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-bold">{CATALOG_OBJECT_LABELS[object] ?? object}</h3>
                                    <Badge variant="outline" className="rounded-md text-xs">{fields.length} fields</Badge>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {fields.map((field) => (
                                        <Badge key={field} variant="outline" className="rounded-md text-xs font-normal text-muted-foreground">
                                            {field}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    This catalog reflects what the Custom Report Builder&apos;s query engine can join and filter on today -- it does not yet cover
                    applications (no schema exists at all). Partners, payouts, communications, journeys, and scoring are all joinable now
                    (see Partner/Payout/Communication/Journey Enrollment/Predictive Score above). Custom fields are also queryable via the API
                    (each tenant&apos;s own fields, resolved by id) but aren&apos;t shown as a card here since the field list is per-tenant
                    dynamic, not a fixed catalog -- and aren&apos;t yet wired into this visual builder&apos;s dropdowns below, only reachable
                    directly today.
                </p>
            </CardContent>
        </Card>
    );
}
