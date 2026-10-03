'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import {
    Edit,
    GripVertical,
    Layout,
    List,
    ListOrdered,
    Loader2,
    Plus,
    Settings,
    Trash2,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { toast } from 'sonner';
import { CustomFieldManager } from '@/components/admin/custom-field-manager';
import { StageEditor } from '@/components/opportunities/stage-editor';
import { PageHeader } from '@/components/layout/page-header';
import { useConfirm } from '@/components/common/dialogs-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { fadeInUp } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { OpportunityType } from '@/types/opportunity-types';
import { OpportunityTypeDialog } from './opportunity-type-dialog';

function getLucideIcon(iconName?: string | null) {
    if (!iconName) return null;
    const Icon = (Icons as unknown as Record<string, React.ElementType>)[iconName];
    return Icon ? <Icon size={20} /> : null;
}

function iconColorStyles(color?: string | null) {
    const value = color || '#3b82f6';
    return {
        color: value,
        backgroundColor: `${value}1a`,
        borderColor: `${value}33`,
    };
}

interface SortableTypeCardProps {
    type: OpportunityType;
    onManageFields: (type: OpportunityType) => void;
    onManageStages: (type: OpportunityType) => void;
    onEdit: (type: OpportunityType) => void;
    onDelete: (type: OpportunityType) => void;
}

function SortableTypeCard({ type, onManageFields, onManageStages, onEdit, onDelete }: SortableTypeCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="h-full">
            <Card
                className={cn(
                    'h-full gap-4 rounded-xl py-5 transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-md',
                    isDragging && 'border-primary shadow-md'
                )}
            >
                <CardHeader className="gap-3 px-5">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            className="mt-3 cursor-grab rounded-md p-1 text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                            aria-label={`Drag ${type.name}`}
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical size={18} />
                        </button>
                        <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                            style={iconColorStyles(type.color)}
                        >
                            {getLucideIcon(type.icon) || <Layout size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-base font-semibold">{type.name}</CardTitle>
                            <Badge
                                variant={type.isActive ? 'default' : 'secondary'}
                                className={cn(
                                    'mt-2 h-5 rounded px-2 text-xs font-semibold uppercase',
                                    type.isActive ? 'bg-primary/10 text-primary hover:bg-primary/10' : 'text-muted-foreground'
                                )}
                            >
                                {type.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            {type.programId ? (
                                <Badge variant="outline" className="mt-2 ml-1.5 h-5 rounded px-2 text-xs font-semibold uppercase">
                                    Catalog Linked
                                </Badge>
                            ) : null}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4 px-5">
                    <p className="min-h-10 text-sm text-muted-foreground">
                        {type.description || 'No description provided.'}
                    </p>

                    <div className="flex gap-8">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Opportunities</p>
                            <p className="text-sm font-semibold">{type._count?.opportunities || 0}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Custom Fields</p>
                            <p className="text-sm font-semibold">{type._count?.customFields || 0}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="gap-2 border-t border-border px-5 pt-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => onManageStages(type)}>
                        <ListOrdered className="size-4" />
                        Stages{(type as any).stages ? ` (${(type as any).stages.length})` : ''}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => onManageFields(type)}>
                        <List className="size-4" />
                        Fields
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(type)} aria-label={`Edit ${type.name}`}>
                        <Edit size={18} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(type)}
                        disabled={!!type._count && type._count.opportunities > 0}
                        aria-label={`Delete ${type.name}`}
                    >
                        <Trash2 size={18} />
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function OpportunityTypesPage() {
    const [types, setTypes] = useState<OpportunityType[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<OpportunityType | null>(null);
    const [managingType, setManagingType] = useState<OpportunityType | null>(null);
    const [stagesType, setStagesType] = useState<OpportunityType | null>(null);
    const confirm = useConfirm();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchTypes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/opportunity-types');
            setTypes(data.sort((a: OpportunityType, b: OpportunityType) => a.order - b.order));
        } catch (error) {
            toast.error('Failed to fetch opportunity types');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTypes();
    }, [fetchTypes]);

    const handleCreate = () => {
        setEditingType(null);
        setDialogOpen(true);
    };

    const handleManageFields = (type: OpportunityType) => {
        setManagingType(type);
    };

    const handleEdit = (type: OpportunityType) => {
        setEditingType(type);
        setDialogOpen(true);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = types.findIndex((item) => item.id === active.id);
            const newIndex = types.findIndex((item) => item.id === over.id);
            const newOrder = arrayMove(types, oldIndex, newIndex);

            setTypes(newOrder);

            try {
                await apiFetch('/opportunity-types/reorder', {
                    method: 'PUT',
                    body: JSON.stringify({ ids: newOrder.map((type) => type.id) }),
                });
                toast.success('Order updated');
            } catch (error) {
                toast.error('Failed to save order');
                fetchTypes();
            }
        }
    };

    const handleDelete = async (type: OpportunityType) => {
        if (type._count && type._count.opportunities > 0) {
            toast.error(`Cannot delete type with ${type._count.opportunities} opportunities`);
            return;
        }

        if (!(await confirm({ title: `Delete “${type.name}”?`, description: "Its stages and its own fields go with it. This can't be undone.", confirmLabel: "Delete type", destructive: true }))) {
            return;
        }

        try {
            await apiFetch(`/opportunity-types/${type.id}`, {
                method: 'DELETE',
            });
            toast.success('Opportunity type deleted');
            fetchTypes();
        } catch (error) {
            toast.error('Failed to delete opportunity type');
        }
    };

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="min-w-0"
        >
            <PageHeader title="Opportunity types & stages" description="Each type has its own stages, which make up its board and stage path, and its own fields." primaryAction={<Button onClick={handleCreate}><Plus className="size-4" />Create type</Button>} />

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : types.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center">
                    <Settings className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
                    <h2 className="text-base font-semibold text-muted-foreground">No opportunity types found</h2>
                    <Button variant="ghost" onClick={handleCreate} className="mt-2">
                        Add your first type
                    </Button>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={types.map((type) => type.id)} strategy={rectSortingStrategy}>
                        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {types.map((type) => (
                                <SortableTypeCard
                                    key={type.id}
                                    type={type}
                                    onManageFields={handleManageFields}
                                    onManageStages={setStagesType}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            <OpportunityTypeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                opportunityType={editingType}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchTypes();
                }}
            />

            {stagesType && (
                <StageEditor
                    open={!!stagesType}
                    onOpenChange={(open) => !open && setStagesType(null)}
                    typeId={stagesType.id}
                    typeName={stagesType.name}
                    onChanged={fetchTypes}
                />
            )}

            {managingType && (
                <CustomFieldManager
                    open={!!managingType}
                    onOpenChange={(open) => !open && setManagingType(null)}
                    entityType="OPPORTUNITY_TYPE"
                    relatedTypeId={managingType.id}
                    relatedTypeName={managingType.name}
                />
            )}
        </motion.div>
    );
}
