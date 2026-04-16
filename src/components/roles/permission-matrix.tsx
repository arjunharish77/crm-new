"use client";

import React from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Typography,
    Box,
    FormControl,
    Select,
    MenuItem,
    Paper,
    FormControlLabel,
    Switch,
} from "@mui/material";
import { PermissionModule, PermissionAction, RecordAccess, ModulePermissions } from "@/types/user";

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
        <Box>
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Record Visibility Scope
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Determines which records the user can see based on ownership.
                </Typography>
                <FormControl size="small" fullWidth sx={{ maxWidth: 300 }}>
                    <Select
                        value={recordAccess}
                        onChange={(e) => onChange(permissions, e.target.value as RecordAccess)}
                    >
                        <MenuItem value="OWN">Owned Records Only (Standard Rep)</MenuItem>
                        <MenuItem value="TEAM">Team Records (Group Manager)</MenuItem>
                        <MenuItem value="ALL">All Records (Tenant Admin)</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                Module Permissions
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={{ fontWeight: 600 }}>Module</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600 }}>Full Access</TableCell>
                            {ACTIONS.map((action) => (
                                <TableCell key={action.key} align="center" sx={{ fontWeight: 600 }}>
                                    {action.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {MODULES.map((module) => (
                            <TableRow key={module.key} hover>
                                <TableCell sx={{ fontWeight: 500 }}>{module.label}</TableCell>
                                <TableCell align="center">
                                    <Switch
                                        size="small"
                                        checked={isFullAccess(module.key)}
                                        onChange={() => handleFullToggle(module.key)}
                                    />
                                </TableCell>
                                {ACTIONS.map((action) => (
                                    <TableCell key={action.key} align="center">
                                        <Checkbox
                                            size="small"
                                            disabled={isFullAccess(module.key)}
                                            checked={isActionActive(module.key, action.key)}
                                            onChange={() => handleActionToggle(module.key, action.key)}
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
