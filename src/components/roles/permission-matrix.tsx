"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ModulePermissions, PermissionAction, PermissionModule, RecordAccess } from "@/types/user";

interface PermissionMatrixProps {
    permissions: ModulePermissions;
    recordAccess: RecordAccess;
    onChange: (permissions: ModulePermissions, recordAccess: RecordAccess) => void;
}

const MODULES: { key: PermissionModule; label: string }[] = [
    { key: "leads", label: "Leads" },
    { key: "opportunities", label: "Opportunities" },
    { key: "activities", label: "Activities" },
    { key: "automations", label: "Automations" },
    { key: "users", label: "Users" },
    { key: "roles", label: "Roles" },
    { key: "settings", label: "Settings" },
];

const ACTIONS: { key: PermissionAction; label: string }[] = [
    { key: "read", label: "Read" },
    { key: "create", label: "Create" },
    { key: "update", label: "Update" },
    { key: "delete", label: "Delete" },
    { key: "export", label: "Export" },
];

export function PermissionMatrix({ permissions, recordAccess, onChange }: PermissionMatrixProps) {
    const handleActionToggle = (module: PermissionModule, action: PermissionAction) => {
        const newPermissions = { ...permissions };
        const modulePerms = newPermissions[module] || {};

        if (modulePerms === "full") {
            // If full, we convert to object and toggle off the one clicked
            const converted: any = {};
            ACTIONS.forEach(a => converted[a.key] = true);
            converted[action] = false;
            newPermissions[module] = converted;
        } else if (typeof modulePerms === "object") {
            newPermissions[module] = {
                ...modulePerms,
                [action]: !modulePerms[action as keyof typeof modulePerms],
            };
        } else if (modulePerms === true) {
            // shouldn't really happen with this UI, but handle it
            newPermissions[module] = { [action]: false };
        } else {
            newPermissions[module] = { [action]: true };
        }

        onChange(newPermissions, recordAccess);
    };

    const handleFullToggle = (module: PermissionModule) => {
        const newPermissions = { ...permissions };
        const isFull = newPermissions[module] === "full";
        newPermissions[module] = isFull ? {} : "full";
        onChange(newPermissions, recordAccess);
    };

    const isActionActive = (module: PermissionModule, action: PermissionAction) => {
        const modulePerms = permissions[module];
        if (modulePerms === "full") return true;
        if (typeof modulePerms === "object" && modulePerms !== null) {
            return !!(modulePerms as any)[action];
        }
        return false;
    };

    const isFullAccess = (module: PermissionModule) => {
        return permissions[module] === "full";
    };

    return (
        <div>
            <div className="mb-6">
                <p className="mb-1 text-sm font-semibold">Record Visibility Scope</p>
                <p className="mb-2 text-xs text-muted-foreground">
                    Determines which records the user can see based on ownership.
                </p>
                <Select value={recordAccess} onValueChange={(value) => onChange(permissions, value as RecordAccess)}>
                    <SelectTrigger className="w-full max-w-[300px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="OWN">Owned Records Only (Standard Rep)</SelectItem>
                        <SelectItem value="TEAM">Team Records (Group Manager)</SelectItem>
                        <SelectItem value="ALL">All Records (Tenant Admin)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <p className="mb-2 text-sm font-semibold">Module Permissions</p>
            <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="font-semibold">Module</TableHead>
                            <TableHead className="text-center font-semibold">Full Access</TableHead>
                            {ACTIONS.map((action) => (
                                <TableHead key={action.key} className="text-center font-semibold">
                                    {action.label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MODULES.map((module) => (
                            <TableRow key={module.key}>
                                <TableCell className="font-medium">{module.label}</TableCell>
                                <TableCell className="text-center">
                                    <Switch
                                        size="sm"
                                        checked={isFullAccess(module.key)}
                                        onCheckedChange={() => handleFullToggle(module.key)}
                                    />
                                </TableCell>
                                {ACTIONS.map((action) => (
                                    <TableCell key={action.key} className="text-center">
                                        <Checkbox
                                            disabled={isFullAccess(module.key)}
                                            checked={isActionActive(module.key, action.key)}
                                            onCheckedChange={() => handleActionToggle(module.key, action.key)}
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
