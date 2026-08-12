import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description: "Refund and cancellation information for Unnati Vidya enquiries and university program fees.",
  alternates: { canonical: "/refund-policy" },
};

const sections = [
  {
    title: "Unnati Vidya service fees",
    copy:
      "If Unnati Vidya charges any separate service, counselling, or processing fee in the future, the fee, cancellation window, and refund rule must be shown clearly before payment. The current website is prepared for enquiries and does not require payment through this site.",
  },
  {
    title: "University program fees",
    copy:
      "Admission, registration, semester, examination, and program fees are governed by the respective university's latest policy. As a general pattern across our listed universities, learners can typically expect a full refund before the batch starts and a pro-rata refund within the first two weeks after — but the exact refund eligibility, deductions, timelines, and cancellation rules must be verified from the university before payment, since they can vary by admission cycle.",
  },
  {
    title: "Fees paid through an education loan",
    copy:
      "If the fee was paid through an education loan, any refund is routed back to the lender, not to you directly. Processing usually takes 15 to 30 working days depending on the lending partner.",
  },
  {
    title: "Enquiry cancellation",
    copy:
      "You may ask Unnati Vidya to stop counselling follow-up for an enquiry. This does not cancel any separate admission, application, or payment process already completed with a university.",
  },
  {
    title: "Data and CRM handoff",
    copy:
      "Lead data is stored in the website database and is pushed to an external CRM only when configured by the admin. Deleting or stopping an enquiry from Unnati Vidya does not automatically alter records already submitted to an external system unless supported by that system.",
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout crumb="Refund policy" title="Refund and Cancellation Policy" lastUpdated="12 August 2026">
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        This page explains how refunds and cancellations are handled for enquiries and admissions
        support arranged through Unnati Vidya.
      </p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>{section.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{section.copy}</p>
        </section>
      ))}
    </LegalPageLayout>
  );
}
