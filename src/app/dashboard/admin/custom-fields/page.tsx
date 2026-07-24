"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Braces, Edit, Loader2, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CustomFieldDialog } from "./custom-field-dialog";

interface CustomField {
    id: string;
    key: string;
    label: string;
    objectType: "LEAD" | "OPPORTUNITY" | "ACTIVITY";
    fieldType: string;
    required: boolean;
    metadata?: any;
    order: number;
}

type ObjectType = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

const OBJECT_TYPES: ObjectType[] = ["LEAD", "OPPORTUNITY", "ACTIVITY"];

// Same field-type -> color mapping the MUI version used, ported to Tailwind
// classes keyed off the M3 tokens this app actually defines (no success/info/warning roles).
const FIELD_TYPE_BADGE_CLASSNAMES: Record<string, string> = {
    TEXT: "bg-primary/8 text-primary border-primary/20",
    NUMBER: "bg-secondary/15 text-secondary border-secondary/30",
    DATE: "bg-tertiary/12 text-tertiary border-tertiary/25",
    SELECT: "bg-secondary/15 text-secondary border-secondary/30",
    TEXTAREA: "bg-primary/8 text-primary border-primary/20",
    CHECKBOX: "bg-tertiary/12 text-tertiary border-tertiary/25",
};
const DEFAULT_FIELD_TYPE_BADGE_CLASSNAME = "bg-muted text-muted-foreground border-border";

export default function CustomFieldsPage() {
    const [fields, setFields] = useState<CustomField[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<ObjectType>("LEAD");
    const [editingField, setEditingField] = useState<CustomField | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const fetchFields = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/custom-fields");
            setFields(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to fetch custom fields");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFields();
    }, [fetchFields]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this custom field? Existing data will be lost.")) {
            return;
        }

        try {
            await apiFetch(`/custom-fields/${id}`, { method: "DELETE" });
            toast.success("Custom field deleted");
            fetchFields();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete custom field");
        }
    };

    const handleEdit = (field: CustomField) => {
        setEditingField(field);
        setDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingField(null);
        setDialogOpen(true);
    };

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mx-auto max-w-[1200px] px-4 py-4 md:px-6"
        >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Custom Fields</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Extend your CRM data model with custom attributes for leads and activities
                    </p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus size={18} />
                    Add Custom Field
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ObjectType)} className="mt-4">
                <TabsList>
                    <TabsTrigger value="LEAD">Leads</TabsTrigger>
                    <TabsTrigger value="OPPORTUNITY">Opportunities</TabsTrigger>
                    <TabsTrigger value="ACTIVITY">Activities</TabsTrigger>
                </TabsList>

                {OBJECT_TYPES.map((type) => {
                    const filteredFields = fields.filter((f) => f.objectType === type).sort((a, b) => a.order - b.order);

                    return (
                        <TabsContent key={type} value={type} className="pt-3">
                            {loading ? (
                                <div className="flex justify-center py-16">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                            ) : filteredFields.length === 0 ? (
                                <div className="rounded-3xl border border-dashed border-border p-16 text-center">
                                    <Settings className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
                                    <h2 className="text-base font-semibold text-muted-foreground">
                                        No fields for {type.toLowerCase()}s
                                    </h2>
                                    <Button variant="ghost" onClick={handleCreate} className="mt-2">
                                        Add your first field
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredFields.map((field) => {
                                        const badgeClassName = FIELD_TYPE_BADGE_CLASSNAMES[field.fieldType] ?? DEFAULT_FIELD_TYPE_BADGE_CLASSNAME;
                                        return (
                                            <Card
                                                key={field.id}
                                                className="gap-0 rounded-2xl py-0 transition-colors hover:border-primary/20"
                                            >
                                                <CardContent className="flex items-center justify-between gap-3 px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                                                            <Braces size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-bold">{field.label}</p>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn("h-5 rounded-md text-[10px] font-extrabold", badgeClassName)}
                                                                >
                                                                    {field.fieldType}
                                                                </Badge>
                                                                {field.required && (
                                                                    <Badge variant="destructive" className="h-5 rounded-md text-[10px] font-extrabold">
                                                                        Required
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                Key:{" "}
                                                                <code className="rounded bg-muted px-1 py-0.5 font-semibold">{field.key}</code>
                                                                {field.fieldType === "SELECT" && field.metadata?.options && (
                                                                    <span>• Options: {field.metadata.options.join(", ")}</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() => handleEdit(field)}
                                                            aria-label={`Edit ${field.label}`}
                                                        >
                                                            <Edit size={16} />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                            onClick={() => handleDelete(field.id)}
                                                            aria-label={`Delete ${field.label}`}
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </TabsContent>
                    );
                })}
            </Tabs>

            <CustomFieldDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                customField={editingField}
                defaultObjectType={activeTab}
                onSuccess={() => {
                    setDialogOpen(false);
                    fetchFields();
                }}
            />
        </motion.div>
    );
}
