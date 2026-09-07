"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CalendarClock, CheckCircle2, ExternalLink, ListPlus, Mail, MoreHorizontal, Send, UserCog, Workflow } from "lucide-react";
import { SmartViewModule } from "@/types/smart-views";

type UserOption = { id: string; name?: string | null; email?: string | null };
type LeadListOption = { id: string; name: string };
type ActivityTypeOption = { id: string; name: string };
type StageOption = { id: string; label?: string | null; name?: string | null };

type ActionKey =
    | "create_task"
    | "log_activity"
    | "assign_owner"
    | "add_to_list"
    | "send_message"
    | "change_stage"
    | "create_follow_up"
    | "mark_done"
    | "link_record"
    | "complete_task"
    | "reassign_task"
    | "reschedule_task";

const LEAD_STATUS_OPTIONS = ["NEW", "CONTACTED", "QUALIFIED", "LOST"];

// Detail pages only exist for Leads and Opportunities today (confirmed: Activities, Tasks,
// Partners, and Payouts have no [id] route) -- "Open record" only appears where it resolves
// to a real page rather than a dead link.
const DETAIL_ROUTES: Partial<Record<SmartViewModule, string>> = {
    LEADS: "/dashboard/leads",
    OPPORTUNITIES: "/dashboard/opportunities",
};

