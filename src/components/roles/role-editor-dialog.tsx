"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { ModulePermissions, RecordAccess, Role } from "@/types/user";
import { PermissionMatrix } from "./permission-matrix";

interface RoleEditorDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    role: Role | null;
}

const DEFAULT_PERMISSIONS: ModulePermissions = {
    leads: { read: true, create: true, update: true, delete: false, export: false },
    opportunities: { read: true, create: true, update: true, delete: false, export: false },
    activities: { read: true, create: true, update: true, delete: false, export: false },
    automations: { read: true },
};

const NO_TEMPLATE_VALUE = "__none__";

export function RoleEditorDialog({ open, onClose, onSuccess, role }: RoleEditorDialogProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [permissions, setPermissions] = useState<ModulePermissions>(DEFAULT_PERMISSIONS);
    const [recordAccess, setRecordAccess] = useState<RecordAccess>("OWN");
    const [isPartnerRole, setIsPartnerRole] = useState(false);
    const [permissionTemplateId, setPermissionTemplateId] = useState("");
    const [templates, setTemplates] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            apiFetch("/permission-templates")
                .then((data) => setTemplates(Array.isArray(data) ? data : []))
                .catch(() => setTemplates([]));
        }
        if (role) {
            setName(role.name);
            setDescription(role.description || "");
            setPermissions(role.permissions.modules || DEFAULT_PERMISSIONS);
            setRecordAccess(role.permissions.recordAccess || "OWN");
            setIsPartnerRole(!!role.permissions.isPartnerRole);
            setPermissionTemplateId(role.permissionTemplateId ?? "");
        } else {
            setName("");
            setDescription("");
            setPermissions(DEFAULT_PERMISSIONS);
            setRecordAccess("OWN");
            setIsPartnerRole(false);
            setPermissionTemplateId("");
        }
    }, [role, open]);

    const handleSave = async () => {
        if (!name) {
            toast.error("Role name is required");
            return;
        }

        setSaving(true);
        try {
            const data = {
                name,
                description,
                permissionTemplateId: permissionTemplateId || null,
                permissions: {
                    modules: permissions,
                    recordAccess,
                    isPartnerRole,
                },
            };

            if (role) {
                await apiFetch(`/roles/${role.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                });
                toast.success("Role updated successfully");
            } else {
                await apiFetch('/roles', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                toast.success("Role created successfully");
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to save role");
        } finally {
            setSaving(false);
        }
    };

    return (
        <StandardDialog
            open={open}
            onClose={onClose}
            title={role ? "Edit Role" : "Create New Role"}
            maxWidth="md"
            actions={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {role ? "Update Role" : "Create Role"}
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="role-editor-name">Role Name</Label>
                        <Input
                            id="role-editor-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Senior Sales Representative"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role-editor-description">Description</Label>
                        <Textarea
                            id="role-editor-description"
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Briefly describe what this role can do"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Permission Template</Label>
                        <Select
                            value={permissionTemplateId || NO_TEMPLATE_VALUE}
                            onValueChange={(value) => setPermissionTemplateId(value === NO_TEMPLATE_VALUE ? "" : value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_TEMPLATE_VALUE}>No template</SelectItem>
                                {templates.map((template) => (
                                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                        <div className="space-y-1">
                            <Label htmlFor="role-editor-partner">External partner role</Label>
                            <p className="text-xs text-muted-foreground">
                                Users with this role are treated as external channel partners: blocked from admin/settings/automation screens and restricted to their own owned records regardless of the record visibility scope below.
                            </p>
                        </div>
                        <Switch
                            id="role-editor-partner"
                            checked={isPartnerRole}
                            onCheckedChange={setIsPartnerRole}
                        />
                    </div>
                </div>

                <div className="border-t border-border" />

                <PermissionMatrix
                    permissions={permissions}
                    recordAccess={recordAccess}
                    onChange={(p, r) => {
                        setPermissions(p);
                        setRecordAccess(r);
                    }}
                />
            </div>
        </StandardDialog>
    );
}
