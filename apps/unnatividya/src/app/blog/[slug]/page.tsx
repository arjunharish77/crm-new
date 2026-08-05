import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { blogPosts, getBlogPostBySlug } from "@/data/blog";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt, images: [post.cover], type: "article" },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();
  const related = blogPosts.filter((item) => item.slug !== post.slug).slice(0, 3);
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url: `${siteUrl}/blog/${post.slug}`,
    datePublished: post.publishedDate,
    dateModified: post.publishedDate,
    author: {
      "@type": "Person",
      name: "Ritika Desai",
      jobTitle: "Senior education counsellor, Unnati Vidya",
    },
    publisher: {
      "@type": "Organization",
      name: "Unnati Vidya",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand/unnatividya-logo-gradient.svg`,
      },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.category, item: `${siteUrl}/blog/${post.slug}` },
    ],
  };

  return (
    <>
      <JsonLd data={[articleJsonLd, breadcrumbJsonLd]} />
      <div className="article-layout" style={{ maxWidth: 1080, paddingTop: 40, paddingBottom: 64, gridTemplateColumns: "1fr 300px", gap: 48 }}>
        <article className="article-main">
        <div className="breadcrumb" style={{ marginBottom: 12 }}>
          <Link href="/">Home</Link> &gt; <Link href="/blog">Blog</Link> &gt; {post.category}
        </div>
        <div className="course-meta" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4FA8FF", background: "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>{post.category}</span>
          <span style={{ color: "#AAAAAA", fontSize: 12 }}>{post.read} · Updated 14 July 2026</span>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: "#363634", margin: "0 0 16px", lineHeight: 1.2, textWrap: "pretty" }}>{post.title}</h1>
        <div className="author-row">
          <div className="author-avatar">RD</div>
          <div>
            <strong>Ritika Desai</strong>
            <span>Senior education counsellor, UnnatiVidya</span>
          </div>
        </div>
        <div className="article-cover" style={{ height: 280, borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
          <Image
            src={post.cover}
            alt={post.title}
            width={900}
            height={480}
            sizes="(max-width: 980px) 100vw, 760px"
            priority
          />
        </div>

        <div className="article-body">
          {post.body.map((block, index) => {
            if (block.type === "h2") return <h2 key={index}>{block.text}</h2>;
            if (block.type === "note") return (
              <div className="note-box" key={index}>
                <b>Unnati Vidya tip:</b> {block.text.replace(/^Unnati Vidya tip:\s*/i, "")}
              </div>
            );
            if (block.type === "image") return (
              <div style={{ height: 220, borderRadius: 8, overflow: "hidden", position: "relative" }} key={index}>
                <Image src={block.src} alt={block.alt} fill sizes="(max-width: 980px) 100vw, 760px" style={{ objectFit: "cover" }} />
              </div>
            );
            return <p key={index}>{block.text}</p>;
          })}
        </div>

        <div className="newsletter-band article-cta">
          <div>
            <h2>Want us to verify a program for you?</h2>
            <p>Free check against approval, fee, eligibility, and admission requirements.</p>
          </div>
          <Link href="/lead?intent=article-help" className="btn primary" data-open-lead style={{ minHeight: 42, height: 42, padding: "0 22px" }}>Ask a counsellor</Link>
        </div>
        </article>

        <aside className="article-rail">
          <div className="card course-card">
            <h2>More from the blog</h2>
            <div className="article-rail-links">
              {related.map((item) => (
                <Link href={`/blog/${item.slug}`} key={item.slug}>{item.title}</Link>
              ))}
            </div>
          </div>
          <div className="card course-card" style={{ background: "#F4F3FC" }}>
            <h2>Compare UGC-entitled programs</h2>
            <p>Compare fees and approvals side by side.</p>
            <Link href="/compare" className="btn primary" style={{ width: "100%", minHeight: 38, height: 38, fontSize: 13 }}>Open compare</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
