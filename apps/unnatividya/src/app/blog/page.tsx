export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { BlogExplorer } from "@/components/blog-explorer";
import { blogPosts, resolveBlogCover } from "@/data/blog";
import { publicAssetExists } from "@/lib/asset-exists";

export const metadata: Metadata = {
  title: "Online Learning Articles",
  description: "Articles about online learning, admissions and career choices from Content Team, Unnati Vidya.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };
  const posts = blogPosts.map((post) => ({ ...post, cover: resolveBlogCover(post, publicAssetExists) }));

  return <PublishedCatalogBoundary>{(
    <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Blog
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Online learning articles</h1>
          <div style={{ fontSize: 14, color: "#696868", marginTop: 6 }}>Explore online learning and career choices with Content Team, Unnati Vidya. For degree-specific fees and entry requirements, browse our degree guides.</div>
        </div>
      </div>

      <div style={{ ...shell, paddingTop: 28, paddingBottom: 64, flex: 1 }}>
        <p><Link href="/online-degree-guides">Browse degree guides for fees, eligibility and recognition →</Link></p>
        <BlogExplorer posts={posts} />

        <div style={{ marginTop: 32, background: "#263238", borderRadius: 8, padding: 28, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>Ready to explore your options?</div>
            <div style={{ fontSize: 14, color: "#B8C4CA", marginTop: 4 }}>Compare courses or leave your details for the team to follow up.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 360 }}>
            <Link href="/courses" className="btn ghost" style={{color:"#fff",borderColor:"#B8C4CA"}}>Browse courses</Link>
            <Link
              href="/lead?intent=enquire"
              data-open-lead
              style={{ height: 44, padding: "0 22px", display: "inline-flex", alignItems: "center", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Apply now
            </Link>
          </div>
        </div>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
