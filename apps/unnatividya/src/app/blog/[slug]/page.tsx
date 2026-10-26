export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { resolveBlogCover } from "@/data/blog";
import { ArticleView } from "@/components/article-view";
import { getPublishedArticle, getPublishedArticles } from "@/lib/articles-server";
import { publicAssetExists } from "@/lib/asset-exists";
import { fitTitle, withSocial } from "@/lib/page-metadata";
import { SOCIAL_URLS } from "@/lib/social";



export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedArticle(slug);
  if (!post) return {};
  return withSocial({
    // Editorial titles are kept whole; only the site suffix is dropped when it would overflow.
    title: fitTitle(post.title),
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt, images: [resolveBlogCover(post, publicAssetExists)], type: "article" },
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedArticle(slug);
  if (!post) notFound();
  const related = (await getPublishedArticles()).filter((item) => item.slug !== post.slug).sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category)).slice(0, 3);
  const cover = resolveBlogCover(post, publicAssetExists);
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url: `${siteUrl}/blog/${post.slug}`,
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    image: [`${siteUrl}${cover}`],
    datePublished: post.publishedDate,
    dateModified: post.updatedDate || post.publishedDate,
    author: {
      "@type": "Organization",
      name: "Content Team, Unnati Vidya",
      url: `${siteUrl}/authors/content-team`,
    },
    publisher: {
      "@type": "Organization",
      name: "Unnati Vidya",
      url: siteUrl,
      sameAs: SOCIAL_URLS,
      // A raster logo at least 112px wide; Google does not accept SVG here.
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand/android-chrome-512x512.png`,
        width: 512,
        height: 512,
      },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: `${siteUrl}/blog/${post.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={[articleJsonLd, breadcrumbJsonLd, faqJsonLd]} />
      <ArticleView post={post} related={related} />
    </>
  )}</PublishedCatalogBoundary>;
}
