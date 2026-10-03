"use client";
import type { CatalogReader } from "@/lib/catalog-snapshot";
import { useCatalog } from "@/components/catalog-provider";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/components/analytics";
import { LeadFormLoader, type LeadFormContext } from "@/components/lead-form-loader";

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

function contextLabel(catalog: CatalogReader, context: LeadFormContext): string | null {
  const { getCourseBySlug, getUniversityBySlug } = catalog;
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
  const catalog = useCatalog();
  const dialog = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeadFormContext>({});

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-open-lead]") : null;
      if (!target) return;
      event.preventDefault();
      openerRef.current = target;
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
    const close = () => setOpen(false);
    window.addEventListener("uv-close-lead", close);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("uv-close-lead", close);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const opener = openerRef.current;
    const backdrop = dialog.current?.parentElement;
    const siblings = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== backdrop && !el.contains(backdrop || null));
    const priorInert = siblings.map(el => el.inert);
    siblings.forEach(el => { el.inert = true; });
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", trap);
      siblings.forEach((el, i) => { el.inert = priorInert[i]; });
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="lead-modal-backdrop" role="presentation">
      <div ref={dialog} className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" aria-describedby="lead-modal-description" onClick={(event) => event.stopPropagation()}>
        <div className="lead-modal-head">
          <div>
            <h2 id="lead-modal-title">
              {contextLabel(catalog, context) ? `Apply now — ${contextLabel(catalog, context)}` : "Apply now"}
            </h2>
            <p id="lead-modal-description">Start with your details. Choose your course next.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <div className="lead-modal-body">
          <LeadFormLoader context={context} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
