"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Plus,
    Pencil,
    Trash2,
    GripVertical,
    List,
    Settings,
    Workflow,
    Loader2,
} from "lucide-react";
import { ActivityTypeDialog } from "./activity-type-dialog";
import { CustomFieldManager } from '@/components/admin/custom-field-manager';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

interface ActivityType {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    order: number;
    isActive: boolean;
}

function SortableActivityTypeRow({ activityType, onEdit, onDelete, onManageFields }: {
    activityType: ActivityType;
    onEdit: () => void;
    onDelete: () => void;
    onManageFields: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: activityType.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : 1,
        position: 'relative' as const,
    };

    const color = activityType.color || "#6b7280";

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-4 rounded-[20px] border bg-card p-4 px-6 transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.02]",
                isDragging ? "border-primary shadow-md" : "hover:-translate-y-px hover:shadow-md"
            )}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="flex cursor-grab items-center rounded-sm text-muted-foreground/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Drag ${activityType.name}`}
            >
                <GripVertical className="size-5" />
            </button>

            <div
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
                style={{
                    backgroundColor: `${color}1a`,
                    color,
                    borderColor: `${color}33`,
                }}
            >
                <Workflow className="size-5" />
            </div>

            <div className="flex-1">
                <p className="text-sm font-bold">{activityType.name}</p>
                <p className="text-xs text-muted-foreground">
                    {activityType.icon ? `Identifier: ${activityType.icon}` : 'Standard Interaction'}
                </p>
            </div>

            <Badge
                variant="outline"
                className={cn(
                    "rounded-lg text-[10px] font-bold uppercase",
                    activityType.isActive
                        ? "border-primary/20 bg-primary/8 text-primary"
                        : "border-border bg-muted text-muted-foreground"
                )}
            >
                {activityType.isActive ? "Active" : "Inactive"}
            </Badge>

            <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="border-dashed" onClick={onManageFields}>
                    <List className="size-3.5" />
                    Fields
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-primary" onClick={onEdit}>
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onDelete}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}

export default function ActivityTypesPage() {
    const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingType, setEditingType] = useState<ActivityType | null>(null);
    const [managingType, setManagingType] = useState<ActivityType | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchActivityTypes = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/activity-types");
            setActivityTypes(data.sort((a: ActivityType, b: ActivityType) => a.order - b.order));
        } catch (error) {
            toast.error("Failed to fetch activity types");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActivityTypes();
    }, [fetchActivityTypes]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = activityTypes.findIndex((item) => item.id === active.id);
            const newIndex = activityTypes.findIndex((item) => item.id === over.id);
            const reordered = arrayMove(activityTypes, oldIndex, newIndex);
            const updated = reordered.map((item, index) => ({ ...item, order: index + 1 }));

            setActivityTypes(updated);

            try {
                // Batch update order
                await Promise.all(updated.map(type =>
                    apiFetch(`/activity-types/${type.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ order: type.order }),
                    })
                ));
                toast.success("Order updated");
            } catch (error) {
                toast.error("Failed to update order");
                fetchActivityTypes();
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this activity type?")) {
            return;
        }

        try {
            await apiFetch(`/activity-types/${id}`, { method: "DELETE" });
            toast.success("Activity type deleted");
            fetchActivityTypes();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete activity type");
        }
    };

    const handleEdit = (type: ActivityType) => {
        setEditingType(type);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingType(null);
        setDialogOpen(true);
    };

    const handleManageFields = (type: ActivityType) => {
        setManagingType(type);
    };

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1200px] p-1.5 md:p-2"
        >
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-extrabold tracking-tight">Activity Types</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Define and sort activity categories for team collaboration
                    </p>
                </div>
                <Button onClick={handleCreate} className="rounded-xl px-6">
                    <Plus className="size-4" />
                    Create Activity Type
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="size-6 animate-spin text-primary" />
                </div>
            ) : (
                <Card className="gap-0 rounded-3xl py-0">
                    <CardHeader className="grid-cols-[auto_1fr] flex-row items-center gap-3 px-4 py-4">
                        <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                            <Settings className="size-4" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-bold">Configuration</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Drag and drop to reorder the sequence in activity forms
                            </p>
                        </div>
                    </CardHeader>
                    <Separator className="mx-2 opacity-50" />
                    <CardContent className="p-3 py-6">
                        {activityTypes.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">
                                <h3 className="text-lg font-semibold">No activity types configured</h3>
                                <Button variant="link" onClick={handleCreate} className="mt-1">
                                    Add first type
                                </Button>
                            </div>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={activityTypes.map((t) => t.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="flex flex-col gap-2">
                                        {activityTypes.map((type) => (
                                            <SortableActivityTypeRow
                                                key={type.id}
                                                activityType={type}
                                                onEdit={() => handleEdit(type)}
                                                onDelete={() => handleDelete(type.id)}
                                                onManageFields={() => handleManageFields(type)}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </CardContent>
                </Card>
            )}

            <ActivityTypeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                activityType={editingType}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchActivityTypes();
                }}
            />

            {managingType && (
                <CustomFieldManager
                    open={!!managingType}
                    onOpenChange={(open) => !open && setManagingType(null)}
                    entityType="ACTIVITY_TYPE"
                    relatedTypeId={managingType.id}
                    relatedTypeName={managingType.name}
                />
            )}
        </motion.div>
    );
}
