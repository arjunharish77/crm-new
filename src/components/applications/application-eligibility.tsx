"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { useEditorDismissGuard } from "@/hooks/use-editor-dismiss-guard";
import { canUseApplications } from "@/lib/application-access";
import { educationLevels } from "@/lib/application-eligibility";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/common/error-state";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ApplicationSelect, applicationErrorMessage } from "./fields";
const labels: Record<string, string> = {
    MET: "Configured checks met",
    NOT_MET: "Requirements not met",
    NEEDS_INFO: "More information needed",
    MANUAL_REVIEW: "Manual review required",
    NOT_CONFIGURED: "No eligibility rules configured",
};
export function ApplicationEligibility({ applicationId }: { applicationId: string }) {
    const { user } = useAuth();
    const [data, setData] = useState<any>(null),
        [error, setError] = useState(""),
        [attempt, setAttempt] = useState(0),
        [open, setOpen] = useState(false);
    const { draft, update, current } = useRetainedEditorDraft(`application:eligibility:${applicationId}`);
    const form = draft.values?.form;
    const canDismiss = useEditorDismissGuard(open && draft.dirty, open && draft.pending, () =>
        update({ values: null, dirty: false, error: "" }),
    );
    const close = () => {
        if (canDismiss()) setOpen(false);
    };
    useEffect(() => {
        const controller = new AbortController();
        setError("");
        setData(null);
        apiFetch(`/applications/${applicationId}/eligibility`, { signal: controller.signal })
            .then((value) => {
                if (!controller.signal.aborted) setData(value);
            })
            .catch((e) => {
                if (!controller.signal.aborted) setError(applicationErrorMessage(e));
            });
        return () => controller.abort();
    }, [applicationId, attempt]);
    const field = (key: string, value: any) => update({ values: { form: { ...form, [key]: value } }, dirty: true, error: "" });
    const save = async () => {
        if (current().pending || !form) return;
        update({ pending: true, error: "" });
        try {
            await apiFetch(`/applications/${applicationId}/eligibility`, {
                method: "PUT",
                body: JSON.stringify({
                    version: form.version,
                    facts: {
                        educationLevel: form.educationLevel,
                        percentage: form.percentage,
                        entranceExams: form.examsText
                            .split("\n")
                            .map((v: string) => v.trim())
                            .filter(Boolean),
                        examInformationProvided: form.examInformationProvided,
                        notes: form.notes,
                    },
                }),
            });
            update({ values: null, dirty: false, error: "" });
            setOpen(false);
            setAttempt((n) => n + 1);
        } catch (e) {
            update({ error: applicationErrorMessage(e) });
        } finally {
            update({ pending: false });
        }
    };
    return (
        <Card className="min-w-0 gap-3 p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold">Eligibility</h2>
                {data && canUseApplications(user, "update") && (
                    <Button
                        className="h-auto min-h-10 max-w-full whitespace-normal"
                        variant="outline"
                        onClick={() => {
                            if (!current().values)
                                update({
                                    values: {
                                        form: { ...data.facts, version: data.version, examsText: data.facts.entranceExams.join("\n") },
                                    },
                                    dirty: false,
                                    error: "",
                                });
                            setOpen(true);
                        }}
                    >
                        Edit eligibility information
                    </Button>
                )}
            </div>
            <p className="text-sm text-muted-foreground">
                Checks use saved applicant information and the current program/course rules. They support review; configured stages may
                require them to be met. They do not constitute an admission decision or verify supporting documents.
            </p>
            {error ? (
                <ErrorState description={error} onRetry={() => setAttempt((n) => n + 1)} />
            ) : !data ? (
                <p role="status">Loading eligibility…</p>
            ) : (
                <>
                    <p role="status" className="font-medium">
                        {labels[data.evaluation.status]}
                    </p>
                    {data.evaluation.checks.length > 0 && (
                        <details className="min-w-0 space-y-3">
                            <summary className="cursor-pointer break-words text-sm font-medium">
                                View check details ({data.evaluation.checks.length})
                            </summary>
                            <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
                                {data.evaluation.checks.map((check: any, index: number) => (
                                    <li key={check.ruleId + ":" + index} className="min-w-0 space-y-1 rounded-md border p-3">
                                        <p className="break-words font-medium">
                                            {check.ruleName} · {check.criterion}
                                        </p>
                                        <p className="text-sm">{labels[check.status]}</p>
                                        <p className="break-words text-sm text-muted-foreground">{check.detail}</p>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    {data.facts.notes && <p className="whitespace-pre-wrap break-words text-sm">Reviewer notes: {data.facts.notes}</p>}
                </>
            )}
            <StandardDialog
                open={open}
                onClose={close}
                title="Eligibility information"
                subtitle="Record the qualifying education and completed exams."
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="h-auto min-h-10 max-w-full whitespace-normal"
                            disabled={draft.pending}
                            onClick={close}
                        >
                            Cancel
                        </Button>
                        <Button className="h-auto min-h-10 max-w-full whitespace-normal" disabled={draft.pending} onClick={save}>
                            {draft.pending ? "Saving…" : "Save information"}
                        </Button>
                    </>
                }
            >
                <fieldset disabled={draft.pending} className="min-w-0 space-y-4">
                    <ApplicationSelect
                        id="eligibility-education"
                        label="Qualifying education level"
                        optional
                        value={form?.educationLevel || ""}
                        items={educationLevels}
                        onChange={(value) => field("educationLevel", value || null)}
                    />
                    <div className="space-y-2">
                        <Label htmlFor="eligibility-percentage">Qualifying marks (%)</Label>
                        <Input
                            id="eligibility-percentage"
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            value={form?.percentage ?? ""}
                            onChange={(e) => field("percentage", e.target.value === "" ? null : Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="eligibility-exams">Completed entrance exams (one per line)</Label>
                        <textarea
                            id="eligibility-exams"
                            className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3 text-sm"
                            value={form?.examsText || ""}
                            onChange={(e) => field("examsText", e.target.value)}
                        />
                    </div>
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id="eligibility-exams-confirmed"
                            checked={form?.examInformationProvided || false}
                            onCheckedChange={(value) => field("examInformationProvided", value === true)}
                        />
                        <Label htmlFor="eligibility-exams-confirmed" className="leading-normal">
                            Entrance-exam information is complete, including if no exams were completed
                        </Label>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="eligibility-notes">Reviewer notes</Label>
                        <textarea
                            id="eligibility-notes"
                            className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3 text-sm"
                            maxLength={2000}
                            value={form?.notes || ""}
                            onChange={(e) => field("notes", e.target.value)}
                        />
                    </div>
                    {draft.dirty && (
                        <p className="text-xs text-muted-foreground">Your draft stays during navigation. Refresh or sign out clears it.</p>
                    )}
                    {draft.error && (
                        <div className="space-y-2">
                            <p role="alert" className="break-words text-sm text-destructive">
                                {draft.error}
                            </p>
                            <Button
                                variant="outline"
                                className="h-auto min-h-10 max-w-full whitespace-normal"
                                disabled={draft.pending}
                                onClick={() => {
                                    if (canDismiss()) {
                                        update({ values: null, dirty: false, error: "" });
                                        setOpen(false);
                                        setAttempt((n) => n + 1);
                                    }
                                }}
                            >
                                Discard and reload
                            </Button>
                        </div>
                    )}
                </fieldset>
            </StandardDialog>
        </Card>
    );
}
