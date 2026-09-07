"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Survey = { id: string; caseNumber: number; subject: string; respondedAt: string | null; score: number | null };

// Public, unauthenticated CSAT/NPS response page (gap checklist Module 11, item 15) -- mirrors
// the existing unsubscribe page's plain-fetch, no-auth convention exactly.
export default function CaseSurveyPage() {
    const params = useParams();
    const id = params?.id as string;
    const [survey, setSurvey] = useState<Survey | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [score, setScore] = useState<number | null>(null);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!id) return;
        fetch(`/api/public/case-surveys/${id}`)
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((data) => { setSurvey(data); if (data.respondedAt) setDone(true); })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [id]);

    const submit = async () => {
        if (!score) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/public/case-surveys/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ score, comment: comment.trim() || undefined }),
            });
            if (!res.ok) throw new Error();
            setDone(true);
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
                <p className="text-sm text-muted-foreground">This survey link is no longer valid.</p>
            ) : done ? (
                <>
                    <CheckCircle2 className="mb-4 size-10 text-primary" />
                    <h1 className="text-lg font-bold">Thank you for your feedback</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Your response has been recorded.</p>
                </>
            ) : (
                <>
                    <h1 className="text-lg font-bold">How did we do?</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Case #{survey?.caseNumber}: {survey?.subject}
                    </p>
                    <div className="mt-6 flex gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button key={value} type="button" onClick={() => setScore(value)} aria-label={`${value} out of 5`}>
                                <Star className={cn("size-8", score !== null && value <= score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                            </button>
                        ))}
                    </div>
                    <Textarea
                        className="mt-4"
                        rows={3}
                        placeholder="Anything you'd like to add? (optional)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />
                    <Button className="mt-4" disabled={!score || submitting} onClick={submit}>
                        {submitting ? "Submitting..." : "Submit feedback"}
                    </Button>
                </>
            )}
        </div>
    );
}
