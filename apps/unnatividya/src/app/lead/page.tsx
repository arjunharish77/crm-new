import type { Metadata } from "next";
import { LeadFormLoader } from "@/components/lead-form-loader";
import { getCourseBySlug, getUniversityBySlug } from "@/data/catalog";

export const metadata: Metadata = {
  title: "Request Guidance",
  robots: { index: false, follow: false },
};

export default async function LeadPage({
  searchParams,
}: {
  searchParams?: Promise<{ course?: string; university?: string; intent?: string; goal?: string }>;
}) {
  const params = (await searchParams) || {};
  const course = params.course ? getCourseBySlug(params.course) : undefined;
  const university = params.university ? getUniversityBySlug(params.university) : undefined;
  const contextLabel = course ? `${course.name} — ${course.university.shortName}` : university ? university.name : null;

  return (
    <section className="section alt">
      <div className="container uv-2col">
        <div>
          <h1 style={{ color: "#363634", fontSize: 30, fontWeight: 700, margin: "0 0 14px" }}>
            Talk to a counsellor who has no reason to oversell{contextLabel ? ` you on ${contextLabel}` : ""}
          </h1>
          <p style={{ color: "#696868", fontSize: 15, lineHeight: 1.6, maxWidth: 480 }}>
            We&apos;re an aggregator, not a university — our counsellors get paid the same whichever program you
            pick. They check your fee, eligibility and entitlement status against the university&apos;s own
            published pages before the call, not after.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {["Fee and scholarship check", "Entitlement verification", "Documents and loan paperwork"].map((item) => (
              <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, color: "#363634", fontSize: 14, fontWeight: 600 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(46,125,50,0.10)", color: "#2E7D32", fontSize: 12, lineHeight: "20px", textAlign: "center", flexShrink: 0 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="uv-3col" style={{ marginTop: 28, maxWidth: 480 }}>
            {[
              ["1.75L+", "learners guided"],
              ["< 24 hrs", "callback time"],
              ["₹0", "you pay us"],
            ].map(([stat, label]) => (
              <div key={label}>
                <div style={{ color: "#544CC8", fontSize: 22, fontWeight: 700 }}>{stat}</div>
                <div style={{ color: "#707070", fontSize: 12, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #D3D9EA" }}>
            <div>
              <div style={{ color: "#363634", fontSize: 18, fontWeight: 700 }}>
                {contextLabel ? `Get guidance on ${contextLabel}` : "Get free expert counselling"}
              </div>
              <div style={{ color: "#696868", fontSize: 13, marginTop: 2 }}>Free counselling · No spam, ever</div>
            </div>
          </div>
          <div style={{ padding: "20px 24px 24px" }}>
            <LeadFormLoader context={{ course: params.course, university: params.university, intent: params.intent, goal: params.goal }} />
          </div>
        </div>
      </div>
    </section>
  );
}
