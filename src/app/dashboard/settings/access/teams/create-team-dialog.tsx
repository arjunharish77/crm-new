"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TeamRecord {
  id: string;
  name: string;
  description?: string | null;
  workingHours?: { days?: number[]; start?: string; end?: string } | null;
  timezone?: string | null;
  defaultRoleId?: string | null;
  defaultSalesGroupId?: string | null;
}

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  team?: TeamRecord | null;
}

const formSchema = z.object({
  name: z.string().min(2, "Team name is required"),
  description: z.string().optional(),
});

export function CreateTeamDialog({
  open,
  onOpenChange,
  onSuccess,
  team,
}: CreateTeamDialogProps) {
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [timezone, setTimezone] = useState("");
  const [defaultRoleId, setDefaultRoleId] = useState("");
  const [defaultSalesGroupId, setDefaultSalesGroupId] = useState("");
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [salesGroups, setSalesGroups] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    apiFetch("/roles").then((data) => setRoles(Array.isArray(data) ? data : [])).catch(() => undefined);
    apiFetch("/sales-groups").then((data) => setSalesGroups(Array.isArray(data) ? data : [])).catch(() => undefined);
  }, [open]);

  const { control, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: team?.name ?? "",
      description: team?.description ?? "",
    });
    setDays(Array.isArray(team?.workingHours?.days) ? team.workingHours!.days! : []);
    setStart(team?.workingHours?.start ?? "");
    setEnd(team?.workingHours?.end ?? "");
    setTimezone(team?.timezone ?? "");
    setDefaultRoleId(team?.defaultRoleId ?? "");
    setDefaultSalesGroupId(team?.defaultSalesGroupId ?? "");
  }, [open, team, reset]);

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const toggleDay = (value: number) => {
    setDays((current) => (current.includes(value) ? current.filter((day) => day !== value) : [...current, value]));
  };

  async function onSubmit(values: any) {
    setLoading(true);
    try {
      // Leaving either time blank means "no schedule restriction" -- distribution-engine.ts's
      // filterByWorkingHours treats a null/incomplete workingHours as a no-op, matching every
      // other optional filter (skills, quota) in that engine.
      const workingHours = start && end ? { days, start, end } : null;
      const payload = { ...values, workingHours, timezone: timezone.trim() || undefined, defaultRoleId: defaultRoleId || null, defaultSalesGroupId: defaultSalesGroupId || null };
      if (team?.id) {
        await apiFetch(`/teams/${team.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Team updated successfully");
      } else {
        await apiFetch("/teams", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Team created successfully");
      }

      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to save team");
    } finally {
      setLoading(false);
    }
  }

  return (
    <StandardDialog
      open={open}
      onClose={handleClose}
      title={team?.id ? "Edit Team" : "Create Team"}
      subtitle="Add a new functional group for your users."
      icon={<UsersRound className="size-4" />}
      actions={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-team-form"
            disabled={loading}
          >
            {loading ? "Saving..." : team?.id ? "Save Team" : "Create Team"}
          </Button>
        </>
      }
    >
      <form id="create-team-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pb-1">
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                {...field}
                placeholder="e.g. Engineering"
                autoFocus
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message as string}</p>
              )}
            </div>
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <div className="space-y-1.5">
              <Label htmlFor="team-description">Description</Label>
              <Textarea
                id="team-description"
                {...field}
                placeholder="Brief description of the team's purpose"
                rows={3}
                aria-invalid={!!errors.description}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message as string}</p>
              )}
            </div>
          )}
        />

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Working Hours (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Used by Distribution Engine assignment rules to skip this team&apos;s members outside their scheduled hours.
            Leave start/end blank for no restriction.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-hours-start" className="text-xs font-normal text-muted-foreground">Start</Label>
              <Input id="team-hours-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-hours-end" className="text-xs font-normal text-muted-foreground">End</Label>
              <Input id="team-hours-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-timezone" className="text-xs font-normal text-muted-foreground">Timezone (IANA name, e.g. Asia/Kolkata)</Label>
            <Input id="team-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Days (leave all unchecked for every day)</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={days.includes(day.value)} onCheckedChange={() => toggleDay(day.value)} />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>SCIM Group Sync Defaults (optional)</Label>
          <p className="text-xs text-muted-foreground">
            When an identity provider adds a user to this team via SCIM group sync, these are applied to the user automatically.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-default-role" className="text-xs font-normal text-muted-foreground">Default Role</Label>
              <Select value={defaultRoleId || "none"} onValueChange={(value) => setDefaultRoleId(value === "none" ? "" : value)}>
                <SelectTrigger id="team-default-role"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-default-sales-group" className="text-xs font-normal text-muted-foreground">Default Sales Group</Label>
              <Select value={defaultSalesGroupId || "none"} onValueChange={(value) => setDefaultSalesGroupId(value === "none" ? "" : value)}>
                <SelectTrigger id="team-default-sales-group"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {salesGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </form>
    </StandardDialog>
  );
}
