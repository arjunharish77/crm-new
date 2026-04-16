"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    FormHelperText,
    Typography,
    Divider,
    Grid,
    Box,
    Switch,
    FormControlLabel,
    InputAdornment
} from "@mui/material";
import {
    Phone as PhoneIcon,
    Email as EmailIcon,
    CalendarToday as CalendarIcon,
    Group as GroupIcon,
    Description as FileTextIcon,
    CheckCircle as CheckCircleIcon,
    Message as MessageIcon,
    Videocam as VideoIcon,
    LocalCafe as CoffeeIcon,
    Work as BriefcaseIcon,
    Circle as CircleIcon
} from "@mui/icons-material";

interface ActivityType {
    id: string;
    name: string;
    icon?: string;
    color?: string | null;
    defaultSLA?: number | null;
    defaultOutcome?: string | null;
    order: number;
    isActive: boolean;
}

interface ActivityTypeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activityType: ActivityType | null;
    onSuccess: () => void;
}

const formSchema = z.object({
    name: z.string().min(2, "Name is required"),
    icon: z.string().optional(),
    color: z.string().optional(),
    defaultSLA: z.coerce.number().min(0, "SLA must be positive").optional().or(z.literal('')),
    defaultOutcome: z.string().optional(),
    isActive: z.boolean(),
});

const iconOptions = [
    { value: "Phone", label: "Phone", icon: PhoneIcon },
    { value: "Mail", label: "Email", icon: EmailIcon },
    { value: "Calendar", label: "Meeting", icon: CalendarIcon },
    { value: "Users", label: "Group Meeting", icon: GroupIcon },
    { value: "FileText", label: "Note", icon: FileTextIcon },
    { value: "CheckCircle2", label: "Task", icon: CheckCircleIcon },
    { value: "MessageSquare", label: "Message", icon: MessageIcon },
    { value: "Video", label: "Video Call", icon: VideoIcon },
    { value: "Coffee", label: "Lunch/Coffee", icon: CoffeeIcon },
    { value: "Briefcase", label: "Presentation", icon: BriefcaseIcon },
];

const defaultColors = [
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // green
    "#ef4444", // red
    "#6366f1", // indigo
    "#14b8a6", // teal
];

export function ActivityTypeDialog({
    open,
    onOpenChange,
    activityType,
    onSuccess,
}: ActivityTypeDialogProps) {
    const [loading, setLoading] = useState(false);

    const { control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            icon: "Phone",
            color: "#3b82f6",
            defaultSLA: "",
            defaultOutcome: "",
            isActive: true,
        },
    });

    const selectedColor = watch("color");

    useEffect(() => {
        if (activityType) {
            reset({
                name: activityType.name,
                icon: activityType.icon || "Phone",
                color: activityType.color || "#3b82f6",
                defaultSLA: activityType.defaultSLA || "",
                defaultOutcome: activityType.defaultOutcome || "",
                isActive: activityType.isActive,
            });
        } else {
            reset({
                name: "",
                icon: "Phone",
                color: "#3b82f6",
                defaultSLA: "",
                defaultOutcome: "",
                isActive: true,
            });
        }
    }, [activityType, open, reset]);

    const handleClose = () => {
        onOpenChange(false);
    };

    async function onSubmit(values: any) {
        setLoading(true);
        try {
            const payload = {
                name: values.name,
                icon: values.icon,
                color: values.color,
                defaultSLA: values.defaultSLA ? Number(values.defaultSLA) : null,
                defaultOutcome: values.defaultOutcome || null,
                isActive: values.isActive,
                order: activityType?.order || 999,
            };

            if (activityType) {
                await apiFetch(`/activity-types/${activityType.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Activity type updated");
            } else {
                await apiFetch("/activity-types", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Activity type created");
            }

            onSuccess();
        } catch (error: any) {
            toast.error(error.message || "Failed to save activity type");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3, maxHeight: '90vh' }
            }}
        >
            <DialogTitle>{activityType ? "Edit Activity Type" : "Create Activity Type"}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ mb: 3 }}>
                    Configure activity types for logging interactions and tasks.
                </DialogContentText>

                <form id="activity-type-form" onSubmit={handleSubmit(onSubmit)}>
                    <Stack spacing={3}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <TextField
                                    {...field}
                                    label="Name"
                                    placeholder="Phone Call"
                                    fullWidth
                                    error={!!errors.name}
                                    helperText={errors.name?.message as string}
                                />
                            )}
                        />

                        <Controller
                            name="icon"
                            control={control}
                            render={({ field }) => (
                                <FormControl fullWidth>
                                    <InputLabel>Icon</InputLabel>
                                    <Select
                                        {...field}
                                        label="Icon"
                                        renderValue={(selected) => {
                                            const option = iconOptions.find(o => o.value === selected);
                                            const Icon = option?.icon || CircleIcon;
                                            return (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Icon fontSize="small" />
                                                    {option?.label}
                                                </Box>
                                            );
                                        }}
                                    >
                                        {iconOptions.map((option) => {
                                            const IconComponent = option.icon;
                                            return (
                                                <MenuItem key={option.value} value={option.value}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <IconComponent fontSize="small" />
                                                        {option.label}
                                                    </Box>
                                                </MenuItem>
                                            );
                                        })}
                                    </Select>
                                </FormControl>
                            )}
                        />

                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Color</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Controller
                                    name="color"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            type="color"
                                            sx={{ width: 60, p: 0, '& input': { p: 0.5, height: 40 } }}
                                        />
                                    )}
                                />
                                <Stack direction="row" spacing={0.5}>
                                    {defaultColors.map((color) => (
                                        <Box
                                            key={color}
                                            onClick={() => setValue("color", color)}
                                            sx={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                bgcolor: color,
                                                cursor: 'pointer',
                                                border: selectedColor === color ? '2px solid black' : '2px solid transparent',
                                                transition: 'all 0.2s',
                                                '&:hover': { transform: 'scale(1.1)' }
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Stack>
                        </Box>

                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }}>
                                <Controller
                                    name="defaultSLA"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Default SLA (Minutes)"
                                            type="number"
                                            fullWidth
                                            helperText="Expected duration"
                                        />
                                    )}
                                />
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <Controller
                                    name="defaultOutcome"
                                    control={control}
                                    render={({ field }) => (
                                        <FormControl fullWidth>
                                            <InputLabel>Default Outcome</InputLabel>
                                            <Select
                                                {...field}
                                                label="Default Outcome"
                                                value={field.value || ""}
                                            >
                                                <MenuItem value=""><em>None</em></MenuItem>
                                                <MenuItem value="SUCCESS">Success</MenuItem>
                                                <MenuItem value="FOLLOW_UP_NEEDED">Follow-up Needed</MenuItem>
                                                <MenuItem value="NO_ANSWER">No Answer</MenuItem>
                                                <MenuItem value="VOICEMAIL">Voicemail</MenuItem>
                                                <MenuItem value="NOT_INTERESTED">Not Interested</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                            </Grid>
                        </Grid>

                        <Controller
                            name="isActive"
                            control={control}
                            render={({ field }) => (
                                <FormControlLabel
                                    control={<Switch checked={field.value} onChange={field.onChange} />}
                                    label="Active (visible in forms)"
                                />
                            )}
                        />
                    </Stack>
                </form>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={handleClose} sx={{ borderRadius: 20, color: 'text.secondary' }}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    form="activity-type-form"
                    variant="contained"
                    disabled={loading}
                    sx={{ borderRadius: 20 }}
                >
                    {loading ? "Saving..." : activityType ? "Update Type" : "Create Type"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
