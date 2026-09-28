'use client';

import { DashboardManager } from "@/components/dashboard/dashboard-manager";
import { OnboardingChecklistBanner } from "@/components/dashboard/onboarding-checklist-banner";

export default function DashboardPage() {
    return (
        <div id="dashboard-workspace" className="min-w-0 space-y-4">
            <OnboardingChecklistBanner />
            <div className="min-w-0">
                <DashboardManager />
            </div>
        </div>
    );
}
