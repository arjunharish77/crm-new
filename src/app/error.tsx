"use client";

import { RouteError } from "@/components/app-states/route-error";

// Pages outside the app shell (sign-in, public forms, reset password).
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-background p-4">
            <div className="w-full max-w-lg rounded-xl border bg-card">
                <RouteError error={error} reset={reset} homeHref="/" homeLabel="Go to the start page" />
            </div>
        </main>
    );
}
