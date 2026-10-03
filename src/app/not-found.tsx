import Link from "next/link";
import type { Metadata } from "next";
import { FileQuestion } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = { title: "Page not found · Unnatify" };

// Branded 404 (UI/UX plan G1). A server component, so it renders the same for signed-in and
// signed-out visitors; the dashboard link goes through the sign-in redirect when needed.
export default function NotFound() {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
            <BrandLogo className="h-8" />
            <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center">
                <div aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <FileQuestion className="size-5" />
                </div>
                <div className="space-y-1">
                    <h1 className="text-lg font-semibold">This page doesn&apos;t exist</h1>
                    <p className="text-sm text-muted-foreground">
                        The link may be old, or the record may have been removed. Check the address, or start from the dashboard and use search.
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/dashboard" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Go to dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}
