export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import type { ReactNode } from "react";
import { BadgeCheck, Banknote, ClipboardCheck, ExternalLink, ListChecks, Mail, TriangleAlert } from "lucide-react";
import { siteUrl } from "@/lib/seo-config";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "How We Verify Our Data",
  description: "Understand Unnati Vidya’s source checks, ongoing catalog review, editorial approval process and how to report a correction.",
  alternates: { canonical: "/how-we-verify" },
});
// "Our process" tiles (HowWeVerify.dc.html) carry the existing, honest review standards. They describe how a
// claim is reviewed, not a declaration that every check has passed (UI redesign D §7).
const checks = [
  { icon: Banknote, step: "01", title: "Fees and fee categories", copy: "Use official university program and fee pages. Identify the currency, total or instalment amount, additional charges and the applicable domestic, international or NRI category. Record uncertainty when the source does not make a charge clear." },
  { icon: ListChecks, step: "02", title: "Eligibility and curriculum", copy: "Check the program’s admission requirements and published curriculum. Keep conflicting requirements visible for review rather than combining them into a single unsupported rule." },
  { icon: BadgeCheck, step: "03", title: "Recognition and intake", copy: "Look for evidence for the specific program, mode and academic session. A general university badge or evidence from an earlier session is not enough for us to mark a current program claim verified." },
  { icon: ClipboardCheck, step: "04", title: "Review before publication", copy: "Prepare proposed corrections for administrator review. A source check or saved draft does not by itself change the published catalog. Reviewers must assess the evidence before applying a correction." },
];
const faqs = [
  ["Has every catalog detail been verified?", "No. Field-level review across the listed universities is ongoing. Prepared corrections and source checks do not mean that all current fees, recognition, intake or other details have been confirmed or published."],
  ["Does an updated date mean all the information is current?", "No. A publication or update date describes that page. It is not proof that every fee, eligibility rule or recognition claim was checked for the latest admission cycle. Read the source notes and confirm time-sensitive details with the university."],
  ["Are ratings and placement figures independently verified?", "They should not be treated as independently verified. Existing ratings, reviews, salary and placement figures remain visible while their source and methodology review is pending. They do not guarantee an individual learner’s outcome."],
  ["How are conflicting university details handled?", "Conflicting source details need review. A prepared correction should explain the conflict rather than present an unresolved requirement as settled. Confirm the applicable requirement directly with the university before applying."],
  ["How can I report a possible error?", "Email admin@unnatividya.com with the page link, the detail you believe is incorrect and a relevant official source if available. Please do not include personal application documents. A report requires review before a correction is published."],
];

