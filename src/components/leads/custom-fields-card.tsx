import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomField {
    id: string;
    key: string;
    label: string;
    value: string | number | boolean;
    type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

interface CustomFieldsCardProps {
    fields: CustomField[];
    onAdd?: () => void;
    onEdit?: (field: CustomField) => void;
}

export function CustomFieldsCard({ fields, onAdd, onEdit }: CustomFieldsCardProps) {
    return (
        <Card className="gap-0 rounded-2xl border bg-surface-container-lowest py-0">
            <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-2">
                    <Tag className="size-[18px] text-primary" />
                    <span className="text-base font-extrabold">Custom Fields</span>
                </div>
                <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={onAdd}
                    className="size-[30px] bg-primary-container text-on-primary-container hover:bg-primary-container/80"
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            <div className="p-3">
                {fields.length === 0 ? (
                    <div className="py-5 text-center opacity-60">
                        <p className="text-sm text-muted-foreground">No custom fields defined</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {fields.map((field, index) => (
                            <div key={field.id} className="group">
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        {field.label}
                                    </span>
                                    <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        onClick={() => onEdit?.(field)}
                                        className="size-7 opacity-0 group-hover:opacity-100"
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                </div>
                                <p className="text-sm font-medium">{String(field.value)}</p>
                                <div className={cn("mt-[9px] h-px bg-border opacity-50", index === fields.length - 1 && "hidden")} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}
