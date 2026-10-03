"use client";

import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useConfirm } from "@/components/common/dialogs-provider";
import { formatWorkspaceDate } from "@/lib/date-format";

export const ARCHIVE_DAYS = 30;

// When an archived item is removed for good: 30 days after it was archived.
export function purgeDate(deletedAt: string | null | undefined) {
    return deletedAt ? formatWorkspaceDate(new Date(new Date(deletedAt).getTime() + ARCHIVE_DAYS * 86_400_000)) : "";
}

type Item = { id: string; name: string };

// Archive model for configuration items (UI/UX plan §11.6 D, decision 31): Archive needs no
// dialog and offers Undo; an archived item can be restored for 30 days; deleting it for good asks
// for the item's name to be typed. `basePath` is the item's API path, e.g. "/automation-v2".
// Items on the shared archive (`archiveKind`, see lib/server/archive-items.ts) restore and delete
// for good through /archive/<kind>/<id>; archiving is still the item's own Delete.
export function useArchiveActions({ basePath, archiveKind, noun, consequence, onChange }: {
    basePath: string;
    archiveKind?: string;
    noun: string;
    // What permanent deletion also removes, e.g. "its 120 past runs".
    consequence?: (item: Item) => string | null;
    onChange: () => void;
}) {
    const confirm = useConfirm();

    const restore = async (item: Item, quiet = false) => {
        try {
            await apiFetch(archiveKind ? `/archive/${archiveKind}/${item.id}` : `${basePath}/${item.id}/restore`, { method: "POST" });
            if (!quiet) toast.success(`Restored: ${item.name}`);
            onChange();
        } catch (error: any) {
            toast.error(error?.message || `The ${noun} couldn't be restored`);
        }
    };

    const archive = async (item: Item) => {
        try {
            const result = await apiFetch<{ purgeAfter?: string }>(`${basePath}/${item.id}`, { method: "DELETE" });
            onChange();
            toast.success(`Archived: ${item.name}`, {
                description: result?.purgeAfter ? `You can restore it until ${formatWorkspaceDate(result.purgeAfter)}.` : undefined,
                action: { label: "Undo", onClick: () => restore(item, true) },
                duration: 8000,
            });
        } catch (error: any) {
            toast.error(error?.message || `The ${noun} couldn't be archived`);
        }
    };

    const deletePermanently = async (item: Item) => {
        const extra = consequence?.(item);
        const ok = await confirm({
            title: `Delete ${item.name} for good?`,
            description: `This can't be undone${extra ? `: ${extra} will be deleted too` : ""}. Type the ${noun}'s name to confirm.`,
            confirmLabel: "Delete for good",
            destructive: true,
            typedConfirmation: item.name,
        });
        if (!ok) return;
        try {
            await apiFetch(archiveKind ? `/archive/${archiveKind}/${item.id}` : `${basePath}/${item.id}?permanent=1`, { method: "DELETE" });
            toast.success(`Deleted: ${item.name}`);
            onChange();
        } catch (error: any) {
            toast.error(error?.message || `The ${noun} couldn't be deleted`);
        }
    };

    return { archive, restore, deletePermanently };
}
