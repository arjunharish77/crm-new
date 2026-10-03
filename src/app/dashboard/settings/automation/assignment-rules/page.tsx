"use client";

import { PageHeader } from "@/components/layout/page-header";

import { Fragment, useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Pencil, Route, Trash2, Workflow, GripVertical, FlaskConical, Star, History, ChevronDown, ChevronRight, Folder as FolderIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { RuleBuilder } from "./rule-builder";
import { SimulateDistributionDialog } from "@/components/admin/simulate-distribution-dialog";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/common/dialogs-provider";
import { useArchiveActions } from "@/hooks/use-archive-actions";
import { ArchivedItemsSection } from "@/components/common/archived-items-section";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ErrorState } from "@/components/common/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { formatCount } from "@/lib/display/format";
import { humanizeEnum } from "@/lib/display/status";

function SortableRuleRow({ rule, folderName, onEdit, onDelete }: { rule: any; folderName?: string; onEdit: () => void; onDelete: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1 : 0 };

    return (
        <div ref={setNodeRef} style={style}>
            <Card className={cn("flex-row flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3", isDragging && "border-primary shadow-md")}>
                <div className="flex min-w-0 flex-1 basis-52 items-center gap-3">
                    <button
                        type="button"
                        className="cursor-grab rounded-md p-1 text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-label={`Drag ${rule.name}`}
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical size={18} />
                    </button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words text-sm font-semibold">{rule.name}</p>
                            <Badge variant="outline" className="rounded-md">{rule.entityType}</Badge>
                            {folderName && (
                                <Badge variant="outline" className="max-w-full gap-1 whitespace-normal break-all rounded-md">
                                    <FolderIcon className="size-3" />
                                    {folderName}
                                </Badge>
                            )}
                            {rule.isDefault && (
                                <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-all rounded-md">
                                    <Star className="size-3" />
                                    Default
                                </Badge>
                            )}
                            <Badge
                                variant="outline"
                                className={cn(
                                    "font-semibold uppercase",
                                    rule.isActive ? "border-tertiary/25 bg-tertiary/10 text-tertiary" : "border-border bg-muted text-muted-foreground"
                                )}
                            >
                                {rule.isActive ? "Active" : "Paused"}
                            </Badge>
                        </div>
                        {rule.description && <p className="mt-0.5 break-words text-xs text-muted-foreground">{rule.description}</p>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-1 inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">P{rule.priority}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`} onClick={onEdit}>
                        <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${rule.name}`} onClick={onDelete}>
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            </Card>
        </div>
    );
}

const UNGROUPED = "__ungrouped__";
const ALL_FOLDERS = "__all__";

export default function AssignmentSettingsPage() {
    const confirm = useConfirm();
    const [archiveToken, setArchiveToken] = useState(0);
    const { archive } = useArchiveActions({ basePath: "/assignment/rules", archiveKind: "assignment-rule", noun: "assignment rule", onChange: () => { fetchRules(); setArchiveToken((token) => token + 1); } });
    const [rules, setRules] = useState<any[]>([]);
    const [ruleSets, setRuleSets] = useState<any[]>([]);
    const [folderFilter, setFolderFilter] = useState(ALL_FOLDERS);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [selectedRule, setSelectedRule] = useState<any>(null);
    const [simulateOpen, setSimulateOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const fetchRules = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const data = await apiFetch("/assignment/rules");
            setRules(data);
        } catch (error) {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRuleSets = useCallback(async () => {
        try {
            setRuleSets(await apiFetch("/assignment/rule-sets"));
        } catch {
            setRuleSets([]);
        }
    }, []);

    useEffect(() => {
        fetchRules();
        fetchRuleSets();
    }, [fetchRules, fetchRuleSets]);

    const ruleSetNameById = new Map(ruleSets.map((ruleSet) => [ruleSet.id, ruleSet.name]));
    const visibleRules = rules.filter((rule) => {
        if (folderFilter === ALL_FOLDERS) return true;
        if (folderFilter === UNGROUPED) return !rule.ruleSetId;
        return rule.ruleSetId === folderFilter;
    });

    const handleCreate = () => {
        setSelectedRule(null);
        setIsBuilderOpen(true);
    };

    const handleEdit = (rule: any) => {
        setSelectedRule(rule);
        setIsBuilderOpen(true);
    };

    // Delete archives the rule (decision 31): it stops assigning at once; Undo in the toast,
    // restore from Archived for 30 days.
    const handleDelete = async (id: string) => {
        const rule = rules.find((item) => item.id === id);
        if (rule) await archive({ id, name: rule.name });
    };

    const handleSave = async (ruleData: any) => {
        try {
            if (selectedRule) {
                await apiFetch(`/assignment/rules/${selectedRule.id}`, { method: "PUT", body: JSON.stringify(ruleData) });
                toast.success("Rule updated");
            } else {
                await apiFetch("/assignment/rules", { method: "POST", body: JSON.stringify(ruleData) });
                toast.success("Rule created");
            }
            fetchRules();
            fetchRuleSets();
        } catch (error) {
            toast.error("Failed to save rule");
            throw error;
        }
    };

    // Drag order becomes priority order top-to-bottom (highest priority first) -- matches
    // distribution-engine's `order by priority desc`.
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setRules((items) => {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);
            const newOrder = arrayMove(items, oldIndex, newIndex);
            apiFetch("/assignment/rules/reorder", {
                method: "PUT",
                body: JSON.stringify({ ids: newOrder.map((rule) => rule.id) }),
            }).catch(() => toast.error("Failed to save new order"));
            return newOrder;
        });
    };

    return (
        <motion.div variants={fadeInUp} initial="initial" animate="animate" className="min-w-0">
            <PageHeader title="Assignment rules" description="Route leads and opportunities using conditions. Drag rules to change their priority." actions={
                <div className="flex max-w-full flex-wrap gap-2">
                    <Select value={folderFilter} onValueChange={setFolderFilter}>
                        <SelectTrigger aria-label="Rule folder" className="w-44 max-w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
                            <SelectItem value={UNGROUPED}>Ungrouped</SelectItem>
                            {ruleSets.map((ruleSet) => (
                                <SelectItem key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => setSimulateOpen(true)}>
                        <FlaskConical className="size-4" />
                        Simulate
                    </Button>
                    <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                        <History className="size-4" />
                        Simulation history
                    </Button>
                    <Button onClick={handleCreate}>
                        <Plus className="size-4" />
                        Create Rule
                    </Button>
                </div>
            } />

            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center gap-3 bg-primary/[0.02] p-4">
                    <div className="flex rounded-xl bg-primary/10 p-2 text-primary">
                        <Workflow className="size-4" />
                    </div>
                    <span className="text-sm font-bold">Routing Logic</span>
                </div>
                <div className="border-b" />
                <div className="p-3">
                    {loading ? (
                        <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                    ) : loadError ? (
                        <div role="alert" className="p-4 text-sm">Unable to load assignment rules. <Button variant="outline" size="sm" onClick={fetchRules}>Retry</Button></div>
                    ) : visibleRules.length === 0 ? (
                        <EmptyState
                            icon={<Route className="size-10 text-muted-foreground opacity-50" />}
                            title="No assignment rules found"
                            description="Create a rule to start routing records automatically."
                        />
                    ) : folderFilter === ALL_FOLDERS ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={visibleRules.map((rule) => rule.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-2">
                                    {visibleRules.map((rule) => (
                                        <SortableRuleRow
                                            key={rule.id}
                                            rule={rule}
                                            folderName={rule.ruleSetId ? ruleSetNameById.get(rule.ruleSetId) : undefined}
                                            onEdit={() => handleEdit(rule)}
                                            onDelete={() => handleDelete(rule.id)}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    ) : (
                        // Drag-reorder is disabled while a folder filter narrows the visible list --
                        // priority order is a single flat sequence across every rule regardless of
                        // folder, and reordering against a partial view would silently reshuffle
                        // hidden rules' relative position in a way the user can't see.
                        <div className="space-y-2">
                            {visibleRules.map((rule) => (
                                <Card key={rule.id} className="flex-row flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
                                    <div className="flex min-w-0 flex-1 basis-52 items-center gap-3 pl-[26px]">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="break-words text-sm font-semibold">{rule.name}</p>
                                                <Badge variant="outline" className="rounded-md">{rule.entityType}</Badge>
                                                {rule.isDefault && (
                                                    <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-all rounded-md">
                                                        <Star className="size-3" />
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>
                                            {rule.description && <p className="mt-0.5 break-words text-xs text-muted-foreground">{rule.description}</p>}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <span className="mr-1 inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">P{rule.priority}</span>
                                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`} onClick={() => handleEdit(rule)}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${rule.name}`} onClick={() => handleDelete(rule.id)}>
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
                <ArchivedItemsSection kind="assignment-rule" basePath="/assignment/rules" noun="assignment rule" title="Archived rules" refreshToken={archiveToken} onChange={() => fetchRules()} />
            </div>

            <RuleBuilder open={isBuilderOpen} setOpen={setIsBuilderOpen} rule={selectedRule} onSave={handleSave} />
            <SimulateDistributionDialog open={simulateOpen} onClose={() => setSimulateOpen(false)} />
            <SimulationHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} rules={rules} />
        </motion.div>
    );
}

// GET /assignment/simulations caps `limit` at 100; this asks for the most it allows.
const SIMULATION_HISTORY_LIMIT = 100;

type SimulationTraceStep = {
    ruleId: string | null;
    ruleName: string | null;
    strategy: string | null;
    candidates?: Array<{ id: string; name: string | null; email: string | null; excludedReason?: string }>;
    selectedUserId: string | null;
    usedFallback: boolean;
    reason: string;
};

type DistributionSimulation = {
    id: string;
    entityType: "LEAD" | "OPPORTUNITY";
    inputRecord: Record<string, any> | null;
    draftRuleOverride: Record<string, any> | null;
    result: { assignedUserId: string | null; ruleId: string | null; strategy: string | null; reason: string } | null;
    trace: SimulationTraceStep[] | null;
    runBy: string | null;
    createdAt: string;
};

function simulationRecordLabel(simulation: DistributionSimulation) {
    const record = simulation.inputRecord ?? {};
    return record.name || record.title || record.email || (simulation.entityType === "OPPORTUNITY" ? "Untitled opportunity" : "Unnamed lead");
}

// Every run of the Simulate dialog, and every in-builder draft simulation, is saved
// (DistributionSimulation). This lists them so an admin can look back at past dry runs.
function SimulationHistoryDialog({ open, onClose, rules }: { open: boolean; onClose: () => void; rules: any[] }) {
    const [entityType, setEntityType] = useState<"ALL" | "LEAD" | "OPPORTUNITY">("ALL");
    const [simulations, setSimulations] = useState<DistributionSimulation[]>([]);
    const [users, setUsers] = useState<Array<{ id: string; name?: string | null; email?: string | null }>>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        apiFetch<any[]>("/users").then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => setUsers([]));
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setLoading(true);
        setLoadError(false);
        const params = new URLSearchParams({ limit: String(SIMULATION_HISTORY_LIMIT) });
        if (entityType !== "ALL") params.set("entityType", entityType);
        apiFetch<DistributionSimulation[]>(`/assignment/simulations?${params.toString()}`, { signal: controller.signal })
            .then((data) => setSimulations(Array.isArray(data) ? data : []))
            .catch((error) => {
                if (error?.name === "AbortError") return;
                setLoadError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [open, entityType, reloadKey]);

    const userName = (id: string | null | undefined, simulation?: DistributionSimulation) => {
        if (!id) return null;
        const fromTrace = simulation?.trace?.flatMap((step) => step.candidates ?? []).find((candidate) => candidate.id === id);
        const user = users.find((item) => item.id === id);
        return fromTrace?.name || fromTrace?.email || user?.name || user?.email || "Unknown user";
    };
    const ruleName = (simulation: DistributionSimulation) => {
        const ruleId = simulation.result?.ruleId;
        if (!ruleId) return null;
        return rules.find((rule) => rule.id === ruleId)?.name
            ?? simulation.trace?.find((step) => step.ruleId === ruleId)?.ruleName
            ?? "Deleted rule";
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title="Simulation history"
            subtitle="Past dry runs from Simulate and the rule builder. Nothing here assigned a record."
            icon={<History className="size-5" />}
            maxWidth="lg"
            fullWidth
        >
            <div className="space-y-3 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={entityType} onValueChange={(value) => { setEntityType(value as typeof entityType); setExpandedId(null); }}>
                        <SelectTrigger aria-label="Record type" className="w-56 max-w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Leads and opportunities</SelectItem>
                            <SelectItem value="LEAD">Leads</SelectItem>
                            <SelectItem value="OPPORTUNITY">Opportunities</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>Refresh</Button>
                </div>

                {loading ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading simulations...</p>
                ) : loadError ? (
                    <ErrorState variant="inline" description="Simulation history couldn't be loaded." onRetry={() => setReloadKey((key) => key + 1)} />
                ) : simulations.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        icon={<FlaskConical className="size-6" />}
                        title="No simulations yet"
                        description="Run Simulate to see which rule and user a record would get."
                    />
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8"><span className="sr-only">Details</span></TableHead>
                                        <TableHead>When</TableHead>
                                        <TableHead>Record</TableHead>
                                        <TableHead>Outcome</TableHead>
                                        <TableHead>Rule</TableHead>
                                        <TableHead>Run by</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {simulations.map((simulation) => {
                                        const expanded = expandedId === simulation.id;
                                        const assignee = userName(simulation.result?.assignedUserId, simulation);
                                        return (
                                            <Fragment key={simulation.id}>
                                                <TableRow>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            aria-expanded={expanded}
                                                            aria-label={expanded ? "Hide rules evaluated" : "Show rules evaluated"}
                                                            onClick={() => setExpandedId(expanded ? null : simulation.id)}
                                                        >
                                                            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatWorkspaceDateTime(simulation.createdAt)}</TableCell>
                                                    <TableCell>
                                                        <div className="text-sm">{simulationRecordLabel(simulation)}</div>
                                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                                            <Badge tone="neutral">{simulation.entityType === "OPPORTUNITY" ? "Opportunity" : "Lead"}</Badge>
                                                            {simulation.draftRuleOverride ? <Badge tone="info">Unsaved rule</Badge> : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="max-w-72 whitespace-normal">
                                                        {assignee ? (
                                                            <Badge tone="success">Would assign to {assignee}</Badge>
                                                        ) : (
                                                            <Badge tone="warning">No one assigned</Badge>
                                                        )}
                                                        {simulation.result?.reason ? <div className="mt-1 break-words text-xs text-muted-foreground">{simulation.result.reason}</div> : null}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {ruleName(simulation) ?? <span className="text-muted-foreground">—</span>}
                                                        {simulation.result?.strategy ? <div className="text-xs text-muted-foreground">{humanizeEnum(simulation.result.strategy)}</div> : null}
                                                    </TableCell>
                                                    <TableCell className="text-sm">{userName(simulation.runBy) ?? "—"}</TableCell>
                                                </TableRow>
                                                {expanded ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="bg-muted/30 whitespace-normal">
                                                            {simulation.trace?.length ? (
                                                                <ol className="space-y-2">
                                                                    {simulation.trace.map((step, index) => (
                                                                        <li key={index} className="rounded-lg border bg-card p-3 text-sm">
                                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                <span className="font-semibold">{step.ruleName || "Unnamed rule"}</span>
                                                                                {step.selectedUserId ? (
                                                                                    <Badge tone={step.usedFallback ? "warning" : "success"}>{step.usedFallback ? "Fallback used" : "Selected"}</Badge>
                                                                                ) : (
                                                                                    <Badge tone="danger">No eligible user</Badge>
                                                                                )}
                                                                            </div>
                                                                            <p className="mt-1 text-xs text-muted-foreground">{step.reason}</p>
                                                                            {step.candidates?.length ? (
                                                                                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                                                                    {step.candidates.map((candidate) => (
                                                                                        <li key={candidate.id} className="flex flex-wrap justify-between gap-2">
                                                                                            <span>{candidate.name || candidate.email || "Unknown user"}</span>
                                                                                            {candidate.excludedReason ? <span className="text-destructive">{candidate.excludedReason}</span> : candidate.id === step.selectedUserId ? <span className="text-primary">Picked</span> : null}
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            ) : null}
                                                                        </li>
                                                                    ))}
                                                                </ol>
                                                            ) : (
                                                                <p className="text-xs text-muted-foreground">No rules were evaluated for this run.</p>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ) : null}
                                            </Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {simulations.length >= SIMULATION_HISTORY_LIMIT
                                ? `Showing the ${formatCount(SIMULATION_HISTORY_LIMIT)} most recent simulations. Older ones aren't listed here.`
                                : `${formatCount(simulations.length)} simulation${simulations.length === 1 ? "" : "s"}.`}
                        </p>
                    </>
                )}
            </div>
        </StandardDialog>
    );
}
