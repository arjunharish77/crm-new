import type { Metadata } from "next";
import Link from "next/link";
import { BlogExplorer } from "@/components/blog-explorer";
import { blogPosts } from "@/data/blog";

export const metadata: Metadata = {
  title: "Online Degree Guides",
  description: "Guides on UGC-approved online degrees, fees, eligibility, and career choices.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return (
    <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Blog
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Guides & resources</h1>
          <div style={{ fontSize: 14, color: "#696868", marginTop: 6 }}>Straight answers on online degrees — validity, fees, careers and admissions.</div>
        </div>
      </div>

      <div style={{ ...shell, paddingTop: 28, paddingBottom: 64, flex: 1 }}>
        <BlogExplorer posts={blogPosts} />

        <div style={{ marginTop: 32, background: "#263238", borderRadius: 8, padding: 28, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>Get admission deadlines in your inbox</div>
            <div style={{ fontSize: 14, color: "#B8C4CA", marginTop: 4 }}>One email a month — batch dates, new programs and scholarship windows.</div>
          </div>
          <Link
            href="/lead?intent=newsletter"
            data-open-lead
            style={{ height: 44, padding: "0 22px", display: "inline-flex", alignItems: "center", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 14, fontWeight: 700 }}
          >
            Subscribe
          </Link>
        </div>
      </div>
    </div>
  );
}
