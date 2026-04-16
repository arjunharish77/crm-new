"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    FormHelperText,
    Typography,
    Autocomplete
} from "@mui/material";
import { PersonAdd as PersonAddIcon } from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";

import { User, Role } from "@/types/user";

interface InviteUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}


const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    roleId: z.string().min(1, "Role is required"),
    teamId: z.string().optional(),
    managerId: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

// Mock data for teams and managers
const MOCK_TEAMS = [
    { id: '1', name: 'North America Sales' },
    { id: '2', name: 'EMEA Sales' },
    { id: '3', name: 'Enterprise Accounts' },
];



export function InviteUserDialog({
    open,
    onOpenChange,
    onSuccess,
}: InviteUserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [roles, setRoles] = useState<Role[]>([]);
    const [managers, setManagers] = useState<any[]>([]);

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            roleId: "",
            teamId: "",
            managerId: "",
            password: "",
        },
    });

    useEffect(() => {
        if (open) {
            const loadData = async () => {
                try {
                    const [rolesData, usersData] = await Promise.all([
                        apiFetch("/roles"),
                        apiFetch("/users")
                    ]);
                    setRoles(rolesData);
                    setManagers(Array.isArray(usersData) ? usersData : []);
                } catch (error) {
                    toast.error("Failed to load form data");
                }
            };
            loadData();
        }
    }, [open]);

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            await apiFetch("/users", {
                method: "POST",
                body: JSON.stringify({
                    ...values,
                    status: "ACTIVE",
                }),
            });

            toast.success("User invited successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to invite user");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Invite User"
            subtitle="Add a new team member to your organization."
            icon={<PersonAddIcon />}
            actions={
                <>
                    <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="invite-user-form"
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? "Inviting..." : "Invite User"}
                    </Button>
                </>
            }
        >
            <form id="invite-user-form" onSubmit={handleSubmit(onSubmit)}>
                <Stack spacing={3}>
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Full Name"
                                placeholder="John Doe"
                                fullWidth
                                error={!!errors.name}
                                helperText={errors.name?.message as string}
                            />
                        )}
                    />

                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Email"
                                type="email"
                                placeholder="john@example.com"
                                fullWidth
                                error={!!errors.email}
                                helperText={errors.email?.message as string}
                            />
                        )}
                    />

                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Temporary Password"
                                type="password"
                                placeholder="Min. 6 characters"
                                fullWidth
                                error={!!errors.password}
                                helperText={errors.password?.message as string}
                            />
                        )}
                    />

                    <Controller
                        name="roleId"
                        control={control}
                        render={({ field }) => (
                            <FormControl fullWidth error={!!errors.roleId}>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    {...field}
                                    label="Role"
                                >
                                    {roles.map((role) => (
                                        <MenuItem key={role.id} value={role.id}>
                                            {role.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>{errors.roleId?.message as string}</FormHelperText>
                            </FormControl>
                        )}
                    />

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Controller
                            name="teamId"
                            control={control}
                            render={({ field }) => (
                                <FormControl fullWidth>
                                    <InputLabel>Team</InputLabel>
                                    <Select {...field} label="Team">
                                        <MenuItem value=""><em>None</em></MenuItem>
                                        {MOCK_TEAMS.map((team) => (
                                            <MenuItem key={team.id} value={team.id}>
                                                {team.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}
                        />
                        <Controller
                            name="managerId"
                            control={control}
                            render={({ field: { onChange, value } }) => (
                                <FormControl fullWidth>
                                    <Autocomplete
                                        options={managers}
                                        getOptionLabel={(option) => option.name}
                                        renderOption={(props, option) => {
                                            const { key, ...otherProps } = props;
                                            return (
                                                <li key={key} {...otherProps}>
                                                    {option.name}
                                                </li>
                                            );
                                        }}
                                        value={managers.find((m) => m.id === value) || null}
                                        onChange={(_, newValue) => {
                                            onChange(newValue ? newValue.id : "");
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Manager"
                                                placeholder="Search manager..."
                                                error={!!errors.managerId}
                                                helperText={errors.managerId?.message as string}
                                                fullWidth
                                            />
                                        )}
                                    />
                                </FormControl>
                            )}
                        />
                    </Stack>
                </Stack>
            </form>
        </StandardDialog>
    );
}
