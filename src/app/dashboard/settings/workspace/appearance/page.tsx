"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { AppearanceSection } from "@/components/account/personal-preferences";

// Settings › Appearance: the same mode and accent controls as My account › Preferences, kept
// inside Settings so its menu stays in place.
export default function SettingsAppearancePage() {
    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Appearance" description="How the app looks for you. It's your own choice and applies on this browser; it doesn't change what others see." />
            <AppearanceSection title="Mode and colour" />
            <p className="text-sm text-muted-foreground">
                Start page, pinned items, table rows and notifications are in{" "}
                <Link href="/dashboard/account/preferences" className="font-medium text-foreground underline underline-offset-4">My account › Preferences</Link>.
            </p>
        </div>
    );
}
