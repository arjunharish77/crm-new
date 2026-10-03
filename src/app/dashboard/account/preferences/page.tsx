"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PreferencesPanel } from "@/components/account/personal-preferences";

export default function AccountPreferencesPage() {
    return (
        <div className="min-w-0">
            <PageHeader title="Preferences" description="How the app looks and behaves for you. Changes save straight away." />
            <PreferencesPanel />
        </div>
    );
}
