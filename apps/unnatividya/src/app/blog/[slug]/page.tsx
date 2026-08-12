import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { blogPosts, getBlogPostBySlug, resolveBlogCover } from "@/data/blog";
import { publicAssetExists } from "@/lib/asset-exists";

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
    openGraph: { title: post.title, description: post.excerpt, images: [resolveBlogCover(post, publicAssetExists)], type: "article" },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();
  const related = blogPosts.filter((item) => item.slug !== post.slug).slice(0, 3);
  const cover = resolveBlogCover(post, publicAssetExists);
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
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[articleJsonLd, breadcrumbJsonLd, faqJsonLd]} />
      <div className="article-layout">
        <article className="article-main">
        <div className="breadcrumb" style={{ marginBottom: 12 }}>
          <Link href="/">Home</Link> &gt; <Link href="/blog">Blog</Link> &gt; {post.category}
        </div>
        <div className="course-meta" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F5BB8", background: "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>{post.category}</span>
          <span style={{ color: "#707070", fontSize: 12 }}>
            {post.read} · Updated{" "}
            {new Date(post.publishedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </span>
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
            src={cover}
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
            if (block.type === "links") return (
              <div key={index} style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, margin: "20px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 10 }}>{block.heading}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {block.items.map((item) => (
                    <Link key={item.href} href={item.href} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{item.label} →</Link>
                  ))}
                </div>
              </div>
            );
            return <p key={index}>{block.text}</p>;
          })}
        </div>

        <section className="detail-section">
          <h2>Frequently asked questions</h2>
          <div className="faq-list">
            {post.faqs.map(([question, answer]) => (
              <details className="faq-item" name="blog-faq" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

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
                <Link href={`/blog/${item.slug}`} key={item.slug} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ position: "relative", width: 56, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                    <Image src={resolveBlogCover(item, publicAssetExists)} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />
                  </span>
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
          <div className="card course-card" style={{ background: "#F4F3FC" }}>
            <h2>Compare UGC-entitled programs</h2>
            <p>Compare fees and approvals side by side.</p>
            <Link href="/compare" className="btn primary" style={{ width: "100%", minHeight: 38, height: 38, fontSize: 13 }}>Open compare</Link>
          </div>
          <div className="card course-card">
            <h2>Sources</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <a href="https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf" target="_blank" rel="noopener noreferrer" style={{ color: "#544CC8" }}>
                UGC-DEB entitlement notification
              </a>
              <Link href="/how-we-verify" style={{ color: "#544CC8", fontWeight: 600 }}>How we verify our data →</Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
