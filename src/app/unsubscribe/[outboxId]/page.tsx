"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePublicResource } from "@/hooks/use-public-resource";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MailX } from "lucide-react";

type Context = { channel: string; recipient: string; entityType: string };

export default function UnsubscribePage() {
    const params = useParams();
    const outboxId = params?.outboxId as string;
    const { data: context, loading, error, notFound, retry } = usePublicResource<Context>(`/api/public/unsubscribe/${outboxId}`);
    const [submitError, setSubmitError] = useState(false);
    const [done, setDone] = useState<"CHANNEL" | "ALL" | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (scope: "CHANNEL" | "ALL") => {
        if (submitting) return;
        setSubmitError(false);
        setSubmitting(true);
        try {
            const res = await fetch(`/api/public/unsubscribe/${outboxId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scope }),
            });
            if (!res.ok) throw new Error();
            setDone(scope);
        } catch {
            setSubmitError(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md break-words flex-col items-center justify-center p-6 text-center">
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : notFound ? (
                <p className="text-sm text-muted-foreground">This link is no longer valid.</p>
            ) : error ? (
                <ErrorState description="This page could not be loaded." onRetry={retry} />
            ) : done ? (
                <>
                    <CheckCircle2 className="mb-4 size-10 text-primary" />
                    <h1 className="text-lg font-bold">You&apos;re unsubscribed</h1>
                    <p className="mt-1 w-full min-w-0 break-words text-sm text-muted-foreground">
                        {done === "ALL" ? "You won't receive any further marketing messages." : `You won't receive further ${context?.channel.toLowerCase()} messages.`}
                    </p>
                </>
            ) : (
                <>
                    <MailX className="mb-4 size-10 text-muted-foreground" />
                    <h1 className="text-lg font-bold">Manage your preferences</h1>
                    <p className="mt-1 w-full min-w-0 break-words text-sm text-muted-foreground">
                        This will unsubscribe {context?.recipient} from future {context?.channel.toLowerCase()} messages.
                    </p>
                    {submitError && <p role="alert" className="mt-3 text-sm text-destructive">Your preference could not be saved. Please try again.</p>}
                    <div className="mt-6 flex w-full min-w-0 flex-col gap-2">
                        <Button className="h-auto min-h-10 whitespace-normal" variant="outline" disabled={submitting} onClick={() => submit("CHANNEL")}>
                            Unsubscribe from {context?.channel.toLowerCase()} only
                        </Button>
                        <Button className="h-auto min-h-10 whitespace-normal" variant="destructive" disabled={submitting} onClick={() => submit("ALL")}>
                            Unsubscribe from all marketing
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
