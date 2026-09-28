"use client";

import { PageHeader } from "@/components/layout/page-header";

import { useEffect, useState, useCallback } from "react";
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
import { Plus, Pencil, Route, Trash2, Workflow, GripVertical, FlaskConical, Star, Folder as FolderIcon } from "lucide-react";
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
                                    "font-extrabold uppercase",
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
                    <span className="mr-1 inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary">P{rule.priority}</span>
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
    const [rules, setRules] = useState<any[]>([]);
    const [ruleSets, setRuleSets] = useState<any[]>([]);
    const [folderFilter, setFolderFilter] = useState(ALL_FOLDERS);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [selectedRule, setSelectedRule] = useState<any>(null);
    const [simulateOpen, setSimulateOpen] = useState(false);

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

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        try {
            await apiFetch(`/assignment/rules/${id}`, { method: "DELETE" });
            toast.success("Rule deleted");
            fetchRules();
        } catch (error) {
            toast.error("Failed to delete rule");
        }
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
            <PageHeader title="Assignment Rules" description="Route leads and opportunities using conditions. Drag rules to change their priority." actions={
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
                    <Button onClick={handleCreate}>
                        <Plus className="size-4" />
                        Create Rule
                    </Button>
                </div>
            } />

            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center gap-3 bg-primary/[0.02] p-4">
                    <div className="flex rounded-[10px] bg-primary/10 p-2 text-primary">
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
                                        <span className="mr-1 inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary">P{rule.priority}</span>
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
            </div>

            <RuleBuilder open={isBuilderOpen} setOpen={setIsBuilderOpen} rule={selectedRule} onSave={handleSave} />
            <SimulateDistributionDialog open={simulateOpen} onClose={() => setSimulateOpen(false)} />
        </motion.div>
    );
}
