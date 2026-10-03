"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useModuleEnabled } from "@/components/auth/feature-gate";
import { EmptyState } from "@/components/common/empty-state";

/**
 * Page-level counterpart of the server-side module gate: shows an explanation instead of the page
 * when the tenant's module is disabled or suspended (e.g. a bookmarked Call Center URL), rather
 * than rendering a page whose every request is refused. Children only mount when enabled, so
 * their hooks and data loading never run for a disabled module.
 */
export function ModuleGate({ moduleKey, name, children }: { moduleKey: string; name: string; children: ReactNode }) {
    const enabled = useModuleEnabled(moduleKey);
    if (!enabled) {
        return (
            <div className="min-w-0">
                <EmptyState
                    icon={<Lock className="size-10 text-muted-foreground opacity-50" />}
                    title={`${name} is not enabled`}
                    description={`Ask a platform admin to enable the ${name} module for this workspace.`}
                />
            </div>
        );
    }
    return <>{children}</>;
}
