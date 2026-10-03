"use client";
import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { useEditorDismissGuard } from "@/hooks/use-editor-dismiss-guard";
import { canUseApplications } from "@/lib/application-access";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ApplicationSelect, applicationErrorMessage } from "./fields";
import { useConfirm } from "@/components/common/dialogs-provider";

export function DocumentActions({ applicationId, item, onChanged }: { applicationId: string; item: any; onChanged: () => void }) {
    const confirmAction = useConfirm();
    const { user } = useAuth();
    const { draft, update, current } = useRetainedEditorDraft(`application:document:${applicationId}:${item.id}`);
    const [open, setOpen] = useState(false),
        [downloading, setDownloading] = useState(false),
        [downloadError, setDownloadError] = useState("");
    const values = draft.values;
    const canDismiss = useEditorDismissGuard(open && draft.dirty, open && draft.pending, () =>
        update({ values: null, dirty: false, error: "" }),
    );
    const close = () => {
        if (canDismiss()) setOpen(false);
    };
    const begin = async (mode: "upload" | "review") => {
        if (current().pending) {
            setOpen(true);
            return;
        }
        if (current().values?.mode === mode) {
            setOpen(true);
            return;
        }
        if (
            current().dirty &&
            !(await confirmAction({
                title: "Discard changes?",
                description: "Your unsaved document changes will be lost.",
                confirmLabel: "Discard",
                destructive: true,
            }))
        )
            return;
        update({
            values:
                mode === "upload"
                    ? { mode, file: null, requestKey: crypto.randomUUID() }
                    : {
                          mode,
                          documentId: item.documentId,
                          version: item.reviewVersion ?? 0,
                          status: "VERIFIED",
                          comments: item.comments || "",
                          rejectionReason: item.rejectionReason || "",
                          expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : "",
                      },
            dirty: false,
            error: "",
        });
        setOpen(true);
    };
    const field = (key: string, value: any) => update({ values: { ...values, [key]: value }, dirty: true, error: "" });
    const save = async () => {
        if (current().pending || !values) return;
        update({ pending: true, error: "" });
        try {
            if (values.mode === "upload") {
                const file = values.file as File;
                if (!file || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose a nonempty PDF, PNG or JPEG up to 5 MB.");
                const params = new URLSearchParams({ checklistItemId: item.id, filename: file.name, requestKey: values.requestKey });
                await apiFetch(`/applications/${applicationId}/documents?${params}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: file,
                });
            } else {
                await apiFetch(`/applications/${applicationId}/documents/${values.documentId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        version: values.version,
                        status: values.status,
                        comments: values.comments,
                        rejectionReason: values.rejectionReason,
                        expiryDate: values.expiryDate || null,
                    }),
                });
            }
            update({ values: null, dirty: false, error: "" });
            setOpen(false);
            onChanged();
        } catch (e) {
            update({ error: applicationErrorMessage(e) });
        } finally {
            update({ pending: false });
        }
    };
    const download = async () => {
        if (downloading) return;
        setDownloading(true);
        setDownloadError("");
        try {
            const response = await fetch(`/api/applications/${applicationId}/documents/${item.documentId}`);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || "Unable to download this document.");
            }
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = item.filename || "document";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (e) {
            setDownloadError(applicationErrorMessage(e));
        } finally {
            setDownloading(false);
        }
    };
    return (
        <div className="min-w-0 space-y-2">
            {item.filename && <p className="break-words text-sm">File: {item.filename}</p>}
            {item.comments && <p className="break-words text-sm">Comments: {item.comments}</p>}
            <div className="flex min-w-0 flex-wrap gap-2">
                {canUseApplications(user, "update") && (
                    <Button
                        className="h-auto min-h-9 max-w-full whitespace-normal"
                        size="sm"
                        variant="outline"
                        onClick={() => begin("upload")}
                    >
                        {item.documentId ? "Upload replacement" : "Upload document"}
                    </Button>
                )}
                {item.fileObjectId && (
                    <Button
                        className="h-auto min-h-9 max-w-full whitespace-normal"
                        size="sm"
                        variant="outline"
                        disabled={downloading}
                        onClick={download}
                    >
                        {downloading ? "Downloading…" : "Download"}
                    </Button>
                )}
                {item.fileObjectId && canUseApplications(user, "manage") && (
                    <Button
                        className="h-auto min-h-9 max-w-full whitespace-normal"
                        size="sm"
                        variant="outline"
                        onClick={() => begin("review")}
                    >
                        Review document
                    </Button>
                )}
            </div>
            {downloadError && (
                <p role="alert" className="break-words text-sm text-destructive">
                    {downloadError}
                </p>
            )}
            <StandardDialog
                open={open}
                onClose={close}
                title={values?.mode === "review" ? "Review document" : "Upload document"}
                subtitle={item.name}
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
                        <Button
                            className="h-auto min-h-10 max-w-full whitespace-normal"
                            disabled={draft.pending || (values?.mode === "upload" && !values?.file)}
                            onClick={save}
                        >
                            {draft.pending ? "Saving…" : values?.mode === "review" ? "Save review" : "Upload file"}
                        </Button>
                    </>
                }
            >
                <fieldset disabled={draft.pending} className="min-w-0 space-y-4">
                    {values?.mode === "upload" ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor={"application-file-" + item.id}>Choose file</Label>
                                <Input
                                    id={"application-file-" + item.id}
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file)
                                            update({
                                                values: { ...values, file, requestKey: crypto.randomUUID() },
                                                dirty: true,
                                                error: "",
                                            });
                                    }}
                                />
                            </div>
                            {values.file && <p className="break-words text-sm">Selected: {values.file.name}</p>}
                            <p className="text-sm text-muted-foreground">
                                PDF, PNG or JPEG, up to 5 MB. A replacement starts a new review; previous files are preserved.
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Files are private. Automated malware scanning is not configured.
                            </p>
                        </>
                    ) : (
                        <>
                            <ApplicationSelect
                                id={"document-decision-" + item.id}
                                label="Review decision"
                                value={values?.status || "VERIFIED"}
                                onChange={(value) => field("status", value)}
                                items={[
                                    { id: "VERIFIED", name: "Verified" },
                                    { id: "REJECTED", name: "Rejected" },
                                ]}
                            />
                            {values?.status === "REJECTED" && (
                                <div className="space-y-2">
                                    <Label htmlFor={"rejection-" + item.id}>Rejection reason</Label>
                                    <Input
                                        id={"rejection-" + item.id}
                                        maxLength={1000}
                                        value={values.rejectionReason}
                                        onChange={(e) => field("rejectionReason", e.target.value)}
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor={"expiry-" + item.id}>Expiry date (optional)</Label>
                                <Input
                                    id={"expiry-" + item.id}
                                    type="date"
                                    value={values?.expiryDate || ""}
                                    onChange={(e) => field("expiryDate", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={"comments-" + item.id}>Review comments</Label>
                                <textarea
                                    id={"comments-" + item.id}
                                    className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3 text-sm"
                                    maxLength={2000}
                                    value={values?.comments || ""}
                                    onChange={(e) => field("comments", e.target.value)}
                                />
                            </div>
                        </>
                    )}
                    {draft.dirty && (
                        <p className="text-xs text-muted-foreground">Your draft stays during navigation; refresh or sign out clears it.</p>
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
                                        onChanged();
                                    }
                                }}
                            >
                                Discard and reload status
                            </Button>
                        </div>
                    )}
                </fieldset>
            </StandardDialog>
        </div>
    );
}
