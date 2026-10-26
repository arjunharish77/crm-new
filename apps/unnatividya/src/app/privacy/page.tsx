export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Privacy Policy",
  description: "How Unnati Vidya collects, uses, stores, and protects enquiry and counselling data.",
  alternates: { canonical: "/privacy" },
});

const sections: Array<{ id?: string; title: string; items: string[] }> = [
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
      "If you give the required Apply now contact consent, Unnati Vidya and authorised counselling associates may follow up about your enquiry by email, SMS, WhatsApp, or voice call. This consent does not sign you up for newsletter or promotional broadcasts; request that enquiry contact stop by emailing admin@unnatividya.com.",
      "To verify contact details and reduce duplicate, inaccurate, or spam enquiries.",
      "To improve website content, course discovery, recommendations, and user experience.",
      "To push leads to an external CRM only when the website admin explicitly enables and configures that integration.",
    ],
  },
  {
    id: "marketing",
    title: "Newsletter and WhatsApp updates",
    items: [
      "These are optional and separate from your enquiry. Sign up through the newsletter form and confirm your email if you want to receive them. The Apply now enquiry form does not subscribe you.",
      "We record what you agreed to (the exact wording version) and when. A newsletter sign-up starts only after you confirm from the confirmation email.",
      "You can stop them at any time: use the unsubscribe link in any email, or write to admin@unnatividya.com. Unsubscribing stops both the newsletter and WhatsApp updates. It doesn't cancel an enquiry you've made.",
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
    <LegalPageLayout policy="privacy" crumb="Privacy policy" title="Privacy Policy" lastUpdated="8 October 2026" sections={sections.map((section, index) => ({ id: section.id || `policy-section-${index + 1}`, title: section.title }))}>
      <p className="uv-legal-intro">This policy explains how Unnati Vidya collects, uses, stores, and protects information submitted through this website.</p>
      {sections.map((section, index) => (
        <section key={section.title} aria-labelledby={section.id || `policy-section-${index + 1}`}>
          <h2 id={section.id || `policy-section-${index + 1}`} tabIndex={-1}>{section.title}</h2>
          <ul>
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </LegalPageLayout>
  )}</PublishedCatalogBoundary>;
}
