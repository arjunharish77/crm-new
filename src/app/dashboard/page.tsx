'use client';

import { DashboardManager } from "@/components/dashboard/dashboard-manager";
import { OnboardingChecklistBanner } from "@/components/dashboard/onboarding-checklist-banner";

export default function DashboardPage() {
    return (
        <div className="mx-auto max-w-[1536px] px-4 py-8">
            <OnboardingChecklistBanner />
            <div className="flex-grow">
                <DashboardManager />
            </div>
        </div>
    );
}
