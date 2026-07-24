'use client';

import { DashboardManager } from "@/components/dashboard/dashboard-manager";

export default function DashboardPage() {
    return (
        <div className="mx-auto max-w-[1536px] px-4 py-8">
            <div className="flex-grow">
                <DashboardManager />
            </div>
        </div>
    );
}
