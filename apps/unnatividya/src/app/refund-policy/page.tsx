import type { Metadata } from "next";
import Link from "next/link";

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
      "Admission, registration, semester, examination, and program fees are governed by the respective university's latest policy. Refund eligibility, deductions, timelines, and cancellation rules must be verified from the university before payment.",
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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 64px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
        <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Refund policy
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "0 0 24px" }}>Refund and Cancellation Policy</h1>
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
      <div style={{ marginTop: 36, background: "#F4F3FC", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, fontSize: 14 }}>
        Questions? Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm) or use the callback button on any page.
      </div>
    </main>
  );
}
