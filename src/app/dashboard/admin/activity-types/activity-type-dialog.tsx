"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Phone,
    Mail,
    Calendar,
    Users,
    FileText,
    CheckCircle2,
    MessageSquare,
    Video,
    Coffee,
    Briefcase,
    Circle,
    Loader2,
} from "lucide-react";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
    { value: "Phone", label: "Phone", icon: Phone },
    { value: "Mail", label: "Email", icon: Mail },
    { value: "Calendar", label: "Meeting", icon: Calendar },
    { value: "Users", label: "Group Meeting", icon: Users },
    { value: "FileText", label: "Note", icon: FileText },
    { value: "CheckCircle2", label: "Task", icon: CheckCircle2 },
    { value: "MessageSquare", label: "Message", icon: MessageSquare },
    { value: "Video", label: "Video Call", icon: Video },
    { value: "Coffee", label: "Lunch/Coffee", icon: Coffee },
    { value: "Briefcase", label: "Presentation", icon: Briefcase },
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

const NO_OUTCOME = "__none__";

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
            defaultSLA: "" as number | "",
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
        <StandardDialog
            open={open}
            onClose={handleClose}
            title={activityType ? "Edit Activity Type" : "Create Activity Type"}
            subtitle="Configure activity types for logging interactions and tasks."
            maxWidth="sm"
            actions={
                <>
                    <Button variant="ghost" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" form="activity-type-form" disabled={loading}>
                        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                        {loading ? "Saving..." : activityType ? "Update Type" : "Create Type"}
                    </Button>
                </>
            }
        >
            <form id="activity-type-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                        <div className="space-y-2">
                            <Label htmlFor="activity-type-name">Name</Label>
                            <Input
                                id="activity-type-name"
                                {...field}
                                placeholder="Phone Call"
                                aria-invalid={!!errors.name}
                            />
                            {errors.name && (
                                <p className="text-xs text-destructive">{errors.name.message as string}</p>
                            )}
                        </div>
                    )}
                />

                <Controller
                    name="icon"
                    control={control}
                    render={({ field }) => {
                        const selectedOption = iconOptions.find((o) => o.value === field.value);
                        return (
                            <div className="space-y-2">
                                <Label>Icon</Label>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select icon">
                                            {selectedOption && (
                                                <span className="flex items-center gap-2">
                                                    <selectedOption.icon className="size-4" />
                                                    {selectedOption.label}
                                                </span>
                                            )}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {iconOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                <span className="flex items-center gap-2">
                                                    <option.icon className="size-4" />
                                                    {option.label}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    }}
                />

                <div>
                    <Label className="mb-2 block text-xs text-muted-foreground">Color</Label>
                    <div className="flex items-center gap-2">
                        <Controller
                            name="color"
                            control={control}
                            render={({ field }) => (
                                <input
                                    type="color"
                                    value={field.value}
                                    onChange={field.onChange}
                                    className="h-10 w-[60px] cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                                />
                            )}
                        />
                        <div className="flex items-center gap-1.5">
                            {defaultColors.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setValue("color", color)}
                                    className={cn(
                                        "size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                        selectedColor === color ? "border-foreground" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: color }}
                                    aria-label={`Select color ${color}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Controller
                        name="defaultSLA"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-2">
                                <Label htmlFor="activity-type-sla">Default SLA (Minutes)</Label>
                                <Input id="activity-type-sla" {...field} value={field.value as any} type="number" />
                                <p className="text-xs text-muted-foreground">Expected duration</p>
                            </div>
                        )}
                    />
                    <Controller
                        name="defaultOutcome"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-2">
                                <Label>Default Outcome</Label>
                                <Select
                                    value={field.value || NO_OUTCOME}
                                    onValueChange={(value) => field.onChange(value === NO_OUTCOME ? "" : value)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_OUTCOME}>
                                            <em>None</em>
                                        </SelectItem>
                                        <SelectItem value="SUCCESS">Success</SelectItem>
                                        <SelectItem value="FOLLOW_UP_NEEDED">Follow-up Needed</SelectItem>
                                        <SelectItem value="NO_ANSWER">No Answer</SelectItem>
                                        <SelectItem value="VOICEMAIL">Voicemail</SelectItem>
                                        <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    />
                </div>

                <Controller
                    name="isActive"
                    control={control}
                    render={({ field }) => (
                        <div className="flex items-center gap-2">
                            <Switch id="activity-type-active" checked={field.value} onCheckedChange={field.onChange} />
                            <Label htmlFor="activity-type-active">Active (visible in forms)</Label>
                        </div>
                    )}
                />
            </form>
        </StandardDialog>
    );
}
