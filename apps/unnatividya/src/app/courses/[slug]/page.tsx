import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalBadge } from "@/components/approval-badge";
import { JsonLd } from "@/components/json-ld";
import { SectionPillNav } from "@/components/section-pill-nav";
import { careerRoleSalary, courseWithUniversity, courses, formatFee, getCourseBySlug } from "@/data/catalog";
import { certificateImagePath, learningMedia, universityMedia } from "@/data/media";
import { publicAssetExists } from "@/lib/asset-exists";
import { feeGuideSlugForCourseName, getFeeGuideBySlug } from "@/lib/fee-guides";

export function generateStaticParams() {
  return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) return {};
  const title = `${course.name} from ${course.university.name}`;
  const description = `${course.name} from ${course.university.name}: fees ${formatFee(course.fee)}, duration ${course.duration}, eligibility, specialisations, and career roles.`;
  return {
    title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: { title, description, images: [universityMedia[course.universityId].src] },
  };
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) notFound();
  const similarCourses = courses
    .filter((candidate) => candidate.id !== course.id && candidate.shortName === course.shortName)
    .map(courseWithUniversity)
    .slice(0, 3);
  const feeGuide = getFeeGuideBySlug(feeGuideSlugForCourseName(course.name));
  const certificatePath = certificateImagePath(course.id);
  const hasCertificateImage = publicAssetExists(certificatePath);
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${course.name} - ${course.university.name}`,
    description: `${course.name} from ${course.university.name}. Duration ${course.duration}, total fee ${formatFee(course.fee)}, UGC-entitled online degree.`,
    url: `${siteUrl}/courses/${course.slug}`,
    provider: {
      "@type": "CollegeOrUniversity",
      name: course.university.name,
      url: `${siteUrl}/universities/${course.university.slug}`,
      address: course.university.city,
    },
    educationalCredentialAwarded: course.name,
    timeRequired: course.duration,
    offers: {
      "@type": "Offer",
      price: course.fee,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/lead?course=${course.id}`,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: course.rating,
      reviewCount: course.reviews,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Courses", item: `${siteUrl}/courses` },
      { "@type": "ListItem", position: 3, name: course.name, item: `${siteUrl}/courses/${course.slug}` },
    ],
  };
  const faqJsonLd = course.faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: course.faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }
    : null;

  return (
    <>
      <JsonLd data={[courseJsonLd, breadcrumbJsonLd, faqJsonLd].filter((item): item is NonNullable<typeof item> => item !== null)} />
      <section className="detail-hero">
        <div className="container" style={{ paddingTop: 36, paddingBottom: 32 }}>
          <div>
            <div className="breadcrumb" style={{ marginBottom: 12, color: "#B8C4CA" }}>
              <Link href="/">Home</Link> &gt; <Link href="/courses">Courses</Link> &gt; {course.name}
            </div>
            <div className="gold-badges" style={{ marginTop: 0, marginBottom: 12 }}>
              {course.university.approvals.slice(0, 4).map((approval) => (
                <ApprovalBadge label={approval} className="gold-badge" key={approval} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 60, height: 60, background: "#fff", borderRadius: 8, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <Image src={universityMedia[course.universityId].logo} alt={`${course.university.shortName} logo`} width={48} height={48} style={{ objectFit: "contain" }} />
              </div>
              <div>
                <h1>{course.name}</h1>
                <div className="detail-sub" style={{ fontSize: 16 }}>
                  <Link href={`/universities/${course.university.slug}`} style={{ color: "#fff", textDecoration: "underline" }}>
                    {course.university.name}
                  </Link>{" "}
                  · {course.university.city}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, fontSize: 14 }}>
              <span><span style={{ color: "#FDB515" }}>★</span> <b>{course.rating}</b> ({course.reviews} reviews)</span>
              <span style={{ color: "#546E7A" }}>|</span>
              <span>{course.university.learners} learners across {course.university.shortName} online programs</span>
            </div>
          </div>
        </div>
      </section>

      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, padding: "18px 0" }}>
            {[
              ["Duration", course.duration],
              ["Total fee", formatFee(course.fee)],
              ["EMI from", course.emi],
              ["Level", `${course.level} degree`],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ color: "#707070", fontSize: 12 }}>{label}</div>
                <div style={{ color: "#363634", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionPillNav
        label="Course sections"
        items={[
          { label: "Overview", href: "#sec-overview" },
          { label: "Specialisations", href: "#sec-specialisations" },
          { label: "Curriculum", href: "#sec-curriculum" },
          { label: "Fees & EMI", href: "#sec-fees" },
          { label: "Careers", href: "#sec-careers" },
          { label: "Certificate", href: "#sec-certificate" },
          { label: "Reviews", href: "#sec-reviews" },
          { label: "FAQ", href: "#sec-faq" },
        ]}
      />

      <div className="container detail-layout">
        <div className="detail-stack">
          <section className="detail-section" id="sec-overview">
            <h2>About this program</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>
                {course.overview}
              </p>
              <div className="overview-media">
                <Image
                  src={learningMedia.src}
                  alt={learningMedia.alt}
                  width={420}
                  height={260}
                  sizes="(max-width: 760px) 100vw, 260px"
                />
              </div>
            </div>
            <div className="fact-grid" style={{ marginTop: 18 }}>
              {(course.highlights || []).map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </section>

          <section className="detail-section" id="sec-specialisations">
            <h2>Specialisations offered</h2>
            <div style={{ fontSize: 13, color: "#707070", marginBottom: 14 }}>Chosen in semester 3 — same fee, same duration</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {course.specializations.map((spec) => (
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14 }} key={spec}>
                  <div style={{ color: "#363634", fontSize: 14, fontWeight: 700 }}>{spec}</div>
                  <div style={{ color: "#707070", fontSize: 12, marginTop: 4 }}>Elective track · semesters 3–4</div>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-section" id="sec-curriculum" data-acc-group>
            <h2>Curriculum</h2>
            <div style={{ fontSize: 13, color: "#707070", marginBottom: 14 }}>Click a semester to expand</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(course.curriculum || []).map((term, index) => (
                <details className="curriculum-item" key={term.term} name="course-curriculum" open={index === 0} style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                  <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer", color: "#363634", fontSize: 15, fontWeight: 700 }}>{term.term}</summary>
                  <div style={{ padding: "4px 18px 16px" }}>
                    {term.subjects.map((subject) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#555", padding: "4px 0" }} key={subject}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#544CC8", flex: "none" }} />
                        {subject}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="detail-section" id="sec-fees">
            <h2>Fees & EMI options</h2>
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                <span>PLAN</span><span>YOU PAY</span><span>PER MONTH</span>
              </div>
              {(course.feePlans || []).map((row, index) => (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={row[0]}>
                  <span style={{ fontWeight: 600, color: "#363634" }}>{row[0]}</span>
                  <span>{row[1]}</span>
                  <span style={{ fontWeight: 700, color: index === 2 ? "#544CC8" : "#363634" }}>{row[2]}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>No-cost EMI via education loan partners. Scholarship up to 20% for defence, govt employees and merit.</div>
            {feeGuide ? (
              <Link href={`/online-degree-guides/${feeGuide.slug}`} style={{ display: "inline-block", marginTop: 12, color: "#544CC8", fontWeight: 700, fontSize: 13 }}>
                {feeGuide.isComparison
                  ? `See ${course.name} fees compared across ${feeGuide.courses.length} universities →`
                  : `See the full ${course.name} fee & scholarship guide →`}
              </Link>
            ) : null}
          </section>

          <section className="detail-section" id="sec-careers">
            <h2>Career outcomes</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {course.careerRoles.map((role) => (
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 16 }} key={role}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{role}</div>
                  <div style={{ fontSize: 13, color: "#2E7D32", fontWeight: 700, marginTop: 4 }}>{careerRoleSalary[role] || "Role-fit varies"}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>{course.university.placement}% placement assistance rate at {course.university.shortName} · average package {course.university.avgPackage} · {course.university.partners}+ hiring partners</div>
          </section>

          <section className="detail-section" id="sec-certificate">
            <h2>Sample degree certificate</h2>
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "center" }}>
              {hasCertificateImage ? (
                <div style={{ height: 210, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <Image src={certificatePath} alt={`${course.name} sample degree certificate`} fill sizes="300px" style={{ objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{ height: 210, border: "1px dashed #CFDAE6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#AAAAAA", fontFamily: "monospace", background: "repeating-linear-gradient(45deg,#FAFAFA,#FAFAFA 12px,#F4F3FC 12px,#F4F3FC 24px)" }}>
                  Sample certificate scan
                </div>
              )}
              <div style={{ fontSize: 14, lineHeight: 1.65, color: "#555" }}>
                The degree certificate is identical to the on-campus award — it does not mention &quot;online&quot; as a mode. It is UGC-entitled, valid for government jobs, higher studies (including abroad via WES), and PSU recruitment.
              </div>
            </div>
          </section>

          <section className="detail-section" id="sec-reviews">
            <h2>Student reviews</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Sneha Iyer", "Classes are genuinely live, not just recordings. Faculty responds on the forum within a day. Exams were smooth with online proctoring.", 5],
                ["Rohit Verma", "Good curriculum and the EMI made it affordable. Placement cell is helpful but you must be proactive with applications.", 4],
              ].map(([name, quote, stars]) => (
                <article style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18 }} key={name}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EBF2F6", color: "#555", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {(name as string).split(" ").map((part) => part[0]).join("")}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{name}</span>
                    </div>
                    <span style={{ color: "#FDB515", fontSize: 13, letterSpacing: 1 }}>{"★".repeat(stars as number)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>{quote}</div>
                </article>
              ))}
            </div>
          </section>

          {similarCourses.length ? (
            <section className="detail-section">
              <h2>Similar programs to consider</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {similarCourses.map((candidate) => (
                  <Link href={`/courses/${candidate.slug}`} className="uv-card" style={{ display: "block", border: "1px solid #CFDAE6", borderRadius: 8, padding: 16, color: "inherit" }} key={candidate.id}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{candidate.name} — {candidate.university.shortName}</div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>{candidate.duration} · {formatFee(candidate.fee)} · <span style={{ color: "#FDB515" }}>★</span> {candidate.rating}</div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="detail-section" id="sec-faq">
            <h2>Frequently asked questions</h2>
            <div className="faq-list">
              {(course.faqs || []).map(([question, answer]) => (
                <details className="faq-item" name="course-faq" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside className="right-rail">
          <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Get the full fee breakup & brochure</div>
            <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will share the brochure, scholarship eligibility and next batch dates.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Full name" style={{ height: 42, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8" }} />
              <input placeholder="Mobile number" style={{ height: 42, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8" }} />
              <Link href={`/lead?course=${course.id}&intent=enquire`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Enquire now</Link>
            </div>
            <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
          </div>
          <Link href={`/compare?add=${course.id}`} style={{ display: "block", textAlign: "center", border: "1.5px solid #555", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#555", background: "#fff" }}>Compare with similar programs</Link>
          <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, background: "#F4F3FC" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Placement support</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#555" }}>
              <span>{course.university.placement}% placement assistance rate</span>
              <span>Average package {course.university.avgPackage}</span>
              <span>{course.university.partners}+ hiring partners</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
