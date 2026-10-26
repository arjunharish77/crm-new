export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BlogCategoryPills, BlogExplorer } from "@/components/blog-explorer";
import { ToolTiles } from "@/components/hub-tool-tiles";
import { Breadcrumb } from "@/components/reading-page";
import { resolveBlogCover } from "@/data/blog";
import { getPublishedArticles } from "@/lib/articles-server";
import { publicAssetExists } from "@/lib/asset-exists";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Online Learning Articles",
  description: "Articles about online learning, admissions and career choices from Content Team, Unnati Vidya.",
  alternates: { canonical: "/blog" },
});

// Articles hub in the design's hub layout (Guides.dc.html; plan §10 Q11: two hubs).
export default async function BlogPage() {
  const posts = (await getPublishedArticles()).map((post) => ({ ...post, cover: resolveBlogCover(post, publicAssetExists) }));

  return <PublishedCatalogBoundary>{(
    <div className="uv-g-hub">
      <section className="uv-page-hero" aria-labelledby="blog-title">
        <div className="uv-page-hero-inner uv-g-hero">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />
          <h1 id="blog-title" className="uv-h1">Online learning articles</h1>
          <p className="uv-lede">Explore online learning and career choices with Content Team, Unnati Vidya. For degree-specific fees and entry requirements, browse our degree guides.</p>
          <p className="uv-g-note"><Link href="/online-degree-guides">Browse degree guides for fees, eligibility and recognition →</Link></p>
          <BlogCategoryPills posts={posts} />
        </div>
      </section>

      <div className="uv-shell uv-g-main">
        <BlogExplorer posts={posts} />
        <ToolTiles tools={["recommender", "emi", "total-cost"]} />

        <section className="uv-navy-panel uv-g-cta uv-reveal" aria-labelledby="blog-cta-title">
          <div>
            <h2 id="blog-cta-title" className="uv-g-cta-title">Ready to explore your options?</h2>
            <p className="uv-g-cta-copy">Compare courses or leave your details for the team to follow up.</p>
          </div>
          <div className="uv-g-cta-actions">
            <Link href="/courses" className="btn outline-on-navy">Browse courses <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/lead?intent=enquire" rel="nofollow" data-open-lead className="btn on-navy">Apply now</Link>
          </div>
        </section>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
