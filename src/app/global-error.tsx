"use client";

import "./globals.css";
import { useEffect } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { reportClientError } from "@/lib/client-error-reporting";

// Last-resort fallback when the root layout itself fails (UI/UX plan G1). It replaces the whole
// document, so it can't rely on providers, the theme or the app shell; plain markup only.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { reportClientError(error); }, [error]);
    return (
        <html lang="en">
            <body className="font-sans antialiased">
                <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
                    <BrandLogo className="h-8" />
                    <div role="alert" className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 text-center">
                        <h1 className="text-lg font-semibold">Unnatify couldn&apos;t load</h1>
                        <p className="text-sm text-muted-foreground">
                            Try again in a moment.{error.digest ? ` If it keeps happening, tell your admin and quote reference ${error.digest}.` : ""}
                        </p>
                        <div className="flex justify-center gap-2">
                            <button type="button" onClick={reset} className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                                Try again
                            </button>
                            <a href="/dashboard" className="inline-flex h-10 items-center rounded-xl border border-border-strong px-4 text-sm font-medium">
                                Go to dashboard
                            </a>
                        </div>
                    </div>
                </main>
            </body>
        </html>
    );
}
