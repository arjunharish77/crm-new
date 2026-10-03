"use client";
import { DocumentActions } from "./document-actions";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { canUseApplications } from "@/lib/application-access";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/common/error-state";
import { ApplicationSelect, applicationErrorMessage } from "./fields";
import { useConfirm } from "@/components/common/dialogs-provider";

export function ApplicationWorkflow({
    applicationId,
    stageId,
    onChanged,
}: {
    applicationId: string;
    stageId: string;
    onChanged: () => void;
}) {
    const confirmAction = useConfirm();
    const { user } = useAuth();
    const [reminderPending, setReminderPending] = useState(false),
        [reminderError, setReminderError] = useState("");
    const reminderSaving = useRef(false);
    const toggleReminder = async () => {
        if (reminderSaving.current || !data) return;
        reminderSaving.current = true;
        setReminderPending(true);
        setReminderError("");
        try {
            const reminder = await apiFetch(`/applications/${applicationId}/reminders`, {
                method: "PUT",
                body: JSON.stringify({ enabled: !data.reminder?.enabled }),
            });
            setData((current: any) => ({ ...current, reminder }));
        } catch (error) {
            setReminderError(applicationErrorMessage(error));
        } finally {
            reminderSaving.current = false;
            setReminderPending(false);
        }
    };
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const { draft, update, current } = useRetainedEditorDraft(`application:stage:${applicationId}`);
    const form = draft.values?.form ?? { stageId: "", reason: "", expectedStageId: stageId };
    useEffect(() => {
        const controller = new AbortController();
        setError("");
        apiFetch(`/applications/${applicationId}/workflow`, { signal: controller.signal })
            .then((value) => {
                if (!controller.signal.aborted) setData(value);
            })
            .catch((e) => {
                if (!controller.signal.aborted) setError(applicationErrorMessage(e));
            });
        return () => controller.abort();
    }, [applicationId, stageId, attempt]);
    const change = (patch: Record<string, string>) => update({ values: { form: { ...form, ...patch } }, dirty: true, error: "" });
    const save = async () => {
        if (current().pending) return;
        update({ pending: true, error: "" });
        try {
            await apiFetch(`/applications/${applicationId}/stage`, { method: "POST", body: JSON.stringify(form) });
            update({ values: null, dirty: false, savedValues: { stageChanged: true } });
            onChanged();
        } catch (e) {
            update({ error: applicationErrorMessage(e) });
        } finally {
            update({ pending: false });
        }
    };
    const restart = async () => {
        if (current().pending) return;
        if (
            current().dirty &&
            !(await confirmAction({
                title: "Discard stage change?",
                description: "Your unsaved stage change will be lost and the application refreshed.",
                confirmLabel: "Discard and refresh",
                destructive: true,
            }))
        )
            return;
        update({ values: null, dirty: false, error: "" });
        onChanged();
    };
    const canUpdate = canUseApplications(user, "update");
    const target = data?.stages.find((s: any) => s.id === form.stageId);
    return (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            <Card className="min-w-0 gap-0 space-y-3 p-4">
                <h2 className="font-semibold">Document checklist</h2>
                <p className="text-sm text-muted-foreground">
                    Active requirements for this program. The latest document determines each status. Upload a document or replacement, then
                    review it before entering a stage that requires verification.
                </p>
                {data?.canManageReminder && (
                    <div className="min-w-0 space-y-2 rounded-md border p-3">
                        <h3 className="text-sm font-medium">Daily document reminders</h3>
                        <p className="text-sm text-muted-foreground">
                            Remind me in the notification bell when required documents need attention. The first check is after 24 hours.
                            Closed or won applications are skipped. Application notification preferences apply.
                        </p>
                        <p role="status" className="text-sm">
                            {data.reminder?.enabled ? "Reminders are on." : "Reminders are off."}
                        </p>
                        <Button
                            variant="outline"
                            className="h-auto min-h-10 max-w-full whitespace-normal"
                            disabled={reminderPending}
                            onClick={toggleReminder}
                        >
                            {reminderPending ? "Saving…" : data.reminder?.enabled ? "Turn off reminders" : "Enable daily reminders"}
                        </Button>
                        {reminderError && (
                            <p role="alert" className="break-words text-sm text-destructive">
                                {reminderError}
                            </p>
                        )}
                    </div>
                )}
                {error ? (
                    <ErrorState description={error} onRetry={() => setAttempt((n) => n + 1)} />
                ) : !data ? (
                    <p role="status">Loading checklist…</p>
                ) : !data.checklist.length ? (
                    <p className="text-sm">No active checklist items. Configure requirements in Settings → Catalog.</p>
                ) : (
                    <ul className="space-y-3">
                        {data.checklist.map((item: any) => (
                            <li key={item.id} className="min-w-0 space-y-1 rounded-md border p-3">
                                <p className="break-words font-medium">{item.name}</p>
                                <p className="text-sm">
                                    {item.isRequired ? "Required" : "Optional"} ·{" "}
                                    {(
                                        {
                                            MISSING: "Missing document",
                                            PENDING: "Awaiting verification",
                                            VERIFIED: "Verified",
                                            REJECTED: "Rejected",
                                            EXPIRED: "Expired",
                                        } as Record<string, string>
                                    )[item.status] || "Awaiting verification"}
                                </p>
                                {item.description && <p className="break-words text-sm text-muted-foreground">{item.description}</p>}
                                {item.rejectionReason && <p className="break-words text-sm">Review feedback: {item.rejectionReason}</p>}
                                {item.expiryDate && <p className="text-sm">Expiry: {String(item.expiryDate).slice(0, 10)}</p>}
                                {item.reviewerName && <p className="break-words text-sm">Reviewer: {item.reviewerName}</p>}
                                <DocumentActions applicationId={applicationId} item={item} onChanged={() => setAttempt((n) => n + 1)} />
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <Card className="min-w-0 gap-0 space-y-3 p-4">
                <h2 className="font-semibold">Change stage</h2>
                <p className="text-sm text-muted-foreground">
                    Every change requires a reason and is recorded in history. Closing, marking won or reopening requires Applications
                    manage permission. A stage change does not create an enrollment.
                </p>
                {!canUpdate ? (
                    <p className="text-sm">You need Applications update permission to change the stage.</p>
                ) : (
                    <fieldset disabled={draft.pending} className="min-w-0 space-y-4">
                        <ApplicationSelect
                            id="application-next-stage"
                            label="Next stage"
                            value={form.stageId}
                            onChange={(value) => change({ stageId: value })}
                            disabled={!data || !!error}
                            items={(data?.stages ?? []).filter((s: any) => s.id !== stageId).map((s: any) => ({ id: s.id, name: s.name }))}
                        />
                        {target?.requiresEligibility && (
                            <p className="text-sm">
                                This stage requires all saved eligibility checks to be met. Missing information, manual-review conditions or
                                no configured rules block entry.
                            </p>
                        )}
                        {target?.requiresVerifiedDocuments && (
                            <p className="text-sm">This stage requires all required documents to be verified and unexpired.</p>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="application-stage-reason">Reason for change</Label>
                            <textarea
                                id="application-stage-reason"
                                className="min-h-28 w-full min-w-0 rounded-md border bg-background p-3 text-sm"
                                maxLength={2000}
                                value={form.reason}
                                onChange={(e) => change({ reason: e.target.value })}
                            />
                        </div>
                        {draft.dirty && (
                            <p className="text-xs text-muted-foreground">
                                This draft stays during navigation. Refresh or sign out clears it.
                            </p>
                        )}
                        {draft.error && (
                            <p role="alert" className="break-words text-sm text-destructive">
                                {draft.error}
                            </p>
                        )}
                        {draft.savedValues?.stageChanged && !draft.dirty && (
                            <p role="status" className="text-sm">
                                Stage change saved.
                            </p>
                        )}
                        <div className="flex min-w-0 flex-wrap gap-2">
                            <Button
                                className="h-auto min-h-10 max-w-full whitespace-normal"
                                disabled={draft.pending || !form.stageId || form.reason.trim().length < 3 || !!error || !data}
                                onClick={save}
                            >
                                {draft.pending ? "Saving…" : "Save stage change"}
                            </Button>
                            <Button
                                className="h-auto min-h-10 max-w-full whitespace-normal"
                                variant="outline"
                                disabled={draft.pending}
                                onClick={restart}
                            >
                                Discard and refresh
                            </Button>
                        </div>
                    </fieldset>
                )}
            </Card>
        </div>
    );
}
