import Link from "next/link";
import type { ReactNode } from "react";

const RELATED_LINKS: Array<[string, string]> = [
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Use"],
  ["/refund-policy", "Refund and Cancellation Policy"],
  ["/how-we-verify", "How we verify our data"],
  ["/online-degree-guides", "Guides & resources"],
  ["/courses", "Browse all courses"],
];

export function LegalPageLayout({ crumb, title, lastUpdated, sections = [], children }: { crumb: string; title: string; lastUpdated: string; sections?: Array<{ id: string; title: string }>; children: ReactNode }) {
  return (
    <div className="container uv-2col policy-reading-layout" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <article className="policy-reading-main">
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "#707070", marginBottom: 8 }}>
          <Link href="/" style={{ color: "#707070" }}>Home</Link> <span aria-hidden="true">&gt;</span> <span aria-current="page">{crumb}</span>
        </nav>
        <h1 id="policy-start" tabIndex={-1}>{title}</h1>
        <p className="policy-updated">Last updated {lastUpdated} · Unnati Vidya</p>
        {sections.length > 0 && <nav aria-label="On this page" className="policy-contents">
          <details>
            <summary>On this page</summary>
            <ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
          </details>
        </nav>}
        {children}
        {sections.length > 0 && <a href="#policy-start" className="policy-back">Back to top</a>}
      </article>

      <aside className="uv-rail" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Questions about any of this?</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 14 }}>
            Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm)
          </div>
          <Link href="/lead?intent=request-callback" data-open-lead className="btn primary" style={{ width: "100%", minHeight: 44, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Apply now
          </Link>
        </div>
        <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#363634", marginBottom: 10 }}>Related</div>
          <nav aria-label="Policies and resources" style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
            {RELATED_LINKS.map(([href, label]) => (
              <Link href={href} key={href} style={{ color: "#544CC8", fontWeight: 600 }}>{label}</Link>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}
