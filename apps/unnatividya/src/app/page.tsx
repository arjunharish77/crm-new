import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ApprovalBadge } from "@/components/approval-badge";
import { courses, courseWithUniversity, formatFee, universities } from "@/data/catalog";
import { recommenderPreviewMedia, universityMedia } from "@/data/media";

const pageWidth: CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  paddingLeft: 24,
  paddingRight: 24,
  width: "100%",
  boxSizing: "border-box",
};

const sectionTitle: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: "#363634",
  margin: 0,
};

const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  background: "#544CC8",
  color: "#fff",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
};

const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  background: "#fff",
  border: "1.5px solid #555",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
  color: "#555",
};

const universityDisplayName = (id: string, name: string) => id === "amity" ? "Amity University Online" : name;

export default function HomePage() {
  const popularCourseIds = ["mba-muj", "mba-amity", "bca-muj", "mca-muj", "bcom-muj", "bba-amity"];
  const popular = popularCourseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is (typeof courses)[number] => Boolean(course))
    .map(courseWithUniversity);

  return (
    <>
      <section style={{ background: "linear-gradient(180deg,#F4F3FC 0%,#fff 100%)", borderBottom: "1px solid #F5F5F5" }}>
        <div
          className="uv-home-hero-grid"
          style={{
            ...pageWidth,
            paddingTop: 56,
            paddingBottom: 48,
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 56,
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #CFDAE6", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#696868" }}>
              Only UGC-entitled online degrees · valid for govt & private jobs
            </div>
            <h1 style={{ fontSize: 43, lineHeight: 1.1, fontWeight: 700, color: "#363634", margin: "18px 0 14px", textWrap: "pretty" }}>
              One place to compare every online degree that matters
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: "#696868", margin: "0 0 26px", maxWidth: 520 }}>
              Compare fees, curriculum, placements and reviews across Manipal, Sikkim Manipal, Amity and more — then talk to an unbiased counsellor, free.
            </p>
            <form action="/courses" method="get" style={{ display: "flex", gap: 0, maxWidth: 520, border: "1.5px solid #CFDAE6", borderRadius: 6, overflow: "hidden", background: "#fff" }}>
              <input name="q" aria-label="Search courses" placeholder="Search a course, e.g. Online MBA" style={{ flex: 1, height: 52, border: "none", padding: "0 18px", fontSize: 15, color: "#555", outline: "none", minWidth: 0 }} />
              <button type="submit" style={{ display: "flex", alignItems: "center", padding: "0 26px", background: "#544CC8", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>
                Search
              </button>
            </form>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#707070" }}>Popular:</span>
              {[
                ["Online MBA", "/courses/online-mba-manipal-university-jaipur"],
                ["Online BCA", "/courses/online-bca-manipal-university-jaipur"],
                ["Online B.Com", "/courses/online-bcom-manipal-university-jaipur"],
                ["Online MCA", "/courses/online-mca-manipal-university-jaipur"],
              ].map(([label, href]) => (
                <Link href={href} key={label} style={{ fontSize: 13, fontWeight: 600, color: "#555", border: "1px solid #D8D7D6", borderRadius: 999, padding: "5px 12px" }}>
                  {label}
                </Link>
              ))}
            </div>
            <div style={{ display: "flex", gap: 36, marginTop: 36, flexWrap: "wrap" }}>
              {[
                ["40+", "online programs"],
                ["3", "top universities"],
                ["1.7L+", "learners guided"],
                ["₹0", "counselling fee"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "#363634" }}>{value}</div>
                  <div style={{ fontSize: 13, color: "#707070" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ height: 130, borderRadius: 6, overflow: "hidden", marginBottom: 16, position: "relative" }}>
              <Image src={recommenderPreviewMedia.src} alt={recommenderPreviewMedia.alt} fill sizes="(max-width: 900px) 100vw, 360px" style={{ objectFit: "cover" }} priority />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>Not sure which degree fits?</div>
            <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 16px", lineHeight: 1.5 }}>
              Answer 5 questions and our AI shortlists the right programs for your goals and budget.
            </div>
            <Link href="/recommender" style={{ display: "block", textAlign: "center", height: 44, lineHeight: "44px", background: "linear-gradient(90deg,#453DB8 0%,#8B7CF0 100%)", color: "#fff", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>
              Get my AI shortlist
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#EAEAEA" }} />
              <span style={{ fontSize: 12, color: "#AAAAAA" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#EAEAEA" }} />
            </div>
            <Link href="/lead?intent=request-callback" data-open-lead style={{ ...secondaryButton, width: "100%", height: 44, fontSize: 15 }}>
              Request a free callback
            </Link>
            <div style={{ fontSize: 12, color: "#707070", marginTop: 12, textAlign: "center" }}>4.8 ★ rated by 12,400+ students</div>
          </div>
        </div>
      </section>

      <div style={{ borderBottom: "1px solid #F5F5F5", background: "#fff" }}>
        <div style={{ ...pageWidth, paddingTop: 16, paddingBottom: 16, display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#AAAAAA", fontWeight: 600, letterSpacing: 0.5 }}>APPROVALS THAT MATTER</span>
          {["UGC", "NAAC A+", "AICTE", "WES", "AIU"].map((approval) => (
            <span style={{ fontSize: 14, fontWeight: 700, color: "#696868" }} key={approval}>{approval}</span>
          ))}
        </div>
      </div>

      <section style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={sectionTitle}>Top online universities</h2>
          <Link href="/universities" style={{ fontSize: 14, fontWeight: 600 }}>View all →</Link>
        </div>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {universities.map((university) => (
            <Link href={`/universities/${university.slug}`} className="uv-card" style={{ display: "block", background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden", color: "inherit" }} key={university.id}>
              <div style={{ height: 140, overflow: "hidden", position: "relative" }}>
                <Image src={universityMedia[university.id].src} alt={universityMedia[university.id].alt} fill sizes="(max-width: 900px) 100vw, 33vw" style={{ objectFit: "cover" }} />
                <span style={{ position: "absolute", right: 6, bottom: 6, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 3, padding: "2px 6px" }}>via Wikimedia Commons</span>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>{universityDisplayName(university.id, university.name)}</div>
                <div style={{ fontSize: 13, color: "#707070", margin: "4px 0 10px" }}>{university.city}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {university.approvals.slice(0, 3).map((approval) => (
                    <ApprovalBadge
                      label={approval}
                      style={{ fontSize: 11, fontWeight: 700, color: "#4FA8FF", background: "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}
                      key={approval}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555", gap: 12 }}>
                  <span><span style={{ color: "#FDB515" }}>★</span> <b style={{ color: "#363634" }}>{university.rating}</b> ({university.reviews.toLocaleString("en-IN")})</span>
                  <span>from <b style={{ color: "#363634" }}>{university.feeFrom}</b>/yr</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ background: "#F7F8F9", borderTop: "1px solid #EAEAEA", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
            <h2 style={sectionTitle}>Popular online degrees</h2>
            <Link href="/courses" style={{ fontSize: 14, fontWeight: 600 }}>Browse all courses →</Link>
          </div>
          <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {popular.map((course) => (
              <article style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 10 }} key={course.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: course.level === "PG" ? "#4D00FF" : "#4FA8FF", background: course.level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>{course.level}</span>
                  <span style={{ fontSize: 13, color: "#555" }}><span style={{ color: "#FDB515" }}>★</span> {course.rating}</span>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>{course.name}</div>
                  <div style={{ fontSize: 13, color: "#707070", marginTop: 2 }}>{universityDisplayName(course.university.id, course.university.name)}</div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#555", flexWrap: "wrap" }}>
                  <span>{course.duration}</span>
                  <span><b style={{ color: "#363634" }}>{formatFee(course.fee)}</b> total</span>
                  <span>EMI {course.emi}</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                  <Link href={`/courses/${course.slug}`} style={{ ...primaryButton, flex: 1 }}>View course</Link>
                  <Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead style={{ ...secondaryButton, flex: 1 }}>Enquire</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 8 }}>How UnnatiVidya works</h2>
        <p style={{ fontSize: 15, color: "#696868", margin: "0 0 28px" }}>
          Unbiased by design — universities pay us the same, so our advice follows your goals, not commissions.
        </p>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            ["Compare side by side", "Fees, EMIs, curriculum, approvals and placement records — in one honest table."],
            ["Talk to a real counsellor", "A free 1-on-1 call to sanity-check your shortlist against your career plan."],
            ["Enrol with support", "We handle documents, loans and admission follow-ups until your LMS login arrives."],
          ].map(([title, copy], index) => (
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 22 }} key={title}>
              <div style={{ width: 36, height: 36, borderRadius: 4, background: "rgba(84,76,200,0.10)", color: "#544CC8", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634", margin: "14px 0 6px" }}>{title}</div>
              <div style={{ fontSize: 14, color: "#696868", lineHeight: 1.5 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 0, paddingBottom: 56 }}>
        <div className="uv-home-factor-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
          {[
            ["30+", "comparison factors"],
            ["Loans", "quick education loan facility"],
            ["Support", "post-admission, till graduation"],
            ["Jobs", "job + internship portal"],
            ["Community", "exclusive learner groups"],
            ["₹0 extra", "lowest-fee guarantee"],
          ].map(([label, copy]) => (
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14, textAlign: "center" }} key={label}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#544CC8" }}>{label}</div>
              <div style={{ fontSize: 12, color: "#696868", marginTop: 2, lineHeight: 1.4 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#F4F3FC", borderTop: "1px solid #EAEAEA", borderBottom: "1px solid #EAEAEA" }}>
        <div className="uv-home-trust-grid" style={{ ...pageWidth, paddingTop: 40, paddingBottom: 40, display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 40, alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#363634", maxWidth: 200, lineHeight: 1.25 }}>Why learners trust UnnatiVidya</div>
          {[
            ["Unbiased by design", "Every university pays us the same — advice follows your goals, not commissions."],
            ["Approvals verified", "UGC, NAAC and AICTE status re-checked every admission cycle."],
            ["Support till enrolment", "Documents, loans and follow-ups handled until your LMS login arrives."],
          ].map(([title, copy]) => (
            <div key={title}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#544CC8" }}>{title}</div>
              <div style={{ fontSize: 13, color: "#696868", lineHeight: 1.5, marginTop: 4 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#263238" }}>
        <div style={{ ...pageWidth, paddingTop: 48, paddingBottom: 48, display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Confused between two universities?</div>
            <div style={{ fontSize: 15, color: "#B8C4CA", marginTop: 6 }}>Put up to 3 programs side by side — fees, approvals, placements and hidden costs.</div>
          </div>
          <Link href="/compare" style={{ height: 48, lineHeight: "48px", padding: "0 28px", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>Compare now</Link>
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 24 }}>What learners say</h2>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            ["Priya Sharma", "Online MBA · batch of 2025", "PS", "I compared 4 MBA programs here before picking Manipal Jaipur. The counsellor actually talked me out of the costlier option."],
            ["Arjun Mehta", "Online BCA · working at TCS", "AM", "The EMI breakdown saved me. I knew exactly what I would pay per month before I even spoke to the university."],
            ["Farhan Khan", "Online MCA · batch of 2026", "FK", "AI recommender shortlisted 3 courses in two minutes. Enrolled in Amity MCA the same week."],
          ].map(([name, meta, initials, quote]) => (
            <article style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22 }} key={name}>
              <div style={{ color: "#FDB515", fontSize: 14, letterSpacing: 2 }}>★★★★★</div>
              <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "12px 0 16px" }}>“{quote}”</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EBF2F6", color: "#555", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#363634" }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#707070" }}>{meta}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px 64px", width: "100%", boxSizing: "border-box" }}>
        <h2 style={{ ...sectionTitle, marginBottom: 20 }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["Are online degrees valid for government jobs?", "Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies."],
            ["Is counselling really free?", "Yes — universities compensate us equally, so counselling costs you nothing and our advice carries no commission bias."],
            ["Can I pay via EMI?", "Every listed program offers no-cost EMI through education loan partners, plus semester-wise payment options."],
            ["How do I choose between universities?", "Use the compare tool for a side-by-side of fees, approvals and placements — or take the 2-minute AI quiz for a personalised shortlist."],
          ].map(([question, answer]) => (
            <details className="faq-item" name="home-faq" key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
