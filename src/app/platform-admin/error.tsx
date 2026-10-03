"use client";

import { RouteError } from "@/components/app-states/route-error";

export default function PlatformAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError error={error} reset={reset} homeHref="/platform-admin" homeLabel="Go to platform overview" />;
}
