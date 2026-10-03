"use client";

import { StandardDialog } from "@/components/common/standard-dialog";
import { ClipboardPaste } from "lucide-react";
import { nodeColor } from "@/components/automation/node-colors";
import type { AutomationBuilder } from "./use-automation-builder";

// "Add automation step", moved here from page.tsx unchanged.
export function AddStepDialog({ s }: { s: AutomationBuilder }) {
    const { addAfterNodeId, setAddAfterNodeId, clonedNodeData, addNode, pasteClonedNode, triggerScopeLabel, availableNodeTypes } = s;
    return (
        <>
            <StandardDialog
                open={Boolean(addAfterNodeId)}
                onClose={() => setAddAfterNodeId(null)}
                title="Add automation step"
                maxWidth="xs"
            >
                <div className="space-y-1 py-1">
                    <div className="mb-2 rounded-md bg-muted/40 px-3 py-2">
                        <p className="text-xs font-bold text-foreground">Available for {triggerScopeLabel}</p>
                        <p className="text-xs leading-4 text-muted-foreground">Only steps that can run with this trigger context are shown.</p>
                    </div>
                    {clonedNodeData && (
                        <button
                            type="button"
                            onClick={() => pasteClonedNode(addAfterNodeId)}
                            className="flex w-full items-center gap-3 rounded-md bg-primary/[0.06] px-2 py-2 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ClipboardPaste className="size-5 text-primary" />
                            <span className="text-sm font-semibold">Paste {clonedNodeData.label || 'cloned step'}</span>
                        </button>
                    )}
                    {availableNodeTypes.filter((nodeType) => nodeType.type !== "trigger").map((nodeType) => {
                        const Icon = nodeType.icon;
                        return (
                            <button
                                key={nodeType.type}
                                type="button"
                                onClick={() => addNode(nodeType.type, addAfterNodeId)}
                                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Icon className="size-5" style={{ color: nodeColor(nodeType.type) }} aria-hidden />
                                <span className="text-sm font-semibold">{nodeType.label}</span>
                            </button>
                        );
                    })}
                </div>
            </StandardDialog>
        </>
    );
}
