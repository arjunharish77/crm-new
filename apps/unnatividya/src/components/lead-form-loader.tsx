"use client";

import dynamic from "next/dynamic";

const LeadForm = dynamic(() => import("@/components/lead-form").then((module) => module.LeadForm), {
  loading: () => (
    <div className="lead-form-skeleton" aria-label="Loading enquiry form">
      <div />
      <div />
      <div />
      <div />
    </div>
  ),
});

export type LeadFormContext = {
  course?: string;
  university?: string;
  intent?: string;
  goal?: string;
  // Pre-fills from the course page's own rail form (see course-detail's right rail) -- the
  // visitor already typed these once, so the wizard shouldn't ask again from scratch.
  name?: string;
  email?: string;
  phone?: string;
};

export function LeadFormLoader({ context }: { context?: LeadFormContext }) {
  return <LeadForm context={context} />;
}
