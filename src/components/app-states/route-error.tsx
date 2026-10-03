"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";

// Shared body of the route error pages (UI/UX plan G1): a crash in a page shows this inside the
// app shell (navigation and header stay usable) instead of Next's unbranded default, with Try
// again and a way out. The error digest is shown so a user can quote it to an admin; the
// message itself isn't, since it may contain internal detail.
export function RouteError({ error, reset, homeHref = "/dashboard", homeLabel = "Go to dashboard" }: {
    error: Error & { digest?: string };
    reset: () => void;
    homeHref?: string;
    homeLabel?: string;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <ErrorState
            title="This page ran into a problem"
            description={`Try again. If it keeps happening, tell your admin${error.digest ? ` and quote reference ${error.digest}` : ""}.`}
            onRetry={reset}
            action={<Button asChild variant="ghost"><Link href={homeHref}>{homeLabel}</Link></Button>}
        />
    );
}
