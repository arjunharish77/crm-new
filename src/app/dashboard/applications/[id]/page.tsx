"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ApplicationEligibility } from "@/components/applications/application-eligibility";
import { ApplicationWorkflow } from "@/components/applications/application-workflow";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { applicationErrorMessage } from "@/components/applications/fields";
import { useRecordTitle } from "@/components/app-states/page-title";
export default function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [record, setRecord] = useState<any>(null),
        [error, setError] = useState(""),
        [attempt, setAttempt] = useState(0);
    useRecordTitle(record?.applicationNumber);
    useEffect(() => {
        const controller = new AbortController();
        setRecord(null);
        setError("");
        apiFetch("/applications/" + id, { signal: controller.signal })
            .then((value) => {
                if (!controller.signal.aborted) setRecord(value);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(applicationErrorMessage(error));
            });
        return () => controller.abort();
    }, [id, attempt]);
    return (
        <div className="min-w-0 space-y-4">
            <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" variant="outline" asChild>
                <Link href="/dashboard/applications">Back to applications</Link>
            </Button>
            {error ? (
                <ErrorState description={error} onRetry={() => setAttempt((n) => n + 1)} />
            ) : !record ? (
                <p role="status">Loading application…</p>
            ) : (
                <>
                    <PageHeader title={record.applicationNumber} description={record.applicantName || "Applicant unavailable"} />
                    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
                        <Card className="min-w-0 gap-3 p-4">
                            <h2 className="font-semibold">Application details</h2>
                            <dl className="space-y-3">
                                {[
                                    ["University", record.universityName],
                                    ["Program", record.programName],
                                    ["Course", record.courseName || "Not selected"],
                                    ["Intake", record.intakeName || "Not selected"],
                                    ["Stage", record.stageName],
                                    ["Owner", record.ownerName || "Unassigned"],
                                    ["Created", formatWorkspaceDateTime(record.createdAt)],
                                ].map(([label, value]) => (
                                    <div key={label} className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">{label}</dt>
                                        <dd className="break-words">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Card>
                        <Card className="min-w-0 gap-3 p-4">
                            <h2 className="font-semibold">Stage history</h2>
                            {record.history.length ? (
                                record.history.map((item: any) => (
                                    <div key={item.id} className="mb-4 space-y-1 border-l-2 pl-3">
                                        <p className="break-words font-medium">{item.stageName}</p>
                                        <p className="break-words text-sm">{item.notes}</p>
                                        <p className="break-words text-xs text-muted-foreground">
                                            {item.changedByName || "System"} · {formatWorkspaceDateTime(item.changedAt)}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p>No stage history yet.</p>
                            )}
                        </Card>
                    </div>
                    <ApplicationEligibility applicationId={id} />
                    <ApplicationWorkflow applicationId={id} stageId={record.stageId} onChanged={() => setAttempt((n) => n + 1)} />
                </>
            )}
        </div>
    );
}
