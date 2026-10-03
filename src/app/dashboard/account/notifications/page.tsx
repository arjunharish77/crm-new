"use client";

import { PageHeader } from "@/components/layout/page-header";
import { NotificationsPanel } from "@/components/account/personal-preferences";

export default function AccountNotificationsPage() {
    return (
        <div className="min-w-0">
            <PageHeader title="Notifications" description="Choose what you're notified about. Changes save straight away." />
            <NotificationsPanel />
        </div>
    );
}
