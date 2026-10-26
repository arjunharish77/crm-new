export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/lib/catalog-format";
import { universityMedia } from "@/data/media";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Online Universities",
  description: "Explore universities and their listed online degrees, tuition, eligibility and course options on Unnati Vidya.",
  alternates: { canonical: "/universities" },
});

function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}

// Universities listing (design Universities.dc.html; spec C §1) with the owner decisions in
// docs/UI_REDESIGN_PLAN_2026-10.md §5/§10: neutral institution-level approval tags, placement and
// package labelled university-wide, no rating badge on the image and no best-value highlighting.
export default async function UniversitiesPage() {
  const catalog = await getPublishedCatalog();
  const { courses, universities } = catalog;
  const order = ["muj", "smu", "amity"];
  const rows = [...universities].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((university) => {
    const universityCourses = courses.filter((course) => course.universityId === university.id);
    const fees = universityCourses.map((course) => course.fee).filter((fee) => Number.isFinite(fee) && fee > 0);
    const lowest = fees.length ? universityCourses.find((course) => course.fee === Math.min(...fees)) : undefined;
    const levels = [...new Set(universityCourses.map((course) => course.level))];
    return { university, universityCourses, lowest, levels, media: universityMedia[university.id] };
  });

  // FAQ answers are computed from the published catalog, so they stay true when it changes.
  const cheapest = rows.map((row) => row.lowest ? { course: row.lowest, university: row.university } : null)
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.course.fee - b.course.fee)[0];
  const wesUniversities = universities.filter((university) => university.approvals.some((approval) => approval.toUpperCase().includes("WES")));
  const faqs: Array<[string, string]> = [
    ["Are all programs from these universities UGC-entitled?", "Recognition is checked per program, not per university. Each course page shows that program's 2026-27 UGC-DEB result, links to the official list and shows when we last checked it. Confirm the current admission cycle before you enrol."],
    ...(cheapest ? [[
      "Which university has the lowest listed tuition?",
      `Among the programs we list, the lowest listed total tuition is ${formatFee(cheapest.course.fee)} for the ${cheapest.course.name} at ${cheapest.university.name}. Tuition differs by program and applicant category, so compare the specific programs you are considering.`,
    ] as [string, string]] : []),
    ...(wesUniversities.length ? [[
      "Are these degrees recognised abroad?",
      `${listNames(wesUniversities.map((university) => university.shortName))} list${wesUniversities.length === 1 ? "s" : ""} WES recognition at university level. Confirm the requirement with the receiving country, institution or employer before relying on it.`,
    ] as [string, string]] : []),
    ["Can I switch universities after enrolling?", "Transfers depend on each university's own rules. Confirm them with the university before you apply."],
  ];
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <div className="uvu-page">
      <JsonLd data={faqJsonLd} />
      <section className="uv-page-hero">
        <div className="uv-page-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><span aria-current="page">Universities</span></li>
            </ol>
          </nav>
          <h1 className="uv-h1">Universities we cover</h1>
          <p className="uvu-hero-sub">
            {universities.length} universities with online degree options. Compare their courses, listed total tuition and entry requirements, then check each program&apos;s recognition on its course page.
          </p>
          <p className="uvu-hero-note">Fees below are listed total tuition in INR. Confirm the current admission session and applicant category on the course page. <Link href="/how-we-verify" className="uv-link">How we verify information</Link></p>
        </div>
      </section>

      <div className="uv-shell">
        <div className="uvu-list">
          {rows.map(({ university, universityCourses, lowest, levels, media }) => (
            <article className="uvu-card" key={university.id} aria-labelledby={`university-${university.id}`}>
              <div className="uvu-card-media">
                {media ? <Image src={media.src} alt={media.alt} fill sizes="(max-width: 720px) 100vw, 50vw" /> : null}
              </div>
              <div className="uvu-card-body">
                <div className="uvu-card-id">
                  {media ? <span className="uvu-logo-tile"><Image src={media.logo} alt="" width={40} height={40} /></span> : null}
                  <div>
                    <h2 id={`university-${university.id}`} className="uvu-card-title">
                      <Link href={`/universities/${university.slug}`} className="university-details-link">{university.name}</Link>
                    </h2>
                    <p className="uvu-card-meta">
                      {university.city} · est. {university.established} · <span className="uvu-rating"><span aria-hidden="true">★</span> {university.rating}<span className="sr-only"> out of 5</span></span> <span className="uvu-reviews">({university.reviews.toLocaleString("en-IN")} reviews)</span>
                    </p>
                  </div>
                </div>
                <p className="uvu-card-about">{university.about}</p>
                <div className="uvu-card-tags">
                  <span className="uvu-tags-label">University-level</span>
                  <ul aria-label={`${university.shortName} university-level approvals and memberships`}>
                    {university.approvals.map((approval) => <li key={approval} className="uv-tag uv-tag-neutral">{approval}</li>)}
                  </ul>
                </div>
                <dl className="uvu-card-stats">
                  <div><dt>Online programs</dt><dd>{universityCourses.length}</dd></div>
                  <div><dt>Listed total tuition from (Indian applicants)</dt><dd>{lowest ? formatFee(lowest.fee) : "Confirm with university"}</dd></div>
                  <div><dt>Placement assistance, university-wide</dt><dd>{university.placement}%</dd></div>
                  <div><dt>Average package, university-wide</dt><dd>{university.avgPackage}</dd></div>
                </dl>
                <p className="uvu-card-levels">{levels.map((level) => level === "UG" ? "Undergraduate" : "Postgraduate").join(" · ") || "Courses coming soon"}</p>
                <div className="uvu-card-actions">
                  <Link href={`/universities/${university.slug}#sec-programs`} className="btn primary">View {university.shortName} programs</Link>
                  <Link href={`/courses?university=${university.id}`} className="btn secondary">Browse all {universityCourses.length} courses</Link>
                  <Link href={`/lead?university=${university.id}`} rel="nofollow" className="btn ghost" data-open-lead>Apply now</Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="uv-section uv-reveal" aria-labelledby="glance-title">
          <h2 id="glance-title" className="uv-h2 is-inner">Universities at a glance</h2>
          <p className="uvu-glance-sub">Listed figures side by side. Placement and package figures are university-wide claims that are still being reviewed, not results for online learners.</p>
          <div className="uv-table-region uvu-glance" role="region" aria-labelledby="glance-title" tabIndex={0}>
            <table className="uv-table">
              <caption className="sr-only">Universities at a glance: established year, location, programs, listed tuition, university-wide placement figures and approvals</caption>
              <thead>
                <tr>
                  <td />
                  {rows.map(({ university, media }) => <th scope="col" key={university.id}>
                    <span className="uvu-glance-head">{media ? <Image src={media.logo} alt="" width={24} height={24} /> : null}{university.shortName}</span>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Established</th>{rows.map(({ university }) => <td key={university.id}>{university.established}</td>)}</tr>
                <tr><th scope="row">Location</th>{rows.map(({ university }) => <td key={university.id}>{university.city}</td>)}</tr>
                <tr><th scope="row">Online programs</th>{rows.map(({ university, universityCourses }) => <td key={university.id}>{universityCourses.length}</td>)}</tr>
                <tr><th scope="row">Listed total tuition from (Indian applicants)</th>{rows.map(({ university, lowest }) => <td key={university.id}>{lowest ? formatFee(lowest.fee) : "Confirm with university"}</td>)}</tr>
                <tr><th scope="row">Placement assistance (university-wide)</th>{rows.map(({ university }) => <td key={university.id}>{university.placement}%</td>)}</tr>
                <tr><th scope="row">Average package (university-wide)</th>{rows.map(({ university }) => <td key={university.id}>{university.avgPackage}</td>)}</tr>
                <tr><th scope="row">University-level approvals</th>{rows.map(({ university }) => <td key={university.id}>{university.approvals.join(", ")}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="uvu-scroll-cue" aria-hidden="true">Scroll sideways to see every university →</p>
        </section>

        <div className="uv-section uv-reveal">
          <FaqAccordion items={faqs} name="universities-faq" id="universities-faq" subtitle="About the universities we list." />
        </div>

        <section className="uv-section uv-reveal" aria-labelledby="decide-title">
          <div className="uvu-navy-strip">
            <div>
              <h2 id="decide-title">Can&apos;t decide between universities?</h2>
              <p>Compare course details side by side, or answer a few questions to explore options that match your preferences.</p>
            </div>
            <div className="uvu-navy-actions">
              <Link href="/compare" className="btn on-navy">Compare now <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="/recommender" className="btn outline-on-navy">Find my course</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
