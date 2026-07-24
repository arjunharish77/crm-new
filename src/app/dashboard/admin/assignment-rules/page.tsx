"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Route, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RuleBuilder } from "./rule-builder";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

export default function AssignmentSettingsPage() {
    const [rules, setRules] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [selectedRule, setSelectedRule] = useState<any>(null);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/assignment/rules");
            setRules(data);
        } catch (error) {
            toast.error("Failed to load assignment rules");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

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
            await apiFetch(`/assignment/rules/${id}`, {
                method: "DELETE",
            });
            toast.success("Rule deleted");
            fetchRules();
        } catch (error) {
            toast.error("Failed to delete rule");
        }
    };

    const handleSave = async (ruleData: any) => {
        try {
            if (selectedRule) {
                await apiFetch(`/assignment/rules/${selectedRule.id}`, {
                    method: "PUT",
                    body: JSON.stringify(ruleData),
                });
                toast.success("Rule updated");
            } else {
                await apiFetch("/assignment/rules", {
                    method: "POST",
                    body: JSON.stringify(ruleData),
                });
                toast.success("Rule created");
            }
            fetchRules();
        } catch (error) {
            toast.error("Failed to save rule");
            throw error;
        }
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'name',
            header: 'Rule Name',
            size: 280,
            cell: ({ row }) => (
                <span className="py-1 text-sm font-bold">{row.original.name}</span>
            )
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            size: 140,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className={
                        row.original.isActive
                            ? "border-tertiary/25 bg-tertiary/10 font-extrabold uppercase text-tertiary"
                            : "border-border bg-muted font-extrabold uppercase text-muted-foreground"
                    }
                >
                    {row.original.isActive ? "Active" : "Paused"}
                </Badge>
            )
        },
        {
            accessorKey: 'priority',
            header: 'Priority',
            size: 120,
            cell: ({ row }) => (
                <span className="inline-flex rounded-md border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">
                    P{row.original.priority}
                </span>
            )
        },
        {
            id: 'actions',
            header: 'Actions',
            size: 140,
            cell: ({ row }) => (
                <div className="flex w-full justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => { e.stopPropagation(); handleEdit(row.original); }}
                    >
                        <Pencil className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(row.original.id); }}
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            )
        }
    ], []);

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1200px] p-3 md:p-4"
        >
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-extrabold">Assignment Rules</h1>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Configure dynamic logic for routing leads and opportunities based on criteria
                    </p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="size-4" />
                    Create Rule
                </Button>
            </div>

            <div className="overflow-hidden rounded-3xl border bg-card">
                <div className="flex items-center gap-3 bg-primary/[0.02] p-4">
                    <div className="flex rounded-[10px] bg-primary/10 p-2 text-primary">
                        <Workflow className="size-4" />
                    </div>
                    <span className="text-sm font-bold">Routing Logic</span>
                </div>
                <div className="border-b" />
                <DataTable
                    storageKey="assignment-rules-table"
                    data={rules}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    emptyState={{
                        icon: <Route className="size-10 text-muted-foreground opacity-50" />,
                        title: "No assignment rules found",
                        description: "Create a rule to start routing records automatically.",
                    }}
                />
            </div>

            <RuleBuilder
                open={isBuilderOpen}
                setOpen={setIsBuilderOpen}
                rule={selectedRule}
                onSave={handleSave}
            />
        </motion.div>
    );
}
