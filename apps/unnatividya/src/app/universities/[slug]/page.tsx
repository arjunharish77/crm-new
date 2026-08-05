import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalBadge } from "@/components/approval-badge";
import { JsonLd } from "@/components/json-ld";
import { SectionPillNav } from "@/components/section-pill-nav";
import { courses, formatFee, getUniversityBySlug, universities, universityEnrichmentById } from "@/data/catalog";
import { universityMedia } from "@/data/media";
import { publicAssetExists } from "@/lib/asset-exists";

export function generateStaticParams() {
  return universities.map((university) => ({ slug: university.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
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
  const { slug } = await params;
  const university = getUniversityBySlug(slug);
  if (!university) notFound();

  const universityCourses = courses.filter((course) => course.universityId === university.id);
  const otherUniversities = universities.filter((other) => other.id !== university.id);
  const enrichment = universityEnrichmentById[university.id] || {};
  const media = universityMedia[university.id];
  const availableMoments = media.moments.filter((moment) => publicAssetExists(moment.src));
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

  return (
    <>
      <JsonLd data={[universityJsonLd, breadcrumbJsonLd, faqJsonLd]} />
      <section className="detail-hero">
        <div className="container detail-hero-inner" style={{ paddingTop: 36, paddingBottom: 36, gridTemplateColumns: "1fr 300px", gap: 40 }}>
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
                <div className="detail-sub">{university.city} · Established {university.established}</div>
              </div>
            </div>
            <div className="gold-badges" style={{ marginTop: 14, marginBottom: 0 }}>
              {university.approvals.map((approval) => (
                <ApprovalBadge label={approval} className="gold-badge" key={approval} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span><span style={{ color: "#FDB515" }}>★</span> <b>{university.rating}</b> ({university.reviews.toLocaleString("en-IN")} reviews)</span>
              <span style={{ color: "#546E7A" }}>|</span>
              <span>{university.learners} online learners</span>
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

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 24px 64px", width: "100%", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 340px", gap: 40, alignItems: "start", flex: 1 }}>
          <div className="detail-stack">
            <section className="detail-section" id="sec-about">
              <h2>About {university.shortName} online</h2>
              {(enrichment.overview || [university.about]).map((paragraph) => (
                <p style={{ fontSize: 15, lineHeight: 1.65, color: "#555", margin: "0 0 12px" }} key={paragraph}>{paragraph}</p>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 18 }}>
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
              <h2>Rankings & recognitions</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {(enrichment.rankings || university.approvals.slice(0, 4).map((approval) => ({ title: approval, note: "institutional recognition" }))).map((ranking) => (
                  <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 16, textAlign: "center" }} key={ranking.title}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#544CC8" }}>{ranking.title}</div>
                    <div style={{ fontSize: 12, color: "#696868", marginTop: 4, lineHeight: 1.4 }}>{ranking.note}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section" id="sec-programs">
              <h2>Online programs offered</h2>
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3, gap: 12 }}>
                  <span>PROGRAM</span><span>DURATION</span><span>TOTAL FEE</span><span>EMI FROM</span><span />
                </div>
                {universityCourses.map((course) => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center", gap: 12 }} key={course.id}>
                    <span>
                      <Link href={`/courses/${course.slug}`} style={{ fontWeight: 700, color: "#363634" }}>{course.name}</Link>
                      <span style={{ fontSize: 11, fontWeight: 700, color: course.level === "PG" ? "#4D00FF" : "#4FA8FF", background: course.level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "2px 8px", marginLeft: 8 }}>{course.level}</span>
                    </span>
                    <span>{course.duration}</span>
                    <span style={{ fontWeight: 600, color: "#363634" }}>{formatFee(course.fee)}</span>
                    <span>{course.emi}</span>
                    <Link href={`/courses/${course.slug}`} style={{ fontSize: 13, fontWeight: 700 }}>View →</Link>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section" id="sec-placements">
              <h2>Placements & hiring partners</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                {media.partnerLogos.map((logo, index) =>
                  availablePartnerLogos.includes(logo) ? (
                    <div style={{ height: 72, border: "1px solid #EAEAEA", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 10, position: "relative" }} key={logo}>
                      <Image src={logo} alt={`${university.shortName} hiring partner`} fill sizes="120px" style={{ objectFit: "contain", padding: 10 }} />
                    </div>
                  ) : (
                    <div style={{ height: 72, border: "1px dashed #EAEAEA", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#AAAAAA", fontFamily: "monospace" }} key={index}>logo</div>
                  ),
                )}
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>{(enrichment.placementSupport || ["Resume clinics", "Mock interviews", "Job board access"]).join(" · ")}</div>
            </section>

            <section className="detail-section">
              <h2>Campus & learner moments</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {media.moments.map((moment, index) => {
                  const fallback = [
                    ["https://commons.wikimedia.org/wiki/Special:FilePath/Online%20class%20shooting%20during%20covid.jpg?width=900", "Campus moment 1"],
                    ["https://commons.wikimedia.org/wiki/Special:FilePath/Monsoon%20Expo%202022%20at%20Ahmedabad%20University%2001.jpg?width=900", "Campus moment 2"],
                    ["https://commons.wikimedia.org/wiki/Special:FilePath/Classroom%20in%20Mother%27s%20International%20School%2C%20Delhi.JPG?width=900", "Campus moment 3"],
                  ][index];
                  const hasLocal = availableMoments.some((available) => available.src === moment.src);
                  const src = hasLocal ? moment.src : fallback[0];
                  const alt = hasLocal ? moment.alt : fallback[1];
                  return (
                    <div style={{ height: 150, border: "1px solid #EAEAEA", borderRadius: 8, overflow: "hidden" }} key={moment.src}>
                      <Image src={src} alt={alt} width={320} height={180} sizes="(max-width: 900px) 100vw, 260px" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="detail-section" id="sec-admission">
              <h2>Admission process</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3, gap: 12 }}>
                  <span>CATEGORY</span><span>CONCESSION</span><span>PROOF REQUIRED</span>
                </div>
                {(enrichment.scholarships || [
                  ["Merit (75%+ in qualifying exam)", "20%", "Final mark sheet"],
                  ["Defence personnel & family", "20%", "Service / dependent ID"],
                  ["Government employees", "10%", "Employee ID"],
                  ["Divyaang (PwD)", "20%", "Disability certificate"],
                  ["Alumni of the university", "15%", "Previous degree certificate"],
                ]).map((row) => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr", padding: "13px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, gap: 12 }} key={row[0]}>
                    <span style={{ fontWeight: 600, color: "#363634" }}>{row[0]}</span>
                    <span style={{ fontWeight: 700, color: "#2E7D32" }}>{row[1]}</span>
                    <span>{row[2]}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>One scholarship per learner; applied on tuition fee at admission. Eligibility confirmed during free counselling.</p>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
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
              <Link href={`/lead?university=${university.id}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Enquire now</Link>
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
          </aside>
      </div>
    </>
  );
}
