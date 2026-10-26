export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { DOCUMENT_SOURCES, documentsFor } from "@/data/admission-documents";
import { EXAM_SOURCES, EXAM_UNIVERSITIES } from "@/data/exam-requirements";
import { feeGuides } from "@/lib/fee-guides";
import { categoryRowFor, formatGroupAmount } from "@/lib/fee-group";
import { formatCheckedDate } from "@/lib/source-checks";
import { UGC_REGULATIONS_2020 } from "@/lib/study-modes";
import { listNames, withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
const UGC_DEB_ID_NOTICE = "https://www.ugc.gov.in/pdfnews/8295117_Public-Notice-prodedure-for-students-enrolling-in-ODL.pdf";
const CONFIRM = "Confirm with the university";

export const metadata: Metadata = withSocial({
  title: "Online Degrees for NRIs and International Students: Fees, Documents",
  description: "NRI and foreign-national fees, documents, exams from abroad and the DEB-ID rule for online degrees at MUJ, SMU and Amity Online, from official sources.",
  alternates: { canonical: "/online-degree-guides/international" },
});

// Wave 5 cluster D4 (decision V4): the NRI and international hub, read from the published catalog and
// the sourced data the tools use. Fees show only where a university's category fee is published.
export default async function InternationalHubPage() {
  return <PublishedCatalogBoundary><InternationalHub /></PublishedCatalogBoundary>;
}

async function InternationalHub() {
  const catalog = await getPublishedCatalog();
  const guides = feeGuides(catalog);
  const courses = guides.flatMap(guide => guide.courses);
  const universities = [...new Map(courses.map(course => [course.universityId, course.university])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const withInternational = courses.filter(course => categoryRowFor(course.categoryFees, "nri") || categoryRowFor(course.categoryFees, "foreign"));
  const fee = (course: (typeof courses)[number], group: "nri" | "foreign") => {
    const row = categoryRowFor(course.categoryFees, group);
    return row ? <>{formatGroupAmount(row.currency, row.total)}<small className="uv-read-cell-source">{row.category}</small></> : <span className="uv-fee-unpublished">{CONFIRM}</span>;
  };
  const docs = universities.map(university => ({
    university,
    nri: documentsFor(university.id, "PG", "nri"),
    foreign: documentsFor(university.id, "PG", "foreign"),
  }));
  const exams = EXAM_UNIVERSITIES.filter(item => universities.some(university => university.id === item.id));

  const faqs: Array<[string, string]> = [
    ["Can NRIs and foreign nationals study these online degrees?", "Yes, the universities list fees and documents for applicants outside India. Requirements differ by university and by whether you are an NRI or a foreign national, so check the program's fee, eligibility and documents for your category before you apply."],
    ["Do I pay in US dollars?", "MUJ and SMU publish their NRI and international fees in US dollars. We show every fee in the university's own currency without converting it. Where none is published here, confirm the fee with the university."],
    ["Do I need a DEB-ID?", "UGC's notice of 19 August 2024 requires a DEB-ID for every student enrolling in an online or distance program, except foreign learners, for whom the mechanism was yet to be implemented. NRIs should ask the university which applies to them."],
    ["Can I take the exams from outside India?", "UGC's 2020 regulations say the territorial restriction does not apply to online learning, and institutions recognised to enrol international learners should endeavour to hold proctored exams for them. Check the exam arrangements for your country with the university."],
    ["Will my qualification from outside India be accepted?", "The universities' sources ask for an AIU equivalence certificate for a qualification from outside India where it applies. Check what the Association of Indian Universities requires for your qualification."],
  ];
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: "NRIs and international learners", item: `${SITE_URL}/online-degree-guides/international` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];

  return <>
    <JsonLd data={schema} />
    <article className="uv-read uv-read-guide">
      <ReadingHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: "NRIs and international learners" }]}
        tag="International"
        title="Online degrees for NRIs and international learners"
        deck={`Fees, documents, exams and the DEB-ID rule for the online programs we list at ${listNames(universities.map(university => university.shortName))}, from official sources. Confirm the current terms for your category with the university.`}
        meta={<Byline />}
      />
      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="Page sections" items={[
          { href: "#intl-fees", label: "Fees for NRI and foreign applicants" },
          { href: "#intl-documents", label: "Documents" },
          { href: "#intl-exams", label: "Exams from outside India" },
          { href: "#intl-deb", label: "The DEB-ID" },
          { href: "#guide-faq", label: "Frequently asked questions" },
          { href: "#intl-related", label: "Tools and guides" },
        ]} />

        <section className="uv-read-section" id="intl-fees" tabIndex={-1} aria-labelledby="intl-fees-title">
          <h2 id="intl-fees-title" className="uv-read-h2">Fees for NRI and foreign applicants</h2>
          <div className="uv-read-prose"><p>{withInternational.length
            ? `${withInternational.length} of the ${courses.length} programs have a published fee for applicants outside India. They are shown in the university's own currency and never converted. For the rest, confirm the fee with the university.`
            : `None of the ${courses.length} programs has a published fee for applicants outside India yet. Confirm the fee for your category with the university.`}</p></div>
          {guides.map(guide => <section key={guide.key} id={`intl-${guide.key}`} tabIndex={-1} className="uv-fees-degree" aria-labelledby={`intl-${guide.key}-title`}>
            <h3 id={`intl-${guide.key}-title`}>{guide.label}</h3>
            <div className="uv-read-table" role="region" aria-label={`${guide.label} fees outside India`} tabIndex={0}>
              <table className="is-compact">
                <caption className="sr-only">{guide.label}: published total tuition for NRI and foreign applicants, by university</caption>
                <thead><tr><th scope="col">University</th><th scope="col">NRI applicants</th><th scope="col">Foreign nationals</th></tr></thead>
                <tbody>{guide.courses.map(course => <tr key={course.id}>
                  <th scope="row"><Link href={`/courses/${course.slug}#sec-fees`} className="uv-read-table-link">{course.university.shortName}<span className="sr-only">: {course.name}</span></Link>
                    {course.categoryFees && (categoryRowFor(course.categoryFees, "nri") || categoryRowFor(course.categoryFees, "foreign")) ? <span className="uv-read-cell-source">Checked {formatCheckedDate(course.categoryFees.checkedAt)}</span> : null}</th>
                  <td>{fee(course, "nri")}</td>
                  <td>{fee(course, "foreign")}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>)}
        </section>

        <section className="uv-read-section" id="intl-documents" tabIndex={-1} aria-labelledby="intl-documents-title">
          <h2 id="intl-documents-title" className="uv-read-h2">Documents</h2>
          <div className="uv-read-prose"><p>The universities&apos; lists add items such as a passport and, for a qualification from outside India, an equivalence certificate. Here is what each university&apos;s official pages ask for beyond the Indian-applicant list (master&apos;s programs shown; the checklist covers bachelor&apos;s too).</p></div>
          <ul className="uv-read-cards">
            {docs.map(({ university, nri, foreign }) => {
              const extra = (list: ReturnType<typeof documentsFor>) => list ? list.required.concat(list.conditional).filter(item => item.categories && !item.categories.includes("indian")).map(item => item.label) : [];
              const nriExtra = extra(nri), foreignExtra = extra(foreign);
              return <li key={university.id} className="uv-read-card">
                <h3>{university.name}</h3>
                <p><strong>NRI applicants:</strong> {nriExtra.length ? nriExtra.join("; ") : nri?.categoryNote || "No separate items listed."}</p>
                <p><strong>Foreign nationals:</strong> {foreignExtra.length ? foreignExtra.join("; ") : foreign?.categoryNote || "No separate items listed."}</p>
                <p className="uv-read-card-muted"><Link href={`/tools/document-checklist?category=nri`}>NRI checklist</Link> · <Link href={`/tools/document-checklist?category=foreign`}>Foreign-national checklist</Link></p>
              </li>;
            })}
          </ul>
          <p className="uv-read-caption">Sources: {Object.values(DOCUMENT_SOURCES).map(source => source.label).join("; ")}. Checked {formatCheckedDate(Object.values(DOCUMENT_SOURCES)[0].checkedAt)}.</p>
        </section>

        <section className="uv-read-section" id="intl-exams" tabIndex={-1} aria-labelledby="intl-exams-title">
          <h2 id="intl-exams-title" className="uv-read-h2">Exams from outside India</h2>
          <div className="uv-read-prose">
            <p>UGC&apos;s 2020 regulations say the territorial restriction does not apply to online learning, and that institutions recognised to enrol international learners shall endeavour to hold proctored exams for them (regulation 15(C)(2)). How each university holds its online exams:</p>
            <ul>{exams.map(item => <li key={item.id}><strong>{item.name}:</strong> {item.howHeld[0]}</li>)}</ul>
          </div>
          <p className="uv-read-caption">Sources: <a href={UGC_REGULATIONS_2020.url} target="_blank" rel="noopener noreferrer">UGC 2020 regulations<ExternalLink size={12} aria-hidden="true" /></a>; {[...new Set(exams.map(item => item.source))].map(id => EXAM_SOURCES[id].label).join("; ")}. <Link href="/tools/exam-check">Check your computer for online exams</Link>.</p>
        </section>

        <section className="uv-read-section" id="intl-deb" tabIndex={-1} aria-labelledby="intl-deb-title">
          <h2 id="intl-deb-title" className="uv-read-h2">The DEB-ID</h2>
          <div className="uv-read-prose"><p>UGC&apos;s public notice of 19 August 2024 requires a DEB-ID for every student enrolling in an online or distance program from 2024-25, except foreign learners, for whom it said the mechanism was yet to be implemented. The DEB-ID is created with an Academic Bank of Credits (ABC) ID. NRIs should ask the university which rule applies to them.</p></div>
          <p className="uv-read-caption">Source: <a href={UGC_DEB_ID_NOTICE} target="_blank" rel="noopener noreferrer">UGC public notice, 19 August 2024<ExternalLink size={12} aria-hidden="true" /></a></p>
        </section>

        <div className="uv-read-section"><FaqAccordion id="guide-faq" name="international-hub-faq" items={faqs} subtitle={null} /></div>

        <ReadingApplyCta title="Applying from outside India?" copy="A counsellor will confirm the fee, documents and exam arrangements for your category and country." href="/lead?intent=international-guide" note="Free service · no spam" />

        <RelatedRows id="intl-related" title="Tools and guides" items={[
          { href: "/online-degree-guides/fees", label: "Online degree fees 2026-27: all programs" },
          { href: "/tools/document-checklist?category=nri", label: "Admission document checklist" },
          { href: "/tools/exam-check", label: "Online exams and device check" },
          { href: "/blog/wes-evaluation-online-degrees", label: "WES evaluation of online degrees" },
        ]} />
      </div>
    </article>
  </>;
}
