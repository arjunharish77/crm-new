"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { canUseApplications } from "@/lib/application-access";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/common/list-toolbar";
import { ColumnDef } from "@tanstack/react-table";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ErrorState } from "@/components/common/error-state";
import { ApplicationSelect, applicationErrorMessage } from "@/components/applications/fields";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
import { useEditorDismissGuard } from "@/hooks/use-editor-dismiss-guard";
import { formatWorkspaceDateTime } from "@/lib/date-format";
const EMPTY = { leadId: "", programId: "", stageId: "", courseId: "", intakeId: "", opportunityId: "", requestKey: "" };
export default function ApplicationsPage() {
    const { user, isLoading } = useAuth();
    const enabled = useModuleEnabled("PRODUCT_CATALOG");
    const allowed = canUseApplications(user, "read") && enabled;
    const router = useRouter();
    const [search, setSearch] = useState(""),
        [page, setPage] = useState(1),
        [rows, setRows] = useState<any[]>([]),
        [total, setTotal] = useState(0),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [attempt, setAttempt] = useState(0),
        [open, setOpen] = useState(false);
    const { draft, update, current } = useRetainedEditorDraft("application:create");
    const form: typeof EMPTY = draft.values?.form ?? EMPTY;
    const setField = (key: keyof typeof EMPTY, value: string) =>
        update({
            values: {
                form: {
                    ...form,
                    [key]: value,
                    ...(key === "programId"
                        ? { stageId: "", courseId: "", intakeId: "", opportunityId: "" }
                        : key === "leadId"
                          ? { opportunityId: "" }
                          : {}),
                },
            },
            dirty: true,
        });
    const canDismiss = useEditorDismissGuard(open && draft.dirty, open && draft.pending, () =>
        update({ values: null, dirty: false, error: "" }),
    );
    const close = () => {
        if (canDismiss()) setOpen(false);
    };
    const [leadSearch, setLeadSearch] = useState(""),
        [options, setOptions] = useState<any>({ leads: [], programs: [], stages: [], courses: [], intakes: [], opportunities: [] }),
        [optionError, setOptionError] = useState(""),
        [optionsLoading, setOptionsLoading] = useState(false),
        [optionAttempt, setOptionAttempt] = useState(0);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    useEffect(() => {
        if (!allowed) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const timer = setTimeout(
            () =>
                apiFetch<any>(`/applications?search=${encodeURIComponent(search)}&page=${page}`, { signal: controller.signal })
                    .then((result) => {
                        if (!controller.signal.aborted) {
                            setRows(result.data);
                            setTotal(result.total);
                        }
                    })
                    .catch((error) => {
                        if (!controller.signal.aborted) setError(applicationErrorMessage(error));
                    })
                    .finally(() => {
                        if (!controller.signal.aborted) setLoading(false);
                    }),
            200,
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [allowed, search, page, attempt]);
    useEffect(() => {
        if (!open || !allowed) return;
        const controller = new AbortController();
        setOptionsLoading(true);
        setOptionError("");
        const timer = setTimeout(
            () =>
                apiFetch<any>(
                    `/applications/options?search=${encodeURIComponent(leadSearch)}&programId=${encodeURIComponent(form.programId)}&leadId=${encodeURIComponent(form.leadId)}`,
                    { signal: controller.signal },
                )
                    .then((value) => {
                        if (!controller.signal.aborted) setOptions(value);
                    })
                    .catch((error) => {
                        if (!controller.signal.aborted) setOptionError(applicationErrorMessage(error));
                    })
                    .finally(() => {
                        if (!controller.signal.aborted) setOptionsLoading(false);
                    }),
            200,
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, allowed, leadSearch, form.programId, form.leadId, optionAttempt]);
    const create = async () => {
        if (current().pending) return;
        update({ pending: true, error: "" });
        try {
            const result = await apiFetch<any>("/applications", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    courseId: form.courseId || null,
                    intakeId: form.intakeId || null,
                    opportunityId: form.opportunityId || null,
                }),
            });
            update({ values: null, dirty: false, error: "" });
            if (alive.current) {
                setOpen(false);
                router.push("/dashboard/applications/" + result.id);
            }
        } catch (error) {
            update({ error: applicationErrorMessage(error) });
        } finally {
            update({ pending: false });
        }
    };
    const columns: ColumnDef<any, any>[] = [
        {
            accessorKey: "applicationNumber",
            header: "Application",
            size: 160,
            cell: ({ row }) => (
                <Link className="font-medium hover:underline" href={"/dashboard/applications/" + row.original.id} onClick={(event) => event.stopPropagation()}>
                    {row.original.applicationNumber}
                </Link>
            ),
        },
        { id: "applicant", header: "Applicant", size: 200, cell: ({ row }) => row.original.applicantName || <span className="text-muted-foreground">Applicant unavailable</span> },
        {
            id: "program",
            header: "Program",
            size: 260,
            cell: ({ row }) => (
                <div className="min-w-0">
                    <div className="truncate">{row.original.programName}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.original.universityName}</div>
                </div>
            ),
        },
        { id: "stage", header: "Stage", size: 160, cell: ({ row }) => (row.original.stageName ? <Badge tone="neutral">{row.original.stageName}</Badge> : "—") },
        { id: "intake", header: "Intake", size: 140, cell: ({ row }) => row.original.intakeName || <span className="text-muted-foreground">—</span> },
        { id: "created", header: "Created", size: 150, cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatWorkspaceDateTime(row.original.createdAt)}</span> },
    ];
    if (isLoading) return <p role="status">Loading applications…</p>;
    if (!allowed)
        return (
            <ErrorState
                description={
                    enabled
                        ? "Your role can\u2019t see applications. Ask an admin if you need access."
                        : "Applications aren\u2019t turned on for your workspace (Product catalog module)."
                }
            />
        );
    return (
        <div className="min-w-0 space-y-4">
            <PageHeader
                title="Applications"
                description="Track applicants by university, program and intake."
                actions={
                    <>
                        {canUseApplications(user, "manage") && (
                            <Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" variant="outline" asChild>
                                <Link href="/dashboard/applications/numbering">Numbering rules</Link>
                            </Button>
                        )}
                        {canUseApplications(user, "create") && (
                            <Button
                                className="h-auto min-h-10 max-w-full whitespace-normal break-words"
                                onClick={() => {
                                    if (!current().values)
                                        update({
                                            values: { form: { ...EMPTY, requestKey: crypto.randomUUID() } },
                                            dirty: false,
                                            error: "",
                                        });
                                    setOpen(true);
                                }}
                            >
                                New application
                            </Button>
                        )}
                    </>
                }
            />
            {/* A table with server paging instead of a card grid (UI/UX plan §5.16). */}
            <DataTable
                storageKey="applications-table"
                data={rows}
                columns={columns}
                loading={loading}
                error={error || null}
                onRetry={() => setAttempt((n) => n + 1)}
                getRowId={(row: any) => row.id}
                onRowClick={(row: any) => router.push("/dashboard/applications/" + row.id)}
                totalItems={total}
                manualPagination
                pageIndex={page - 1}
                pageSize={25}
                pageSizeOptions={[25]}
                onPaginationChange={({ pageIndex }) => setPage(pageIndex + 1)}
                toolbarActions={
                    <ListToolbar
                        search={{
                            value: search,
                            onChange: (value) => {
                                setSearch(value);
                                setPage(1);
                            },
                            placeholder: "Application number, applicant or program",
                            label: "Search applications",
                            inputId: "application-search",
                        }}
                    />
                }
                mobileCard={(row: any) => (
                    <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{row.applicationNumber}</span>
                            {row.stageName ? <Badge tone="neutral">{row.stageName}</Badge> : null}
                        </div>
                        <p className="break-words text-sm">{row.applicantName || "Applicant unavailable"}</p>
                        <p className="break-words text-xs text-muted-foreground">
                            {row.universityName} · {row.programName}
                            {row.intakeName ? " · " + row.intakeName : ""}
                        </p>
                    </div>
                )}
                emptyState={
                    search.trim()
                        ? {
                              kind: "no-match",
                              title: "No applications match",
                              description: "Try another application number, applicant or program.",
                              action: (
                                  <Button variant="outline" onClick={() => setSearch("")}>
                                      Clear search
                                  </Button>
                              ),
                          }
                        : {
                              title: "No applications yet",
                              description: "Applications need a program with an open application stage in the product catalog.",
                          }
                }
            />
            <StandardDialog
                open={open}
                onClose={close}
                title="New application"
                subtitle="The application number is assigned when you save."
                actions={
                    <>
                        <Button
                            className="h-auto min-h-10 max-w-full whitespace-normal break-words"
                            variant="outline"
                            disabled={draft.pending}
                            onClick={close}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-auto min-h-10 max-w-full whitespace-normal break-words"
                            disabled={draft.pending || optionsLoading || !!optionError || !form.leadId || !form.programId || !form.stageId}
                            onClick={create}
                        >
                            {draft.pending ? "Creating…" : "Create application"}
                        </Button>
                    </>
                }
            >
                <fieldset disabled={draft.pending} className="min-w-0 space-y-4">
                    {draft.dirty && (
                        <p className="text-xs text-muted-foreground">
                            This draft is kept during navigation. Refreshing or signing out clears it.
                        </p>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="applicant-search">Find applicant</Label>
                        <Input
                            id="applicant-search"
                            value={leadSearch}
                            onChange={(e) => setLeadSearch(e.target.value)}
                            placeholder="Search Lead names"
                        />
                        <p className="text-xs text-muted-foreground">Showing up to 50 accessible Leads. Search to narrow the list.</p>
                    </div>
                    {optionError ? <ErrorState description={optionError} onRetry={() => setOptionAttempt((n) => n + 1)} /> : null}
                    {optionsLoading && (
                        <p role="status" className="text-sm">
                            Loading available choices…
                        </p>
                    )}
                    <ApplicationSelect
                        id="application-lead"
                        label="Applicant (Lead)"
                        value={form.leadId}
                        onChange={(v) => setField("leadId", v)}
                        items={options.leads}
                    />
                    <ApplicationSelect
                        id="application-program"
                        label="Program"
                        value={form.programId}
                        onChange={(v) => setField("programId", v)}
                        items={options.programs.map((p: any) => ({ id: p.id, name: p.universityName + " — " + p.name }))}
                    />
                    <ApplicationSelect
                        id="application-stage"
                        label="Initial stage"
                        value={form.stageId}
                        onChange={(v) => setField("stageId", v)}
                        items={options.stages}
                        disabled={!form.programId || optionsLoading}
                    />
                    <ApplicationSelect
                        id="application-course"
                        label="Course (optional)"
                        value={form.courseId}
                        onChange={(v) => setField("courseId", v)}
                        items={options.courses}
                        optional
                        disabled={!form.programId || optionsLoading}
                    />
                    <ApplicationSelect
                        id="application-intake"
                        label="Intake (optional)"
                        value={form.intakeId}
                        onChange={(v) => setField("intakeId", v)}
                        items={options.intakes}
                        optional
                        disabled={!form.programId || optionsLoading}
                    />
                    <ApplicationSelect
                        id="application-opportunity"
                        label="Linked opportunity (optional)"
                        value={form.opportunityId}
                        onChange={(v) => setField("opportunityId", v)}
                        items={options.opportunities}
                        optional
                        disabled={!form.programId || !form.leadId || optionsLoading}
                    />
                    {form.programId && !optionsLoading && !options.stages.length && (
                        <p role="alert" className="text-sm">
                            No open application stages are configured for this program. Ask a catalog administrator to add one.
                        </p>
                    )}
                    {draft.error && (
                        <p role="alert" className="break-words text-sm text-destructive">
                            {draft.error}
                        </p>
                    )}
                </fieldset>
            </StandardDialog>
        </div>
    );
}
