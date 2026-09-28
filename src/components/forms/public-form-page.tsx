"use client";

import { usePublicResource } from "@/hooks/use-public-resource";
import { PublicFormRenderer } from "@/components/forms/public-form-renderer";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";

export function PublicFormPageContent({ identifier }: { identifier: string }) {
    const { data: form, loading, error, notFound, retry } = usePublicResource<any>(`/api/public/forms/${encodeURIComponent(identifier)}`);
    return (
        <main className="flex min-h-dvh min-w-0 items-center justify-center bg-background px-4 py-8 sm:px-6">
            <Card className="@container/public-form w-full min-w-0 max-w-xl break-words p-4 sm:p-8">
                {loading ? <p role="status" className="text-center text-sm text-muted-foreground">Loading form...</p>
                    : notFound ? <div className="text-center"><h1 className="text-xl font-semibold">Form unavailable</h1><p className="mt-2 text-muted-foreground">This form link is no longer available.</p></div>
                    : error || !form ? <ErrorState description="The form could not be loaded." onRetry={retry} />
                    : !form.isActive ? <div className="text-center"><h1 className="text-xl font-semibold">Form Closed</h1><p className="mt-2 text-muted-foreground">This form is currently inactive.</p></div>
                    : <>
                        <header className="mb-6 min-w-0 text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
                            {form.description && <p className="mt-2 text-muted-foreground">{form.description}</p>}
                        </header>
                        <PublicFormRenderer key={identifier} slug={identifier} config={form.config} />
                        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">Powered by Unnatify</p>
                    </>}
            </Card>
        </main>
    );
}
