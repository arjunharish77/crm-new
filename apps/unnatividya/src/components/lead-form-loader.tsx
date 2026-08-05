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
};

export function LeadFormLoader({ context }: { context?: LeadFormContext }) {
  return <LeadForm context={context} />;
}
