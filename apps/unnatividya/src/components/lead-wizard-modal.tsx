"use client";

import { useEffect, useState } from "react";
import { LeadFormLoader, type LeadFormContext } from "@/components/lead-form-loader";
import { getCourseBySlug, getUniversityBySlug } from "@/data/catalog";

function contextLabel(context: LeadFormContext): string | null {
  if (context.course) {
    const course = getCourseBySlug(context.course);
    if (course) return `${course.name} — ${course.university.shortName}`;
  }
  if (context.university) {
    const university = getUniversityBySlug(context.university);
    if (university) return university.name;
  }
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
      setContext({
        course: params.get("course") || undefined,
        university: params.get("university") || undefined,
        intent: params.get("intent") || undefined,
        goal: params.get("goal") || undefined,
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
