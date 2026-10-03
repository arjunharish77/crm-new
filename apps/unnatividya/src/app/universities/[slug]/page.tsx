export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalBadge } from "@/components/approval-badge";
import { JsonLd } from "@/components/json-ld";
import { SaveButton } from "@/components/save-button";
import { SectionPillNav } from "@/components/section-pill-nav";
import { StickyMobileBar } from "@/components/sticky-mobile-bar";
import { formatFee } from "@/lib/catalog-format";
import { universityMedia } from "@/data/media";
import { publicAssetExists } from "@/lib/asset-exists";
import { getApprovalIcon } from "@/lib/approval-icons";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { getUniversityBySlug } = catalog;
  const { slug } = await params;
  const university = getUniversityBySlug(slug);
  if (!university) return {};
  const title = `${university.name} Online Degrees`;
  const description = `Explore ${university.name} online degrees, fees, approvals, career support, and eligibility.`;
  return {
    title,
    description,
    alternates: { canonical: `/universities/${university.slug}` },
    openGraph: { title, description, images: [universityMedia[university.id].src] },
  };
}

export default async function UniversityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const catalog = await getPublishedCatalog();
  const { courses, getUniversityBySlug, universities, universityEnrichmentById } = catalog;
  const { slug } = await params;
  const university = getUniversityBySlug(slug);
  if (!university) notFound();

  const universityCourses = courses.filter((course) => course.universityId === university.id);
  const otherUniversities = universities.filter((other) => other.id !== university.id);
  const enrichment = universityEnrichmentById[university.id] || {};
  const media = universityMedia[university.id];
  const availablePartnerLogos = media.partnerLogos.filter((logo) => publicAssetExists(logo));
  const displayedFaqs: Array<[string, string]> = enrichment.faqs || [
    [`Are ${university.shortName} online degrees UGC-entitled?`, `${university.name} programs listed on Unnati Vidya are maintained for UGC-entitled online degree comparison and should be verified for the current admission cycle before enrolment.`],
    ["Can I compare all programs from this university?", "Yes. Use the listed program cards or the compare page to place up to three programs side by side."],
    ["Does Unnati Vidya charge counselling fees?", "No. Counselling is free for learners."],
  ];
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const universityJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollegeOrUniversity",
    name: university.name,
    alternateName: university.shortName,
    url: `${siteUrl}/universities/${university.slug}`,
    address: university.city,
    foundingDate: String(university.established),
    description: university.about,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: university.rating,
      reviewCount: university.reviews,
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${university.shortName} online degrees`,
      itemListElement: universityCourses.map((course) => ({
        "@type": "Course",
        name: course.name,
        url: `${siteUrl}/courses/${course.slug}`,
      })),
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Universities", item: `${siteUrl}/universities` },
      { "@type": "ListItem", position: 3, name: university.name, item: `${siteUrl}/universities/${university.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: displayedFaqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={[universityJsonLd, breadcrumbJsonLd, faqJsonLd]} />
      <section className="detail-hero">
        <div className="container detail-hero-inner">
          <div>
            <div className="breadcrumb" style={{ marginBottom: 12, color: "#B8C4CA" }}>
              <Link href="/">Home</Link> &gt; <Link href="/universities">Universities</Link> &gt; {university.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 60, height: 60, background: "#fff", borderRadius: 8, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <Image src={media.logo} alt={`${university.shortName} logo`} width={48} height={48} style={{ objectFit: "contain" }} />
              </div>
              <div>
                <h1>{university.name}</h1>
                <div className="detail-sub">{university.city} · Established {university.established} · {university.learners} online learners</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, marginBottom: 0 }}>
              {university.approvals.map((approval) => {
                const icon = getApprovalIcon(approval);
                return icon ? (
                  <span key={approval} style={{ background: "#fff", borderRadius: 6, height: 36, minWidth: 56, padding: "4px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <Image src={icon} alt={approval} fill sizes="72px" style={{ objectFit: "contain", padding: 4 }} />
                  </span>
                ) : (
                  <ApprovalBadge label={approval} className="gold-badge" key={approval} />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span><span style={{ color: "#FDB515" }}>★</span> <b>{university.rating}</b> ({university.reviews.toLocaleString("en-IN")} reviews)</span>
            </div>
          </div>
          <div className="detail-hero-media" style={{ height: 180 }}>
            <Image
              src={media.src}
              alt={media.alt}
              width={620}
              height={360}
              sizes="(max-width: 900px) 100vw, 420px"
              priority
            />
          </div>
        </div>
      </section>

      <section className="stats-band">
        <div className="container stats-band-grid">
          {[
            ["placement assistance rate", `${university.placement}%`],
            ["average package", university.avgPackage],
            ["highest package", university.highestPackage],
            ["hiring partners", `${university.partners}+`],
            ["annual fee from", university.feeFrom],
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <SectionPillNav
        label="University sections"
        items={[
          { label: "About", href: "#sec-about" },
          { label: "Rankings", href: "#sec-rankings" },
          { label: "Programs", href: "#sec-programs" },
          { label: "Placements", href: "#sec-placements" },
          { label: "Admission", href: "#sec-admission" },
          { label: "Scholarships", href: "#sec-scholarships" },
          { label: "FAQ", href: "#sec-faq" },
        ]}
      />

      <div className="container detail-layout" style={{ flex: 1 }}>
          <div className="detail-stack">
            <section className="detail-section" id="sec-about">
              <h2>About {university.shortName} online</h2>
              {(enrichment.overview || [university.about]).map((paragraph) => (
                <p style={{ fontSize: 15, lineHeight: 1.65, color: "#555", margin: "0 0 12px" }} key={paragraph}>{paragraph}</p>
              ))}
              <div className="grid three" style={{ marginTop: 18 }}>
                {(enrichment.factTiles || [
                  ["Established", String(university.established)],
                  ["Location", university.city],
                  ["Online learners", university.learners],
                  ["Annual fee from", university.feeFrom],
                  ["Batches", "January & July"],
                  ["Exams", "Online proctored"],
                ]).map(([label, value]) => (
                  <div style={{ border: "1px solid #EAEAEA", borderRadius: 8, padding: "12px 14px", background: "#F7F8F9" }} key={label}>
                    <div style={{ fontSize: 11, color: "#707070" }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section" id="sec-rankings">
              <h2>Recognitions</h2>
              <div className="grid two">
                {(enrichment.rankings || university.approvals.slice(0, 4).map((approval) => ({ title: approval, note: "institutional recognition" }))).map((ranking) => {
                  const icon = getApprovalIcon(ranking.title);
                  return (
                    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", border: "1px solid #CFDAE6", borderRadius: 8, padding: 16 }} key={ranking.title}>
                      {icon ? (
                        <span style={{ position: "relative", width: 44, height: 36, flexShrink: 0 }}>
                          <Image src={icon} alt="" fill sizes="44px" style={{ objectFit: "contain" }} />
                        </span>
                      ) : null}
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{ranking.title}</div>
                        <div style={{ fontSize: 12, color: "#696868", marginTop: 4, lineHeight: 1.4 }}>{ranking.note}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="detail-section" id="sec-programs">
              <h2>Online programs offered</h2>
              <div className="university-program-cards">
                {universityCourses.map(course => <article className="guide-fee-card university-program-card" key={course.id} aria-labelledby={`university-program-${course.id}`}>
                  <div className="university-program-heading"><h3 id={`university-program-${course.id}`}><Link href={`/courses/${course.slug}`}>{course.name}</Link></h3><SaveButton courseId={course.id} size={44} /></div>
                  <p className="lead-help">{course.level === "PG" ? "Postgraduate" : "Undergraduate"}</p>
                  <dl><div><dt>Duration</dt><dd>{course.duration}</dd></div><div><dt>Listed total tuition</dt><dd>{formatFee(course.fee)}</dd></div><div><dt>EMI from</dt><dd>{course.emi}</dd></div></dl>
                  <Link href={`/courses/${course.slug}`} className="btn secondary">View program</Link>
                </article>)}
              </div>
              {!universityCourses.length && <p>There are no published programs for this university yet.</p>}
            </section>

            <section className="detail-section" id="sec-placements">
              <h2>Placements & hiring partners</h2>
              <div className="grid-mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                {media.partnerLogos.map((logo, index) =>
                  availablePartnerLogos.includes(logo) ? (
                    <div style={{ height: 72, border: "1px solid #EAEAEA", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 10, position: "relative" }} key={logo}>
                      <Image src={logo} alt={`${university.shortName} hiring partner`} fill sizes="120px" style={{ objectFit: "contain", padding: 10 }} />
                    </div>
                  ) : (
                    <div style={{ height: 72, border: "1px dashed #EAEAEA", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#707070", fontFamily: "monospace" }} key={index}>logo</div>
                  ),
                )}
              </div>
              <div className="grid four" style={{ marginTop: 16 }}>
                {(enrichment.placementSupport || ["Resume clinics", "Mock interviews", "Job board access"]).map((support) => (
                  <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14, fontSize: 13, fontWeight: 600, color: "#363634", textAlign: "center" }} key={support}>
                    {support}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#707070", marginTop: 10 }}>Placement assistance, not a guaranteed offer — as stated on the university&apos;s own pages.</div>
            </section>

            <section className="detail-section" id="sec-admission">
              <h2>Admission process</h2>
              <div className="grid four">
                {(enrichment.admissionSteps || [
                  { title: "Apply online", copy: "Fill the application on the university portal - 10 minutes." },
                  { title: "Upload documents", copy: "Mark sheets, ID proof and a photo. We check them first." },
                  { title: "Pay first semester", copy: "Card, net-banking or no-cost EMI after loan approval." },
                  { title: "Start learning", copy: "LMS login within 72 hours of approval." },
                ]).map((step, index) => (
                  <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 16 }} key={step.title}>
                    <div style={{ width: 32, height: 32, borderRadius: 4, background: "rgba(84,76,200,0.10)", color: "#544CC8", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", margin: "10px 0 4px" }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: "#696868", lineHeight: 1.5 }}>{step.copy}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section" id="sec-scholarships">
              <h2>Scholarships & fee concessions</h2>
              {enrichment.scholarships?.length ? <div className="guide-fee-cards university-scholarship-cards">
                {enrichment.scholarships.map((row,index) => <article className="guide-fee-card" key={`${row[0]}-${index}`}>
                  <h3>{row[0]}</h3><dl><div><dt>Listed concession</dt><dd>{row[1]}</dd></div><div><dt>Proof required</dt><dd>{row[2]}</dd></div></dl>
                </article>)}
              </div> : <p>Scholarship details are not listed yet. Confirm current offers and eligibility with the university.</p>}
              <p className="lead-help">Confirm the current admission session, eligibility, required documents and whether concessions can be combined directly with the university.</p>
            </section>

            <section className="detail-section" id="sec-faq">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {displayedFaqs.map(([question, answer]) => (
                  <details className="faq-item" name="university-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>

            {otherUniversities.length ? (
              <section className="detail-section">
                <h2>Other universities to consider</h2>
                <div className="grid-mobile-stack" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {otherUniversities.map((other) => (
                    <Link href={`/universities/${other.slug}`} className="uv-card" style={{ display: "block", border: "1px solid #CFDAE6", borderRadius: 8, padding: 16, color: "inherit" }} key={other.id}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{other.name}</div>
                      <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>
                        {other.city} · <span style={{ color: "#FDB515" }}>★</span> {other.rating} · from {other.feeFrom}/yr
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside style={{ position: "sticky", top: 118, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Get {university.shortName} brochure & fee details</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>Talk to a counsellor about eligibility, scholarships and the next batch.</div>
              <Link href={`/lead?university=${university.id}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Apply now</Link>
              <Link href="/compare" style={{ display: "block", textAlign: "center", marginTop: 10, border: "1.5px solid #555", borderRadius: 4, height: 42, lineHeight: "42px", fontSize: 14, fontWeight: 700, color: "#555" }}>Compare with others</Link>
            </div>
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, background: "#F4F3FC" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Why learners pick {university.shortName}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#555", lineHeight: 1.5 }}>
                <span>Fees from {university.feeFrom} per year</span>
                <span>Live + recorded weekend classes</span>
                <span>No-cost EMI on all programs</span>
                <span>Alumni status equal to on-campus</span>
              </div>
            </div>
            {enrichment.sourceUrls?.length ? (
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Sources</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  {enrichment.sourceUrls.map((url) => (
                    <a href={url} target="_blank" rel="noopener noreferrer" key={url} style={{ color: "#544CC8", wordBreak: "break-all" }}>
                      {new URL(url).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                  <Link href="/how-we-verify" style={{ color: "#544CC8", fontWeight: 600 }}>How we verify our data →</Link>
                </div>
              </div>
            ) : null}
          </aside>
      </div>
      <StickyMobileBar primary={{ label: "Apply now", href: `/lead?university=${university.id}`, openLead: true }} />
    </>
  )}</PublishedCatalogBoundary>;
}
