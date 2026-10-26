import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "@/data/blog";
import { resolveBlogCover } from "@/data/blog";
import { publicAssetExists } from "@/lib/asset-exists";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { SocialLinks } from "@/components/social-links";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { formatCheckedDate } from "@/lib/source-checks";

// The article as readers see it, shared by the public page and the CMS preview so a draft looks
// exactly like what will be published (decision 8). Layout: Article.dc.html (880px reading column,
// single column; the old right rail now sits in the flow), with the owner rules from plan §5 #12.
const DEFAULT_SOURCE = { label: "UGC-DEB list of HEIs entitled to offer online programmes (2026-27)", url: "https://deb.ugc.ac.in/pdf/HomePageRecognitionDetail/140/140_upload_RecognitionDetails_20260922125253.pdf" };

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function ArticleView({ post, related }: { post: BlogPost; related: BlogPost[] }) {
  const sections = post.body.flatMap((block, index) => block.type === "h2" ? [{ id: `article-section-${index}`, title: block.text }] : []);
  const cover = resolveBlogCover(post, publicAssetExists);
  const contents = [
    ...sections.map(section => ({ href: `#${section.id}`, label: section.title })),
    ...(post.faqs.length ? [{ href: "#article-faq", label: "Frequently asked questions" }] : []),
    { href: "#article-sources", label: "Sources" },
  ];
  return (
    <article className="uv-read" id="article-top">
      <ReadingHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: post.category }]}
        tag={post.category}
        title={post.title}
        deck={post.excerpt}
        meta={<>
          <Byline />
          <span>Published <time dateTime={post.publishedDate}>{longDate(post.publishedDate)}</time></span>
          {post.updatedDate ? <span>Updated <time dateTime={post.updatedDate}>{longDate(post.updatedDate)}</time></span> : null}
          <span>{post.read}</span>
          <a href="#article-sources" className="uv-read-meta-link">Sources</a>
        </>}
      />

      <div className="uv-read-body">
        <div className="uv-read-cover">
          <Image src={cover} alt={post.title} width={900} height={480} sizes="(max-width: 880px) calc(100vw - 32px), 816px" priority />
        </div>

        <ReadingToc label="On this page" navLabel="Article sections" items={contents} />

        <div className="uv-read-prose">
          {post.body.map((block, index) => {
            if (block.type === "h2") return <h2 id={`article-section-${index}`} tabIndex={-1} key={index} className="uv-read-h2">{block.text}</h2>;
            if (block.type === "note") return (
              <aside className="uv-read-note" key={index} aria-label="Unnati Vidya tip">
                <b>Unnati Vidya tip:</b> {block.text.replace(/^Unnati Vidya tip:\s*/i, "")}
              </aside>
            );
            if (block.type === "image") return (
              <div className="uv-read-figure" key={index}>
                <Image src={block.src} alt={block.alt} fill sizes="(max-width: 880px) calc(100vw - 32px), 816px" />
              </div>
            );
            if (block.type === "links") return (
              <nav className="uv-read-linkbox" key={index} aria-label={block.heading}>
                <p className="uv-read-linkbox-title">{block.heading}</p>
                <ul>
                  {block.items.map(item => <li key={item.href}><Link href={item.href}>{item.label} <span aria-hidden="true">→</span></Link></li>)}
                </ul>
              </nav>
            );
            return <p key={index}>{block.text}</p>;
          })}
        </div>

        {post.faqs.length ? <div className="uv-read-section">
          <FaqAccordion id="article-faq" name="blog-faq" items={post.faqs} subtitle={null} />
        </div> : null}

        <ReadingApplyCta
          title="Explore courses for your next step"
          copy={<>Browse course details or leave your enquiry for the team to follow up. You can also <Link href="/compare">compare fees and approvals side by side</Link>.</>}
          href="/lead?intent=article-help"
          secondary={<Link href="/courses" className="btn secondary">Explore courses</Link>}
        />

        <div className="uv-read-section">
          <NewsletterSignup variant="article" />
          <div className="uv-read-follow"><p>Follow Unnati Vidya</p><SocialLinks variant="labelled" /></div>
        </div>

        <section className="uv-read-section uv-read-sources" id="article-sources" tabIndex={-1} aria-labelledby="article-sources-title">
          <h2 id="article-sources-title" className="uv-read-h2 is-small">Sources</h2>
          <ul className="uv-read-source-list">
            {post.sources?.length ? post.sources.map(source => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                <span className="uv-read-source-date">Checked {formatCheckedDate(source.checkedAt)}</span>
              </li>
            )) : (
              <li><a href={DEFAULT_SOURCE.url} target="_blank" rel="noopener noreferrer">{DEFAULT_SOURCE.label}</a></li>
            )}
          </ul>
          <p className="uv-read-verify"><Link href="/how-we-verify">How we verify our data →</Link></p>
        </section>

        <RelatedRows id="article-related" title="More from the blog" items={related.map(item => ({
          href: `/blog/${item.slug}`,
          label: item.title,
          thumb: <Image src={resolveBlogCover(item, publicAssetExists)} alt="" fill sizes="56px" />,
        }))} />

        <a href="#article-top" className="uv-read-back">Back to article start ↑</a>
      </div>
    </article>
  );
}
