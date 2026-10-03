export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Unnati Vidya collects, uses, stores, and protects enquiry and counselling data.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  {
    title: "Information we collect",
    items: [
      "Contact details such as name, phone number, email address, preferred course, preferred university, and enquiry context.",
      "Verification data such as email OTP status, phone OTP status when enabled, consent status, and form submission timestamps.",
      "Marketing attribution such as UTM source, campaign, medium, term, content, landing page, referral page, and device/browser metadata where lawful and useful.",
      "CMS/admin activity required to operate the website, review leads, and manage course or university content.",
    ],
  },
  {
    title: "How we use the information",
    items: [
      "To respond to enquiries and help learners compare online degree options.",
      "To verify contact details and reduce duplicate, inaccurate, or spam enquiries.",
      "To improve website content, course discovery, recommendations, and user experience.",
      "To push leads to an external CRM only when the website admin explicitly enables and configures that integration.",
    ],
  },
  {
    title: "Sharing and processors",
    items: [
      "We may use email, analytics, hosting, database, CRM, and communication service providers to operate the website.",
      "We do not sell learner enquiry data.",
      "University or counsellor handoff should happen only when required to answer the enquiry or support admission counselling.",
    ],
  },
  {
    title: "Retention and control",
    items: [
      "Lead and verification records are retained for counselling, audit, and compliance purposes unless deletion is requested or legally required.",
      "You can request correction or deletion of your enquiry data by emailing admin@unnatividya.com.",
      "Deletion is completed within seven working days, except where a university admission is already in progress and the record must be retained to support it.",
      "Administrative access to CMS data is restricted and audited.",
    ],
  },
];

export default function PrivacyPage() {
  return <PublishedCatalogBoundary>{(
    <LegalPageLayout crumb="Privacy policy" title="Privacy Policy" lastUpdated="12 August 2026" sections={sections.map((section, index) => ({ id: `policy-section-${index + 1}`, title: section.title }))}>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        This policy explains how Unnati Vidya collects, uses, stores, and protects information
        submitted through this website.
      </p>
      {sections.map((section, index) => (
        <section key={section.title} aria-labelledby={`policy-section-${index + 1}`}>
          <h2 id={`policy-section-${index + 1}`} tabIndex={-1} style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>{section.title}</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7 }}>
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </LegalPageLayout>
  )}</PublishedCatalogBoundary>;
}
