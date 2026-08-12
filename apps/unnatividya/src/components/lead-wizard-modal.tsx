"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/components/analytics";
import { LeadFormLoader, type LeadFormContext } from "@/components/lead-form-loader";
import { getCourseBySlug, getUniversityBySlug } from "@/data/catalog";

// Fallback labels for entry points with no course/university id attached — e.g. the EMI
// calculator or a fee guide — so the wizard title still reflects why the visitor opened it
// instead of always falling back to the fully generic title.
const INTENT_LABELS: Record<string, string> = {
  "emi-calculator": "your EMI plan",
  "fee-guide": "fees",
  "eligibility-guide": "eligibility",
  "career-scope-guide": "career scope",
  "ugc-approval-guide": "UGC approval",
  recommender: "your shortlist",
  comparison: "your comparison",
  "compare-unlock": "your comparison",
  specialization: "this specialization",
  "article-help": "this article",
};

function contextLabel(context: LeadFormContext): string | null {
  if (context.course) {
    const course = getCourseBySlug(context.course);
    if (course) return `${course.name} — ${course.university.shortName}`;
  }
  if (context.university) {
    const university = getUniversityBySlug(context.university);
    if (university) return university.name;
  }
  if (context.intent && INTENT_LABELS[context.intent]) return INTENT_LABELS[context.intent];
  return null;
}

export function LeadWizardModal() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeadFormContext>({});

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-open-lead]") : null;
      if (!target) return;
      event.preventDefault();
      const href = target.getAttribute("href");
      const params = href ? new URL(href, window.location.origin).searchParams : new URLSearchParams();
      trackEvent("lead_cta_click", {
        intent: params.get("intent") || undefined,
        course_id: params.get("course") || undefined,
        university_id: params.get("university") || undefined,
      });
      setContext({
        course: params.get("course") || undefined,
        university: params.get("university") || undefined,
        intent: params.get("intent") || undefined,
        goal: params.get("goal") || undefined,
        name: params.get("name") || undefined,
        email: params.get("email") || undefined,
        phone: params.get("phone") || undefined,
      });
      setOpen(true);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    // Capture phase, not bubble: next/link's own onClick (which triggers client-side
    // navigation) runs during the bubble phase at the target, before a bubble-phase document
    // listener would ever see the event. Intercepting during capture lets us call
    // preventDefault() before Link's handler checks event.defaultPrevented, so it skips
    // navigation instead of racing it.
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="lead-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="lead-modal-head">
          <div>
            <h2 id="lead-modal-title">
              {contextLabel(context) ? `Talk to an expert about ${contextLabel(context)}` : "Get free expert counselling"}
            </h2>
            <p>Free counselling · No spam, ever</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="lead-modal-body">
          <LeadFormLoader context={context} />
        </div>
      </div>
    </div>
  );
}
