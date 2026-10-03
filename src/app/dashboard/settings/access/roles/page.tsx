"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { RolesPanel } from "./roles-panel";
import { PermissionTemplatesPanel } from "./templates-panel";

const TABS = [
    { value: "roles", label: "Roles" },
    { value: "templates", label: "Permission templates" },
] as const;

// Settings › Users & access › Roles & permissions (UI/UX plan §11.5): roles and the permission
// templates layered on them, on one page. They were two Settings pages.
export default function RolesAndPermissionsPage() {
    const [tab, setTab] = usePageTab(TABS, "roles");
    return (
        <div className="min-w-0">
            <PageHeader title="Roles & permissions" description="Who can use each module, see which records, and change which fields." />
            <PageTabs tabs={TABS} value={tab} onChange={setTab} label="Roles and permissions" className="mb-4" />
            <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab === "templates" ? <PermissionTemplatesPanel embedded /> : <RolesPanel embedded />}
            </div>
        </div>
    );
}
