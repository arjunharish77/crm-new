export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { LegalPageLayout } from "@/components/legal-page-layout";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = {
  title: "How We Verify Our Data",
  description: "Understand Unnati Vidya’s source checks, ongoing catalog review, editorial approval process and how to report a correction.",
  alternates: { canonical: "/how-we-verify" },
};
const sections = [
  { id: "verification-status", title: "Where the review stands" },
  { id: "verification-checks", title: "What we check" },
  { id: "interpreting-claims", title: "Dates, ratings and outcomes" },
  { id: "report-correction", title: "Report a correction" },
  { id: "verification-faq", title: "Common questions" },
];
const checks = [
  { title: "Fees and fee categories", copy: "Use official university program and fee pages. Identify the currency, total or instalment amount, additional charges and the applicable domestic, international or NRI category. Record uncertainty when the source does not make a charge clear." },
  { title: "Eligibility and curriculum", copy: "Check the program’s admission requirements and published curriculum. Keep conflicting requirements visible for review rather than combining them into a single unsupported rule." },
  { title: "Recognition and intake", copy: "Look for evidence for the specific program, mode and academic session. A general university badge or evidence from an earlier session is not enough for us to mark a current program claim verified." },
  { title: "Review before publication", copy: "Prepare proposed corrections for administrator review. A source check or saved draft does not by itself change the published catalog. Reviewers must assess the evidence before applying a correction." },
];
const faqs = [
  ["Has every catalog detail been verified?", "No. Field-level review across the listed universities is ongoing. Prepared corrections and source checks do not mean that all current fees, recognition, intake or other details have been confirmed or published."],
  ["Does an updated date mean all the information is current?", "No. A publication or update date describes that page. It is not proof that every fee, eligibility rule or recognition claim was checked for the latest admission cycle. Read the source notes and confirm time-sensitive details with the university."],
  ["Are ratings and placement figures independently verified?", "They should not be treated as independently verified. Existing ratings, reviews, salary and placement figures remain visible while their source and methodology review is pending. They do not guarantee an individual learner’s outcome."],
  ["How are conflicting university details handled?", "Conflicting source details need review. A prepared correction should explain the conflict rather than present an unresolved requirement as settled. Confirm the applicable requirement directly with the university before applying."],
  ["How can I report a possible error?", "Email admin@unnatividya.com with the page link, the detail you believe is incorrect and a relevant official source if available. Please do not include personal application documents. A report requires review before a correction is published."],
];

export default function HowWeVerifyPage() {
  const host = siteUrl();
  return <PublishedCatalogBoundary>
    <JsonLd data={[
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: host },
        { "@type": "ListItem", position: 2, name: "How We Verify Our Data", item: `${host}/how-we-verify` },
      ] },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ]} />
    <LegalPageLayout crumb="How we verify" title="How we verify our data" lastUpdated="3 October 2026" sections={sections}>
      <div className="information-reading">
        <p>Use Unnati Vidya to explore your options, then check the source information before deciding. This page explains our review process and its current limits.</p>
        <section aria-labelledby="verification-status">
          <h2 id="verification-status" tabIndex={-1}>Where the review stands</h2>
          <div className="verification-status-note">
            <p><strong>Catalog verification is ongoing.</strong> Review work covers Manipal University Jaipur, Sikkim Manipal University and Amity Online.</p>
            <p>Source checks and proposed corrections have been prepared, but field-level verification and publication review are not complete. Current recognition, intake dates, additional charges and international/NRI fee details still need confirmation where evidence is incomplete.</p>
          </div>
          <p>Do not interpret a listing, badge or last-updated date as confirmation that every detail is verified.</p>
        </section>
        <section aria-labelledby="verification-checks">
          <h2 id="verification-checks" tabIndex={-1}>What we check</h2>
          <p>These are the standards for reviewing a claim, not a declaration that every check has passed for every program.</p>
          <div className="verification-checks">
            {checks.map(check => <section key={check.title}><h3>{check.title}</h3><p>{check.copy}</p></section>)}
          </div>
        </section>
        <section aria-labelledby="interpreting-claims">
          <h2 id="interpreting-claims" tabIndex={-1}>Dates, ratings and outcomes</h2>
          <p>Read each page’s source notes and check which program, fee category and admission cycle they cover. A page update can be a wording or layout change; it does not automatically mean every statement was reverified.</p>
          <p>Existing ratings, reviews, salary and placement figures remain visible while source and methodology checks are pending. Treat them as unverified claims, not independently audited results or a promise of your own outcome.</p>
          <p>Use our <Link href="/online-degree-guides">degree guides</Link> to prepare questions, and confirm requirements and charges with the university before submitting documents or paying.</p>
        </section>
        <section aria-labelledby="report-correction">
          <h2 id="report-correction" tabIndex={-1}>Report a correction</h2>
          <p>Email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a> with:</p>
          <ul><li>The Unnati Vidya page link.</li><li>The detail you believe is incorrect.</li><li>A relevant official source, if available.</li></ul>
          <p>Please leave out personal application documents. Reports require review before publication; we do not promise a correction before the evidence has been assessed.</p>
          <p>Learn about the <Link href="/authors/content-team">Content Team, Unnati Vidya</Link> shared editorial byline.</p>
        </section>
        <section aria-labelledby="verification-faq">
          <h2 id="verification-faq" tabIndex={-1}>Common questions</h2>
          <div className="faq-list">{faqs.map(([question, answer]) => <details className="faq-item" name="verify-faq" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </section>
      </div>
    </LegalPageLayout>
  </PublishedCatalogBoundary>;
}
