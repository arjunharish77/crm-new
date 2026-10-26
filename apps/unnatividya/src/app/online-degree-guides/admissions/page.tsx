export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { allEligibilityGuides } from "@/data/guide-content";
import { DOCUMENT_SOURCES } from "@/data/admission-documents";
import { programApplicationFee } from "@/lib/program-facts";
import { courseKey } from "@/lib/programmatic-seo";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";
import { listNames, withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
const UGC_DEB_ID_NOTICE = "https://www.ugc.gov.in/pdfnews/8295117_Public-Notice-prodedure-for-students-enrolling-in-ODL.pdf";

export const metadata: Metadata = withSocial({
  title: "How to Apply for an Online Degree: MUJ, SMU and Amity",
  description: "Eligibility, documents and each university's admission steps for online degrees at Manipal University Jaipur, Sikkim Manipal University and Amity Online, in the order to do them.",
  alternates: { canonical: "/online-degree-guides/admissions" },
});

// Wave 4 hub C3 (decisions W8–W10): preparation steps, eligibility guides by degree, the document
// sources and each university's own admission steps, read from the published catalog. No intake
// dates (W9): the official pages only show rolling promotional deadlines.
export default async function AdmissionsHubPage() {
  return <PublishedCatalogBoundary><AdmissionsHub /></PublishedCatalogBoundary>;
}

async function AdmissionsHub() {
  const catalog = await getPublishedCatalog();
  const universities = [...catalog.universities].sort((a, b) => a.name.localeCompare(b.name));
  const applicationFee = (universityId: string) => {
    const values = [...new Set(catalog.courses.filter(course => course.universityId === universityId).map(course => programApplicationFee(catalog.courseWithUniversity(course))))];
    return values.length === 1 ? values[0] : "varies by program";
  };
  const offered = (key: string) => [...new Set(catalog.courses.filter(course => courseKey(course.name) === key).map(course => catalog.universityById[course.universityId]?.shortName).filter(Boolean))] as string[];
  const guides = allEligibilityGuides().filter(guide => offered(guide.key).length);
  const documentSources = Object.values(DOCUMENT_SOURCES);

  const faqs: Array<[string, string]> = [
    ["When do admissions close?", "Universities admit in batches, and the deadlines on their pages change often, so we don't list dates. Check the current deadline on the university's page, or ask a counsellor, before you plan around it."],
    ["Does applying guarantee admission?", "No. Each university checks your documents and eligibility and then confirms admission. Use the eligibility checker before you apply to see what may need confirming."],
    ["Can NRI and international applicants apply?", "Yes. Requirements and fees can differ by applicant category, and a qualification from outside India may need an equivalence certificate. The document checklist covers Indian, NRI and foreign applicants, and says where a university's source does not list separate documents."],
    ["What is the DEB-ID?", "A unique ID that UGC requires before admission to an online or distance program. You create it on the UGC-DEB portal using your Academic Bank of Credits (ABC) ID. UGC's notice of 19 August 2024 made it a requirement for Indian learners from 2024-25."],
  ];
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: "How to apply", item: `${SITE_URL}/online-degree-guides/admissions` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];

  return <>
    <JsonLd data={schema} />
    <article className="uv-read uv-read-guide uv-adm-hub">
      <ReadingHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: "How to apply" }]}
        tag="Admissions"
        title={`How to apply for an online degree at ${listNames(universities.map(university => university.shortName))}`}
        deck="Eligibility, documents and each university's own admission steps, in the order to do them. Confirm current requirements with the university before you apply."
        meta={<Byline />}
      />
      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="Page sections" items={[
          { href: "#adm-order", label: "The order to follow" },
          { href: "#adm-eligibility", label: "Eligibility by degree" },
          { href: "#adm-documents", label: "Documents" },
          { href: "#adm-steps", label: "Admission steps by university" },
          { href: "#guide-faq", label: "Frequently asked questions" },
          { href: "#adm-related", label: "Tools and guides" },
        ]} />

        <section className="uv-read-section" id="adm-order" tabIndex={-1} aria-labelledby="adm-order-title">
          <h2 id="adm-order-title" className="uv-read-h2">The order to follow</h2>
          <ol className="uv-adm-order">
            <li><strong>Check you are eligible.</strong> <span>Compare your degree and marks with the program&apos;s requirement for your applicant category. <Link href="/tools/eligibility-checker">Use the eligibility checker</Link>.</span></li>
            <li><strong>Check the program is listed for your session.</strong> <span>Entitlement is per program and per session. <Link href="/tools/recognition-check">Use the recognition check</Link>.</span></li>
            <li><strong>Create your ABC ID and DEB-ID.</strong> <span>Indian learners need a DEB-ID, created with an ABC ID, to enrol in an online program (<a href={UGC_DEB_ID_NOTICE} target="_blank" rel="noopener noreferrer">UGC public notice, 19 August 2024<span className="sr-only"> (opens in a new tab)</span></a>).</span></li>
            <li><strong>Gather your documents.</strong> <span>They differ by university and applicant category. <Link href="/tools/document-checklist">Open the document checklist</Link>.</span></li>
            <li><strong>Apply on the university&apos;s portal.</strong> <span>Follow its steps below. Application fee: {universities.map(university => `${university.shortName}: ${applicationFee(university.id).replace(/^Confirm/, "confirm")}`).join("; ")}.</span></li>
          </ol>
        </section>

        <section className="uv-read-section" id="adm-eligibility" tabIndex={-1} aria-labelledby="adm-eligibility-title">
          <h2 id="adm-eligibility-title" className="uv-read-h2">Eligibility by degree</h2>
          <div className="uv-read-prose"><p>Each guide compares the requirement at every university that offers the degree, by applicant category where the university has published it. Graduates from other streams who are considering the MCA should read its guide for the bridge-course rules.</p></div>
          <ul className="uv-adm-degrees">
            {guides.map(guide => <li key={guide.key}>
              <Link href={`/online-degree-guides/${guide.slug}`}><strong>{guide.label}</strong><span>{listNames(offered(guide.key))}</span></Link>
            </li>)}
          </ul>
        </section>

        <section className="uv-read-section" id="adm-documents" tabIndex={-1} aria-labelledby="adm-documents-title">
          <h2 id="adm-documents-title" className="uv-read-h2">Documents</h2>
          <div className="uv-read-prose"><p>The document checklist lists what each university&apos;s official pages ask for, by level and applicant category, with every item linked to its source. Where a source does not say, the checklist tells you to confirm with the university rather than guessing.</p></div>
          <div className="uv-read-compare">
            <div>
              <p className="uv-read-compare-title">Make your document list</p>
              <p className="uv-read-compare-copy">Pick your program and applicant category. Free, no sign-up.</p>
            </div>
            <Link href="/tools/document-checklist" className="btn secondary guide-cost-link">Open the document checklist</Link>
          </div>
          <ul className="uv-read-source-list uv-adm-sources" aria-label="Document checklist sources">
            {documentSources.map(source => <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
              <span className="uv-read-source-date">Checked {formatCheckedDate(source.checkedAt)}</span>
            </li>)}
          </ul>
        </section>

        <section className="uv-read-section" id="adm-steps" tabIndex={-1} aria-labelledby="adm-steps-title">
          <h2 id="adm-steps-title" className="uv-read-h2">Admission steps by university</h2>
          <ul className="uv-read-cards uv-adm-steps">
            {universities.map(university => {
              const steps = catalog.universityEnrichmentById[university.id]?.admissionSteps || [];
              return <li key={university.id} className="uv-read-card">
                <h3><Link href={`/universities/${university.slug}`}>{university.name}</Link></h3>
                {steps.length
                  ? <ol>{steps.map(step => <li key={step.title}><strong>{step.title}.</strong> {step.copy}</li>)}</ol>
                  : <p>Confirm the current admission steps with the university.</p>}
                <p className="uv-read-card-muted">Application fee: {applicationFee(university.id)}</p>
              </li>;
            })}
          </ul>
          <p className="uv-read-caption">Steps as the university describes them; the order and payment options can change by session. Sources: {universities.map(university => sourceHost(catalog.universityEnrichmentById[university.id]?.sourceUrls?.find(url => !/api-otp\./.test(url)) || "")).filter(Boolean).filter((host, index, all) => all.indexOf(host) === index).join(", ")}.</p>
        </section>

        <div className="uv-read-section"><FaqAccordion id="guide-faq" name="admissions-hub-faq" items={faqs} subtitle={null} /></div>

        <ReadingApplyCta
          title="Want help with your application?"
          copy="A counsellor will check your eligibility and documents for the program you choose."
          href="/lead?intent=admissions-guide"
          note="Free service · no spam"
        />

        <RelatedRows id="adm-related" title="Tools and guides" items={[
          { href: "/tools/eligibility-checker", label: "Eligibility checker" },
          { href: "/tools/document-checklist", label: "Admission document checklist" },
          { href: "/tools/recognition-check", label: "Recognition check" },
          { href: "/online-degree-guides/fees", label: "Online degree fees 2026-27" },
        ]} />
      </div>
    </article>
  </>;
}
