"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
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
    Box,
    Typography,
    Chip,
    IconButton,
    FormHelperText,
    Paper,
    Autocomplete
} from "@mui/material";
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon
} from "@mui/icons-material";
import { StandardDialog } from "@/components/common/standard-dialog";

import { User, Role } from "@/types/user";

interface EditUserDialogProps {
    user: User | null;
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
    skills: z.array(z.object({
        category: z.string().min(1, "Category is required"),
        values: z.array(z.string()).min(1, "At least one value is required"),
    })),
});

// Mock data for teams and managers
const MOCK_TEAMS = [
    { id: '1', name: 'North America Sales' },
    { id: '2', name: 'EMEA Sales' },
    { id: '3', name: 'Enterprise Accounts' },
];

export function EditUserDialog({
    user,
    open,
    onOpenChange,
    onSuccess,
}: EditUserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [roles, setRoles] = useState<Role[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    const [searchingManagers, setSearchingManagers] = useState(false);

    const transformSkillsToArray = (skillsObj: any) => {
        if (!skillsObj) return [];
        return Object.entries(skillsObj).map(([category, values]) => ({
            category,
            values: Array.isArray(values) ? values : [String(values)],
        }));
    };

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            roleId: "",
            teamId: "",
            managerId: "",
            skills: [] as { category: string, values: string[] }[],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "skills",
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

                    // Filter out the current user from potential managers to avoid cycles
                    const potentialManagers = (Array.isArray(usersData) ? usersData : [])
                        .filter((u: any) => u.id !== user?.id);
                    setManagers(potentialManagers);
                } catch (error) {
                    toast.error("Failed to load form data");
                }
            };
            loadData();

            if (user) {
                reset({
                    name: user.name,
                    email: user.email,
                    roleId: user.role?.id || user.roleId || "",
                    teamId: user.team?.id || user.teamId || "",
                    managerId: user.manager?.id || user.managerId || "",
                    skills: transformSkillsToArray(user.skills || {}),
                });
            }
        }
    }, [open, user, reset]);

    const handleClose = () => {
        onOpenChange(false);
    };

    async function onSubmit(values: any) {
        if (!user) return;
        setLoading(true);
        try {
            const skillsObj = values.skills.reduce((acc: any, curr: any) => {
                acc[curr.category] = curr.values;
                return acc;
            }, {});

            await apiFetch(`/users/${user.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: values.name,
                    roleId: values.roleId,
                    teamId: values.teamId,
                    managerId: values.managerId,
                    skills: skillsObj,
                }),
            });

            toast.success("User updated successfully");
            handleClose();
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to update user");
        } finally {
            setLoading(false);
        }
    }

    const SkillValueInput = ({ index, values, onChange }: { index: number, values: string[], onChange: (vals: string[]) => void }) => {
        const [input, setInput] = useState("");

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addValue();
            }
        };

        const addValue = () => {
            if (input.trim() && !values.includes(input.trim())) {
                onChange([...values, input.trim()]);
                setInput("");
            }
        };

        const removeValue = (valToRemove: string) => {
            onChange(values.filter(v => v !== valToRemove));
        };

        return (
            <Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                    {values.map((val) => (
                        <Chip
                            key={val}
                            label={val}
                            size="small"
                            onDelete={() => removeValue(val)}
                        />
                    ))}
                </Box>
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small"
                        placeholder="Type value & Enter"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        fullWidth
                    />
                    <Button variant="outlined" size="small" onClick={addValue}>
                        Add
                    </Button>
                </Stack>
            </Box>
        );
    };

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Edit User"
            subtitle="Update user details and assignment skills."
            icon={<EditIcon />}
            actions={
                <>
                    <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="edit-user-form"
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </>
            }
        >
            <form id="edit-user-form" onSubmit={handleSubmit(onSubmit)}>
                <Stack spacing={3}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <TextField
                                    {...field}
                                    label="Full Name"
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
                                    disabled
                                    fullWidth
                                />
                            )}
                        />
                    </Stack>

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

                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">Assignment Skills</Typography>
                            <Button
                                startIcon={<AddIcon />}
                                size="small"
                                onClick={() => append({ category: "", values: [] })}
                            >
                                Add Category
                            </Button>
                        </Stack>

                        {fields.length === 0 && (
                            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                                No skills assigned.
                            </Typography>
                        )}

                        <Stack spacing={2}>
                            {fields.map((field, index) => (
                                <Box key={field.id} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, position: 'relative' }}>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => remove(index)}
                                        sx={{ position: 'absolute', top: 8, right: 8 }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>

                                    <Stack spacing={2}>
                                        <Controller
                                            name={`skills.${index}.category`}
                                            control={control}
                                            render={({ field }) => (
                                                <TextField
                                                    {...field}
                                                    label="Category (Key)"
                                                    size="small"
                                                    fullWidth
                                                    placeholder="e.g. Language"
                                                    sx={{ maxWidth: '90%' }}
                                                />
                                            )}
                                        />

                                        <Controller
                                            name={`skills.${index}.values`}
                                            control={control}
                                            render={({ field }) => (
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Values</Typography>
                                                    <SkillValueInput
                                                        index={index}
                                                        values={field.value}
                                                        onChange={field.onChange}
                                                    />
                                                </Box>
                                            )}
                                        />
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Stack>
            </form>
        </StandardDialog>
    );
}
