"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { CustomFieldDefinition } from "@/types/custom-fields";
import { CreateCustomFieldDialog } from "./create-custom-field-dialog";

export default function CustomFieldsSettingsPage() {
    const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("LEAD");

    const fetchFields = async (objectType: string) => {
        setLoading(true);
        try {
            const data = await apiFetch(`/custom-fields?objectType=${objectType}`);
            setFields(data);
        } catch (error) {
            toast.error("Failed to load custom fields");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFields(activeTab);
    }, [activeTab]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will not delete existing data but will hide the field.")) return;
        try {
            await apiFetch(`/custom-fields/${id}`, { method: 'DELETE' });
            toast.success("Field deleted");
            fetchFields(activeTab);
        } catch (error) {
            toast.error("Failed to delete field");
        }
    };

    return (
        <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Custom Fields</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage custom fields for your CRM objects.
                    </p>
                </div>
                <CreateCustomFieldDialog
                    objectType={activeTab}
                    onSuccess={() => fetchFields(activeTab)}
                />
            </div>
            <div className="my-4 border-t border-border" />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
                <TabsList>
                    <TabsTrigger value="LEAD">Leads</TabsTrigger>
                    <TabsTrigger value="OPPORTUNITY">Opportunities</TabsTrigger>
                    <TabsTrigger value="ACTIVITY">Activities</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-primary/5 hover:bg-primary/5">
                            <TableHead>Label</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Required</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                                    No custom fields defined.
                                </TableCell>
                            </TableRow>
                        )}
                        {fields.map((field) => (
                            <TableRow key={field.id || field.key}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold">{field.label}</span>
                                        {field.isSystem && (
                                            <Badge className="h-5 rounded text-[10px]">System</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <code className="rounded bg-muted px-2 py-1 text-xs">{field.key}</code>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="rounded text-xs">{field.type}</Badge>
                                </TableCell>
                                <TableCell>
                                    {field.required ? (
                                        <Badge variant="outline" className="border-destructive/30 text-destructive">
                                            Required
                                        </Badge>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">Optional</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {!field.isSystem && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleDelete(field.id)}
                                            aria-label={`Delete ${field.label}`}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