// The three status labels the site renders (UI redesign Q13), in the shared tag styles.
const labels = [
  { label: "Source verified", tone: "uv-tag-success", copy: "This detail was checked against the official university source shown beside it, for the session named there." },
  { label: "Confirm with the university", tone: "uv-tag-warning", copy: "We don't have program-specific evidence for this detail yet, or it varies by case or session. Check it with the university before you apply." },
  { label: "Being re-checked", tone: "uv-verify-tag-recheck", copy: "We're reviewing this detail for the current academic session. Treat what's shown as unconfirmed until the review is complete." },
];
const sources = [
  { label: "onlinemanipal.com", note: "MUJ and SMU program pages", href: "https://www.onlinemanipal.com/all-courses" },
  { label: "amityonline.com", note: "Amity Online program pages", href: "https://amityonline.com" },
  { label: "UGC-DEB entitlement list", note: "Program recognition by session", href: "https://deb.ugc.ac.in" },
  { label: "NIRF rankings", note: "Institution rankings, Ministry of Education", href: "https://www.nirfindia.org/Rankings/2025/UniversityRanking.html" },
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
    <div className="uv-verify">
      <section className="uv-page-hero" aria-labelledby="verify-title">
        <div className="uv-page-hero-inner uv-company-hero">
          <nav aria-label="Breadcrumb"><ol className="uv-breadcrumb"><li><Link href="/">Home</Link></li><li aria-current="page">How we verify our data</li></ol></nav>
          <h1 id="verify-title" className="uv-h1 uv-verify-title">How we verify our data</h1>
          <p className="uv-lede">Use Unnati Vidya to explore your options, then check the source information before deciding. This page explains our review process and its current limits.</p>
        </div>
      </section>

      <div className="uv-shell uv-verify-main">
        <section className="uv-verify-status" aria-labelledby="verification-status">
          <TriangleAlert size={22} aria-hidden="true" />
          <div>
            <h2 id="verification-status" tabIndex={-1}>Where the review stands</h2>
            <p><strong>Catalog verification is ongoing.</strong> Review work covers Manipal University Jaipur, Sikkim Manipal University and Amity Online.</p>
            <p>Source checks and proposed corrections have been prepared, but field-level verification and publication review are not complete. Current recognition, intake dates, additional charges and international/NRI fee details still need confirmation where evidence is incomplete.</p>
            <p>Do not interpret a listing, badge or last-updated date as confirmation that every detail is verified.</p>
          </div>
        </section>

        <section aria-labelledby="verification-checks">
          <h2 id="verification-checks" tabIndex={-1} className="uv-verify-h2">Our process</h2>
          <p className="uv-verify-sub">These are the standards for reviewing a claim, not a declaration that every check has passed for every program.</p>
          <ol className="uv-verify-steps">
            {checks.map(({ icon: Icon, step, title, copy }) => <li key={title}>
              <Icon size={28} aria-hidden="true" />
              <h3><span aria-hidden="true">{step}</span>{title}</h3>
              <p>{copy}</p>
            </li>)}
          </ol>
        </section>

        <section aria-labelledby="verification-labels">
          <h2 id="verification-labels" tabIndex={-1} className="uv-verify-h2">What the labels mean</h2>
          <div className="uv-table-region uv-verify-labels" role="region" aria-labelledby="verification-labels" tabIndex={0}>
            <table className="uv-table">
              <caption className="sr-only">Status labels used on course and university pages</caption>
              <thead><tr><th scope="col">Label</th><th scope="col">What it means</th></tr></thead>
              <tbody>
                {labels.map(item => <tr key={item.label}>
                  <th scope="row"><span className={`uv-tag uv-tag-strong ${item.tone}`}>{item.label}</span></th>
                  <td>{item.copy}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="uv-verify-note">Each label appears only where the record has that status.</p>
        </section>

        <section className="uv-company-prose" aria-labelledby="interpreting-claims">
          <h2 id="interpreting-claims" tabIndex={-1}>Dates, ratings and outcomes</h2>
          <p>Read each page’s source notes and check which program, fee category and admission cycle they cover. A page update can be a wording or layout change; it does not automatically mean every statement was reverified.</p>
          <p>Existing ratings, reviews, salary and placement figures remain visible while source and methodology checks are pending. Treat them as unverified claims, not independently audited results or a promise of your own outcome.</p>
          <p>Use our <Link href="/online-degree-guides">degree guides</Link> to prepare questions, and confirm requirements and charges with the university before submitting documents or paying.</p>
        </section>

        <section aria-labelledby="verification-sources">
          <h2 id="verification-sources" tabIndex={-1} className="uv-verify-h2">Sources we use</h2>
          <ul className="uv-verify-sources">
            {sources.map(source => <li key={source.href}>
              <a href={source.href} target="_blank" rel="noopener noreferrer">
                <span><strong>{source.label}</strong><small>{source.note}</small></span>
                <ExternalLink size={18} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>)}
          </ul>
        </section>

        <section className="uv-verify-report" aria-labelledby="report-correction">
          <div>
            <h2 id="report-correction" tabIndex={-1}>Spotted something out of date?</h2>
            <p>Email <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a> with:</p>
            <ul><li>The Unnati Vidya page link.</li><li>The detail you believe is incorrect.</li><li>A relevant official source, if available.</li></ul>
            <p>Please leave out personal application documents. Reports require review before publication; we do not promise a correction before the evidence has been assessed.</p>
          </div>
          <a className="btn primary large" href="mailto:admin@unnatividya.com?subject=Correction%20report"><Mail size={18} aria-hidden="true" />Report an error</a>
        </section>

        <FaqAccordion name="verify-faq" id="verification-faq" title="Common questions" subtitle={null} items={faqs.map(([question, answer]): [string, ReactNode] => [question, <p key={question}>{answer}</p>])} />

        <p className="uv-verify-byline">Learn about the <Link href="/authors/content-team" className="uv-link">Content Team, Unnati Vidya</Link> shared editorial byline. <span className="uv-company-updated">Last updated 3 October 2026 · Unnati Vidya</span></p>
      </div>
    </div>
  </PublishedCatalogBoundary>;
}
