export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ApprovalBadge } from "@/components/approval-badge";

import { formatFee } from "@/lib/catalog-format";
import { universityMedia } from "@/data/media";

export const metadata: Metadata = {
  title: "Online Universities",
  description: "Explore universities and their listed online degrees, tuition, eligibility and course options on Unnati Vidya.",
  alternates: { canonical: "/universities" },
};

export default async function UniversitiesPage() {
  const catalog = await getPublishedCatalog();
  const { courses, universities } = catalog;
  return <PublishedCatalogBoundary>{(
    <>
      <section className="page-kicker">
        <div className="container page-kicker-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link> &gt; Universities
          </div>
          <h1>Universities we cover</h1>
          <p className="page-subtitle">
            {universities.length} universities with online degree options. Explore their courses, tuition and entry requirements before choosing.
          </p>
        </div>
      </section>

      <section className="section alt" style={{ paddingTop: 28 }}>
        <div className="container">
          <p className="university-list-guidance">Fees below are listed total tuition in INR. Confirm the current admission session and applicant category on the course page. <Link href="/how-we-verify">How we verify information</Link></p>
          <div className="uni-list">
            {universities.map((university) => {
              const universityCourses = courses.filter((course) => course.universityId === university.id);
              const media = universityMedia[university.id];
              const fees = universityCourses.map(course => course.fee).filter(fee => Number.isFinite(fee) && fee > 0);
              const levels = [...new Set(universityCourses.map(course => course.level))];

              return (
                <article className="card uni-row university-discovery-card" key={university.id} aria-labelledby={`university-${university.id}`}>
                  <div className="uni-row-media" style={{ position: "relative" }}>
                    <Image
                      src={media.src}
                      alt={media.alt}
                      width={360}
                      height={220}
                      sizes="(max-width: 640px) 90vw, 220px"
                    />
                  </div>
                  <div>
                    <h2 id={`university-${university.id}`}><Link href={`/universities/${university.slug}`} className="uni-row-title">
                      {university.name}
                    </Link></h2>
                    <div className="university-card-city">
                      {university.city} · Established {university.established}
                    </div>
                    <p style={{ fontSize: 13, color: "#555", lineHeight: 1.55, maxWidth: 460, margin: "8px 0 0" }}>{university.about}</p>
                    <div className="trust-strip compact">
                      {university.approvals.slice(0, 3).map((approval) => (
                        <ApprovalBadge
                          label={approval}
                          style={{ fontSize: 11, fontWeight: 700, color: "#363634", background: "#F5F5F5", borderRadius: 999, whiteSpace: "normal", padding: "3px 9px" }}
                          key={approval}
                        />
                      ))}
                    </div>
                    <dl className="university-course-facts">
                      <div><dt>Online programs</dt><dd>{universityCourses.length}</dd></div>
                      <div><dt>Listed total tuition from</dt><dd>{fees.length ? formatFee(Math.min(...fees)) : "Confirm with university"}</dd></div>
                      <div><dt>Degree levels</dt><dd>{levels.map(level => level === "UG" ? "Undergraduate" : "Postgraduate").join(" · ") || "Courses coming soon"}</dd></div>
                    </dl>
                    <details className="university-additional-facts">
                      <summary>Ratings and placement figures</summary>
                      <div className="uni-metrics">
                        <span>Rating <b>{university.rating} / 5</b> ({university.reviews.toLocaleString("en-IN")} reviews)</span>
                        <span>Placement rate <b>{university.placement}%</b></span>
                        <span>Average package <b>{university.avgPackage}</b></span>
                      </div>
                    </details>
                  </div>
                  <div className="university-discovery-actions">
                    <div className="uni-actions">
                      <Link href={`/courses?university=${university.id}`} className="btn primary">Browse {universityCourses.length} courses</Link>
                      <Link href={`/lead?university=${university.id}`} className="btn secondary" data-open-lead>Apply now</Link>
                    </div>
                    <Link href={`/universities/${university.slug}`} className="university-details-link">
                      University details →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="dark-decision-card">
            <div>
              <h2>Can&apos;t decide between universities?</h2>
              <p>Compare course details side by side, or answer a few questions to explore options that match your preferences.</p>
            </div>
            <div>
              <Link href="/compare" className="btn primary">Compare now</Link>
              <Link href="/recommender" className="btn dark-outline">Find my course</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )}</PublishedCatalogBoundary>;
}
