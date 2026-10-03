"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardDialog } from "@/components/common/standard-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { humanizeEnum } from "@/lib/display/status";
import { AppActionRunsPanel } from "./app-action-runs-panel";
import { AppCredentialsPanel, type RevealedAppSecret } from "./app-credentials-panel";
import { InstallPermissionsPanel } from "./install-permissions-panel";
import { RecordAccessPanel } from "./record-access-panel";

export type AppDetailTarget = {
    id: string;
    name: string;
    installId: string | null;
    installStatus: string | null;
    requestedPermissions?: Record<string, "read" | "write"> | null;
};

const ACTIVE_INSTALL_STATUSES = new Set(["PENDING_APPROVAL", "INSTALLED", "SUSPENDED"]);

type DetailTab = "permissions" | "record-access" | "credentials" | "action-history";

function NotInstalled() {
    return <EmptyState variant="inline" title="Not installed in this workspace" description="Permissions and record access show up once the app is installed or awaiting approval." />;
}

// App details for Settings › Integrations › Marketplace: what an installed app was granted, which
// records it can reach, its credentials (never their values) and its action runs. Tabs are local
// state, not the URL, because they live inside a dialog.
export function AppDetailDialog({ app, onClose }: { app: AppDetailTarget | null; onClose: () => void }) {
    const [tab, setTab] = useState<DetailTab>("permissions");
    const [revealed, setRevealed] = useState<RevealedAppSecret | null>(null);

    const close = () => {
        setRevealed(null);
        setTab("permissions");
        onClose();
    };

    // Pending, installed and suspended installs have grants and a record scope to look at;
    // rejected and uninstalled ones don't.
    const installed = app?.installId && ACTIVE_INSTALL_STATUSES.has(app.installStatus ?? "") ? app.installId : null;

    return (
        <StandardDialog
            open={!!app}
            onClose={close}
            title={app?.name ?? "App details"}
            subtitle={app?.installStatus ? `${humanizeEnum(app.installStatus)} in this workspace` : "Not installed in this workspace"}
            maxWidth="md"
            actions={<Button variant="outline" onClick={close}>Close</Button>}
        >
            {app && (
                <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} className="py-2">
                    <TabsList className="max-w-full flex-wrap">
                        <TabsTrigger value="permissions">Permissions</TabsTrigger>
                        <TabsTrigger value="record-access">Record access</TabsTrigger>
                        <TabsTrigger value="credentials">Credentials</TabsTrigger>
                        <TabsTrigger value="action-history">Action history</TabsTrigger>
                    </TabsList>
                    <TabsContent value="permissions" className="pt-3">
                        {installed ? <InstallPermissionsPanel installId={installed} requestedPermissions={app.requestedPermissions} /> : <NotInstalled />}
                    </TabsContent>
                    <TabsContent value="record-access" className="pt-3">
                        {installed ? <RecordAccessPanel installId={installed} /> : <NotInstalled />}
                    </TabsContent>
                    <TabsContent value="credentials" className="pt-3">
                        <AppCredentialsPanel
                            appId={app.id}
                            appName={app.name}
                            canRotate={app.installStatus !== "UNINSTALLED"}
                            revealed={revealed}
                            onRevealed={setRevealed}
                        />
                    </TabsContent>
                    <TabsContent value="action-history" className="pt-3">
                        <AppActionRunsPanel appId={app.id} />
                    </TabsContent>
                </Tabs>
            )}
        </StandardDialog>
    );
}
