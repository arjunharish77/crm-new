"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePublicResource } from "@/hooks/use-public-resource";
import { ErrorState } from "@/components/common/error-state";
import { Label } from "@/components/ui/label";
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
    const { data: survey, loading, error, notFound, retry } = usePublicResource<Survey>(`/api/public/case-surveys/${id}`);
    const [submitError, setSubmitError] = useState(false);
    const [score, setScore] = useState<number | null>(null);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => { if (survey?.respondedAt) setDone(true); }, [survey]);

    const submit = async () => {
        if (!score) return;
        if (submitting) return;
        setSubmitError(false);
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
                <p className="text-sm text-muted-foreground">This survey link is no longer valid.</p>
            ) : error ? (
                <ErrorState description="This page could not be loaded." onRetry={retry} />
            ) : done ? (
                <>
                    <CheckCircle2 className="mb-4 size-10 text-primary" />
                    <h1 className="text-lg font-bold">Thank you for your feedback</h1>
                    <p className="mt-1 w-full min-w-0 break-words text-sm text-muted-foreground">Your response has been recorded.</p>
                </>
            ) : (
                <>
                    <h1 className="text-lg font-bold">How did we do?</h1>
                    <p className="mt-1 w-full min-w-0 break-words text-sm text-muted-foreground">
                        Case #{survey?.caseNumber}: {survey?.subject}
                    </p>
                    <div className="mt-6 flex gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button key={value} type="button" onClick={() => setScore(value)} disabled={submitting} aria-pressed={score === value} className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${value} out of 5`}>
                                <Star className={cn("size-8", score !== null && value <= score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                            </button>
                        ))}
                    </div>
                    <Label htmlFor="survey-comment" className="mt-4 self-start">Comments (optional)</Label>
                    <Textarea id="survey-comment" disabled={submitting}
                        className="mt-2"
                        rows={3}
                        placeholder="Anything you'd like to add? (optional)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />
                    {submitError && <p role="alert" className="mt-3 text-sm text-destructive">Your feedback could not be sent. Your answers are still here; please try again.</p>}
                    <Button className="mt-4" disabled={!score || submitting} onClick={submit}>
                        {submitting ? "Submitting..." : "Submit feedback"}
                    </Button>
                </>
            )}
        </div>
    );
}
