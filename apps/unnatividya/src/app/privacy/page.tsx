import type { Metadata } from "next";
import Link from "next/link";

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
      "You can request correction or deletion of your enquiry data by contacting Unnati Vidya through the published contact channels.",
      "Administrative access to CMS data is restricted and audited.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 64px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
        <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Privacy policy
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "0 0 24px" }}>Privacy Policy</h1>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          This policy explains how Unnati Vidya collects, uses, stores, and protects information
          submitted through this website.
      </p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>{section.title}</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7 }}>
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
      <div style={{ marginTop: 36, background: "#F4F3FC", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, fontSize: 14 }}>
        Questions? Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm) or use the callback button on any page.
      </div>
    </main>
  );
}
