export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { RecognitionCheck } from "@/components/recognition-check";
import { JsonLd } from "@/components/json-ld";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { recognitionSummary } from "@/lib/program-facts";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

// Wave 4 A2: the recognition check. Indexed (and listed in the sitemap) only once at least one
// program has a published 2026-27 result; until then it is noindex like the eligibility checker.
export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const hasResults = catalog.courses.some(course => Boolean(catalog.courseWithUniversity(course).recognition));
  return withSocial({ title: "Online Degree Recognition Check (UGC-DEB 2026-27)", description: "Check whether an online program at MUJ, SMU or Amity is on the UGC-DEB 2026-27 list, with the source and the date we checked it, and learn how to check it yourself.", alternates: { canonical: "/tools/recognition-check" }, robots: hasResults ? undefined : { index: false, follow: true } });
}

export default async function RecognitionCheckPage({ searchParams }: { searchParams: Promise<{ course?: string | string[] }> }) {
  const params = await searchParams;
  const initialCourseId = typeof params.course === "string" ? params.course : "";
  const catalog = await getPublishedCatalog();
  const rows = catalog.courses.map(catalog.courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name) || a.university.shortName.localeCompare(b.university.shortName));
  const host = siteUrl();
  return <PublishedCatalogBoundary><>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: host },
      { "@type": "ListItem", position: 2, name: "Recognition check", item: `${host}/tools/recognition-check` },
    ] }} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="recognition-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Recognition check</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="recognition-title" className="uv-h1">Check a program&apos;s UGC-DEB recognition</h1>
        <p className="uv-lede">Entitlement to offer an online degree is granted per program and per academic session. See what we found for each program on the 2026-27 list, with the source and the date we checked it.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page uvt-recog-page">
      <RecognitionCheck initialCourseId={initialCourseId} />

      <section className="uvt-recog-section" aria-labelledby="recognition-steps-title">
        <h2 id="recognition-steps-title" className="uv-h2 is-inner">Check it yourself</h2>
        <ol className="uvt-recog-steps">
          <li><strong>Open the official list.</strong> On the UGC-DEB website (<a href="https://deb.ugc.ac.in/" target="_blank" rel="noopener noreferrer" className="uv-link">deb.ugc.ac.in<span className="sr-only"> (opens in a new tab)</span></a>), find the list of institutions entitled to offer online programmes for the academic session you plan to join.</li>
          <li><strong>Find the awarding university by its legal name.</strong> Brand names differ from legal names; the awarding institution is the one printed on the list and on your degree.</li>
          <li><strong>Check the exact programme.</strong> The programme name must appear under that university for that session. Specialisations are not always listed separately.</li>
          <li><strong>Keep a dated copy.</strong> Save the list or a screenshot with the date, and confirm with the university before you pay any fee.</li>
        </ol>
        <p className="uvt-help-text">Institution-level badges such as NAAC or NIRF describe the university, not whether a specific online programme is entitled. <Link href="/how-we-verify" className="uv-link">How we verify information</Link></p>
      </section>

      <section className="uvt-recog-section" aria-labelledby="recognition-table-title">
        <h2 id="recognition-table-title" className="uv-h2 is-inner">All programs at a glance</h2>
        <p className="uvt-help-text">Published results only. A program marked &ldquo;being re-checked&rdquo; has no published 2026-27 result yet.</p>
        <div className="uv-table-region" role="region" aria-labelledby="recognition-table-title" tabIndex={0}>
          <table className="uv-table uvt-recog-table">
            <caption className="sr-only">UGC-DEB 2026-27 status by program</caption>
            <thead><tr><th scope="col">Program</th><th scope="col">University</th><th scope="col">2026-27 status</th></tr></thead>
            <tbody>{rows.map(course => {
              const summary = recognitionSummary(course);
              const status = !summary.recognition ? "Being re-checked" : summary.recognition.status === "listed" ? "Listed" : "Confirm the awarding university";
              return <tr key={course.id}>
                <th scope="row"><Link href={`/tools/recognition-check?course=${encodeURIComponent(course.id)}`} className="uv-link">{course.name}</Link></th>
                <td>{course.university.shortName}</td>
                <td><span className={`uv-tag ${!summary.recognition ? "uv-tag-neutral" : summary.recognition.status === "listed" ? "uv-tag-success" : "uv-tag-warning"}`}>{status}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  </></PublishedCatalogBoundary>;
}
