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
import { StandardDialog } from "@/components/common/standard-dialog";

interface TeamRecord {
  id: string;
  name: string;
  description?: string | null;
}

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
  }, [open, team, reset]);

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  async function onSubmit(values: any) {
    setLoading(true);
    try {
      if (team?.id) {
        await apiFetch(`/teams/${team.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        toast.success("Team updated successfully");
      } else {
        await apiFetch("/teams", {
          method: "POST",
          body: JSON.stringify(values),
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
      </form>
    </StandardDialog>
  );
}
