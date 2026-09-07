"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MailX } from "lucide-react";

type Context = { channel: string; recipient: string; entityType: string };

export default function UnsubscribePage() {
    const params = useParams();
    const outboxId = params?.outboxId as string;
    const [context, setContext] = useState<Context | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [done, setDone] = useState<"CHANNEL" | "ALL" | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!outboxId) return;
        fetch(`/api/public/unsubscribe/${outboxId}`)
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((data) => setContext(data))
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [outboxId]);

    const submit = async (scope: "CHANNEL" | "ALL") => {
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
            setNotFound(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
            ) : notFound ? (
                <p className="text-sm text-muted-foreground">This link is no longer valid.</p>
            ) : done ? (
                <>
                    <CheckCircle2 className="mb-4 size-10 text-primary" />
                    <h1 className="text-lg font-bold">You&apos;re unsubscribed</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {done === "ALL" ? "You won't receive any further marketing messages." : `You won't receive further ${context?.channel.toLowerCase()} messages.`}
                    </p>
                </>
            ) : (
                <>
                    <MailX className="mb-4 size-10 text-muted-foreground" />
                    <h1 className="text-lg font-bold">Manage your preferences</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        This will unsubscribe {context?.recipient} from future {context?.channel.toLowerCase()} messages.
                    </p>
                    <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                        <Button variant="outline" disabled={submitting} onClick={() => submit("CHANNEL")}>
                            Unsubscribe from {context?.channel.toLowerCase()} only
                        </Button>
                        <Button variant="destructive" disabled={submitting} onClick={() => submit("ALL")}>
                            Unsubscribe from all marketing
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
