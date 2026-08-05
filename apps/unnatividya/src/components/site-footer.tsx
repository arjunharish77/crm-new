import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer style={{ background: "#263238", color: "#B8C4CA", marginTop: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 32px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 32 }}>
          <div>
            <Image
              src="/brand/unnatividya-logo-white.svg"
              alt="Unnati Vidya"
              width={174}
              height={32}
              style={{ height: 22, width: "auto", display: "block" }}
            />
            <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 12, maxWidth: 280 }}>
              India&apos;s unbiased marketplace for UGC-entitled online degrees. Compare, get
              counselled, enrol — all free.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <h4 style={{ fontWeight: 700, color: "#fff", fontSize: 14, margin: "0 0 4px" }}>Explore</h4>
            <Link href="/courses" style={{ color: "#B8C4CA" }}>All courses</Link>
            <Link href="/universities" style={{ color: "#B8C4CA" }}>Universities</Link>
            <Link href="/compare" style={{ color: "#B8C4CA" }}>Compare programs</Link>
            <Link href="/recommender" style={{ color: "#B8C4CA" }}>AI recommender</Link>
            <Link href="/online-degree-guides" style={{ color: "#B8C4CA" }}>Fee guides</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <h4 style={{ fontWeight: 700, color: "#fff", fontSize: 14, margin: "0 0 4px" }}>Top courses</h4>
            <Link href="/courses/online-mba-manipal-university-jaipur" style={{ color: "#B8C4CA" }}>Online MBA</Link>
            <Link href="/courses/online-bca-manipal-university-jaipur" style={{ color: "#B8C4CA" }}>Online BCA</Link>
            <Link href="/courses/online-mca-manipal-university-jaipur" style={{ color: "#B8C4CA" }}>Online MCA</Link>
            <Link href="/courses/online-bcom-manipal-university-jaipur" style={{ color: "#B8C4CA" }}>Online B.Com</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <h4 style={{ fontWeight: 700, color: "#fff", fontSize: 14, margin: "0 0 4px" }}>Company</h4>
            <Link href="/blog" style={{ color: "#B8C4CA" }}>Blog & guides</Link>
            <Link href="/about" style={{ color: "#B8C4CA" }}>About us</Link>
            <span>Contact: 1800-120-4050</span>
          </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px", fontSize: 12, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>© 2026 UnnatiVidya Edutech Pvt Ltd</span>
          <span>
            <Link href="/privacy" style={{ color: "#B8C4CA" }}>Privacy</Link> · <Link href="/terms" style={{ color: "#B8C4CA" }}>Terms</Link> ·{" "}
            <Link href="/refund-policy" style={{ color: "#B8C4CA" }}>Refund policy</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
