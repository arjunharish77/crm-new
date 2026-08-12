import Link from "next/link";
import type { ReactNode } from "react";

const RELATED_LINKS: Array<[string, string]> = [
  ["/how-we-verify", "How we verify our data"],
  ["/online-degree-guides", "Guides & resources"],
  ["/courses", "Browse all courses"],
];

export function LegalPageLayout({ crumb, title, lastUpdated, children }: { crumb: string; title: string; lastUpdated: string; children: ReactNode }) {
  return (
    <div className="container uv-2col" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
          <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; {crumb}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "0 0 24px" }}>{title}</h1>
        {children}
        <div style={{ fontSize: 13, color: "#707070", marginTop: 32, paddingTop: 16, borderTop: "1px solid #EAEAEA" }}>
          Last updated {lastUpdated} · Unnati Vidya
        </div>
      </div>

      <aside className="uv-rail" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Questions about any of this?</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 14 }}>
            Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm)
          </div>
          <Link href="/lead?intent=request-callback" data-open-lead className="btn primary" style={{ width: "100%", height: 42, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Request a callback
          </Link>
        </div>
        <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#363634", marginBottom: 10 }}>Related</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            {RELATED_LINKS.map(([href, label]) => (
              <Link href={href} key={href} style={{ color: "#544CC8", fontWeight: 600 }}>{label}</Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
