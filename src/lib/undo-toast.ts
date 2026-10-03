import { toast } from "sonner";

// Reversible changes are done right away and offered an Undo (UI/UX plan §11.6 D): status,
// owner, pause, archive. The toast stays 6 seconds; Undo runs `undo` and reports its outcome.
export function undoToast(message: string, undo: () => Promise<unknown> | unknown, options: { undoneMessage?: string; failedMessage?: string } = {}) {
    toast.success(message, {
        duration: 6000,
        action: {
            label: "Undo",
            onClick: async () => {
                try {
                    await undo();
                    toast.success(options.undoneMessage ?? "Undone");
                } catch (error: any) {
                    toast.error(error?.message || options.failedMessage || "Couldn't undo that change");
                }
            },
        },
    });
}