export function ViewRowActionsMenu({
    module,
    record,
    quickActions,
    users,
    leadLists,
    activityTypes,
    stagesByOpportunityTypeId,
    onDone,
}: {
    module: SmartViewModule;
    record: any;
    quickActions: string[];
    users: UserOption[];
    leadLists: LeadListOption[];
    activityTypes: ActivityTypeOption[];
    stagesByOpportunityTypeId: Map<string, StageOption[]>;
    onDone: () => void;
}) {
    const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [taskTitle, setTaskTitle] = useState("");
    const [activityTypeId, setActivityTypeId] = useState("");
    const [activityNotes, setActivityNotes] = useState("");
    const [targetUserId, setTargetUserId] = useState("");
    const [reassignReason, setReassignReason] = useState("");
    const [reassignPreview, setReassignPreview] = useState<any>(null);
    const [reassignPreviewLoading, setReassignPreviewLoading] = useState(false);
    const [listId, setListId] = useState("");
    const [stageId, setStageId] = useState("");
    const [dueAtInput, setDueAtInput] = useState("");
    const [messageBody, setMessageBody] = useState("");

    const has = (action: ActionKey) => quickActions.includes(action);
    const close = () => setActiveAction(null);

    const run = async (fn: () => Promise<void>) => {
        setSubmitting(true);
        try {
            await fn();
            onDone();
            close();
        } catch (error: any) {
            toast.error(error?.message || "Action failed");
        } finally {
            setSubmitting(false);
        }
    };

    // Reassignment SLA/workload-impact preview -- fetched as soon as a target user is picked,
    // shown before the reason is even required, so the impact is visible while still deciding.
    useEffect(() => {
        if (activeAction !== "assign_owner" || !targetUserId) {
            setReassignPreview(null);
            return;
        }
        let cancelled = false;
        setReassignPreviewLoading(true);
        apiFetch("/assignment/reassign/preview", {
            method: "POST",
            body: JSON.stringify({
                entityType: module === "LEADS" ? "LEAD" : "OPPORTUNITY",
                entityId: record.id,
                newOwnerId: targetUserId,
            }),
        })
            .then((preview) => { if (!cancelled) setReassignPreview(preview); })
            .catch(() => { if (!cancelled) setReassignPreview(null); })
            .finally(() => { if (!cancelled) setReassignPreviewLoading(false); });
        return () => { cancelled = true; };
    }, [activeAction, targetUserId, module, record.id]);

    const detailRoute = DETAIL_ROUTES[module];
    const relatedRoute =
        module === "ACTIVITIES"
            ? record.opportunityId ? `/dashboard/opportunities/${record.opportunityId}` : record.leadId ? `/dashboard/leads/${record.leadId}` : null
            : null;

    const recipientEmail = module === "LEADS" ? record.email : record.lead?.email;
    const opportunityStages = module === "OPPORTUNITIES" ? stagesByOpportunityTypeId.get(record.opportunityTypeId) ?? [] : [];

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {(detailRoute || relatedRoute) && (
                        <DropdownMenuItem asChild>
                            <Link href={detailRoute ? `${detailRoute}/${record.id}` : relatedRoute!} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-4" />
                                Open record
                            </Link>
                        </DropdownMenuItem>
                    )}
                    {has("create_task") && (
                        <DropdownMenuItem onSelect={() => { setTaskTitle(""); setActiveAction("create_task"); }}>
                            <CheckCircle2 className="size-4" />
                            Create task
                        </DropdownMenuItem>
                    )}
                    {has("log_activity") && (
                        <DropdownMenuItem onSelect={() => { setActivityTypeId(""); setActivityNotes(""); setActiveAction("log_activity"); }}>
                            <Workflow className="size-4" />
                            Log activity
                        </DropdownMenuItem>
                    )}
                    {has("assign_owner") && (
                        <DropdownMenuItem onSelect={() => { setTargetUserId(""); setReassignReason(""); setActiveAction("assign_owner"); }}>
                            <UserCog className="size-4" />
                            Assign owner
                        </DropdownMenuItem>
                    )}
                    {has("add_to_list") && (
                        <DropdownMenuItem onSelect={() => { setListId(""); setActiveAction("add_to_list"); }}>
                            <ListPlus className="size-4" />
                            Add to list
                        </DropdownMenuItem>
                    )}
                    {has("send_message") && (
                        <DropdownMenuItem onSelect={() => { setMessageBody(""); setActiveAction("send_message"); }} disabled={!recipientEmail}>
                            <Mail className="size-4" />
                            Send message
                        </DropdownMenuItem>
                    )}
                    {has("change_stage") && (
                        <DropdownMenuItem onSelect={() => { setStageId(""); setActiveAction("change_stage"); }}>
                            <Workflow className="size-4" />
                            Change stage
                        </DropdownMenuItem>
                    )}
                    {has("create_follow_up") && (
                        <DropdownMenuItem
                            onSelect={() => run(async () => {
                                await apiFetch("/activities", {
                                    method: "POST",
                                    body: JSON.stringify({
                                        typeId: record.typeId,
                                        leadId: record.leadId || null,
                                        opportunityId: record.opportunityId || null,
                                        notes: `Follow-up to: ${record.notes || record.outcome || "previous activity"}`,
                                        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                    }),
                                });
                                toast.success("Follow-up activity created");
                            })}
                        >
                            <Send className="size-4" />
                            Create follow-up
                        </DropdownMenuItem>
                    )}
                    {has("mark_done") && (
                        <DropdownMenuItem
                            onSelect={() => run(async () => {
                                await apiFetch(`/activities/${record.id}`, { method: "PATCH", body: JSON.stringify({ completedAt: new Date().toISOString() }) });
                                toast.success("Activity marked done");
                            })}
                        >
                            <CheckCircle2 className="size-4" />
                            Mark done
                        </DropdownMenuItem>
                    )}
                    {has("complete_task") && (
                        <DropdownMenuItem
                            onSelect={() => run(async () => {
                                await apiFetch(`/tasks/${record.id}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
                                toast.success("Task completed");
                            })}
                        >
                            <CheckCircle2 className="size-4" />
                            Complete task
                        </DropdownMenuItem>
                    )}
                    {has("reassign_task") && (
                        <DropdownMenuItem onSelect={() => { setTargetUserId(""); setActiveAction("reassign_task"); }}>
                            <UserCog className="size-4" />
                            Reassign task
                        </DropdownMenuItem>
                    )}
                    {has("reschedule_task") && (
                        <DropdownMenuItem onSelect={() => { setDueAtInput(""); setActiveAction("reschedule_task"); }}>
                            <CalendarClock className="size-4" />
                            Reschedule task
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={activeAction === "create_task"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Create task</DialogTitle>
                        <DialogDescription>Creates a task linked to this {module === "LEADS" ? "lead" : "opportunity"}, due tomorrow.</DialogDescription>
                    </DialogHeader>
                    <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !taskTitle.trim()}
                            onClick={() => run(async () => {
                                await apiFetch("/tasks", {
                                    method: "POST",
                                    body: JSON.stringify({
                                        title: taskTitle.trim(),
                                        leadId: module === "LEADS" ? record.id : record.leadId || null,
                                        opportunityId: module === "OPPORTUNITIES" ? record.id : null,
                                        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                    }),
                                });
                                toast.success("Task created");
                            })}
                        >
                            {submitting ? "Creating..." : "Create task"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "log_activity"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Log activity</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select value={activityTypeId} onValueChange={setActivityTypeId}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Activity type" /></SelectTrigger>
                            <SelectContent>
                                {activityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Textarea value={activityNotes} onChange={(e) => setActivityNotes(e.target.value)} placeholder="Notes (optional)" rows={3} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !activityTypeId}
                            onClick={() => run(async () => {
                                await apiFetch("/activities", {
                                    method: "POST",
                                    body: JSON.stringify({ typeId: activityTypeId, leadId: record.id, notes: activityNotes || null }),
                                });
                                toast.success("Activity logged");
                            })}
                        >
                            {submitting ? "Logging..." : "Log activity"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "assign_owner" || activeAction === "reassign_task"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{activeAction === "reassign_task" ? "Reassign task" : "Assign owner"}</DialogTitle>
                    </DialogHeader>
                    <Select value={targetUserId} onValueChange={setTargetUserId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a user" /></SelectTrigger>
                        <SelectContent>
                            {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email || "User"}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {activeAction === "assign_owner" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="reassign-reason-input">Reason</Label>
                            <Textarea
                                id="reassign-reason-input"
                                placeholder="Why is this record being reassigned?"
                                rows={2}
                                value={reassignReason}
                                onChange={(e) => setReassignReason(e.target.value)}
                            />
                        </div>
                    )}
                    {activeAction === "assign_owner" && targetUserId && (
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            {reassignPreviewLoading ? (
                                "Checking workload impact..."
                            ) : reassignPreview ? (
                                <>
                                    <p>
                                        New owner currently has {reassignPreview.newOwnerCurrentOpenCount} open record{reassignPreview.newOwnerCurrentOpenCount === 1 ? "" : "s"} —
                                        would go to {reassignPreview.newOwnerOpenCountAfter}.
                                        {reassignPreview.quotaWouldBeExceeded && (
                                            <span className="ml-1 font-semibold text-destructive">Exceeds this rule&apos;s configured per-user cap ({reassignPreview.tightestApplicableQuota}).</span>
                                        )}
                                    </p>
                                    {typeof reassignPreview.daysSinceLastActivity === "number" && (
                                        <p>Last activity on this record was {reassignPreview.daysSinceLastActivity} day{reassignPreview.daysSinceLastActivity === 1 ? "" : "s"} ago.</p>
                                    )}
                                </>
                            ) : null}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !targetUserId || (activeAction === "assign_owner" && !reassignReason.trim())}
                            onClick={() => run(async () => {
                                if (activeAction === "reassign_task") {
                                    await apiFetch(`/tasks/${record.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: targetUserId }) });
                                } else {
                                    // Governed reassignment -- requires the reason above, writes a real
                                    // decision log (AssignmentLog + AuditLog), and notifies the previous
                                    // owner, unlike a bare ownerId PATCH. A tenant with reassignment
                                    // approval turned on gets a pending request back instead of an
                                    // immediate change.
                                    const outcome = await apiFetch<any>("/assignment/reassign", {
                                        method: "POST",
                                        body: JSON.stringify({
                                            entityType: module === "LEADS" ? "LEAD" : "OPPORTUNITY",
                                            entityId: record.id,
                                            newOwnerId: targetUserId,
                                            reason: reassignReason.trim(),
                                        }),
                                    });
                                    if (outcome?.pendingApproval) {
                                        toast.success("Reassignment submitted for approval");
                                        return;
                                    }
                                }
                                toast.success("Owner updated");
                            })}
                        >
                            {submitting ? "Saving..." : "Assign"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "add_to_list"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add to list</DialogTitle>
                    </DialogHeader>
                    <Select value={listId} onValueChange={setListId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a list" /></SelectTrigger>
                        <SelectContent>
                            {leadLists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !listId}
                            onClick={() => run(async () => {
                                await apiFetch(`/lead-lists/${listId}/members`, { method: "POST", body: JSON.stringify({ leadIds: [record.id] }) });
                                toast.success("Added to list");
                            })}
                        >
                            {submitting ? "Adding..." : "Add"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "send_message"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Send message</DialogTitle>
                        <DialogDescription>Queues an email to {recipientEmail || "this record"}.</DialogDescription>
                    </DialogHeader>
                    <Textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Message" rows={4} />
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !messageBody.trim() || !recipientEmail}
                            onClick={() => run(async () => {
                                await apiFetch("/communications/outbox", {
                                    method: "POST",
                                    body: JSON.stringify({
                                        channel: "EMAIL",
                                        recipient: recipientEmail,
                                        body: messageBody.trim(),
                                        entityType: module === "LEADS" ? "LEAD" : "OPPORTUNITY",
                                        entityId: record.id,
                                    }),
                                });
                                toast.success("Message queued");
                            })}
                        >
                            {submitting ? "Sending..." : "Send"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "change_stage"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Change stage</DialogTitle>
                    </DialogHeader>
                    <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a stage" /></SelectTrigger>
                        <SelectContent>
                            {opportunityStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.label || stage.name || stage.id}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !stageId}
                            onClick={() => run(async () => {
                                await apiFetch(`/opportunities/${record.id}`, { method: "PATCH", body: JSON.stringify({ stageId }) });
                                toast.success("Stage updated");
                            })}
                        >
                            {submitting ? "Saving..." : "Update stage"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activeAction === "reschedule_task"} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Reschedule task</DialogTitle>
                    </DialogHeader>
                    <Input type="datetime-local" value={dueAtInput} onChange={(e) => setDueAtInput(e.target.value)} />
                    <DialogFooter>
                        <Button variant="outline" onClick={close}>Cancel</Button>
                        <Button
                            disabled={submitting || !dueAtInput}
                            onClick={() => run(async () => {
                                await apiFetch(`/tasks/${record.id}`, { method: "PATCH", body: JSON.stringify({ dueAt: new Date(dueAtInput).toISOString() }) });
                                toast.success("Task rescheduled");
                            })}
                        >
                            {submitting ? "Saving..." : "Reschedule"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export { LEAD_STATUS_OPTIONS };
