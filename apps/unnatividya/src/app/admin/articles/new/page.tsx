import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArticleEditor } from "@/components/article-editor";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New article", robots: { index: false, follow: false, nocache: true } };

export default async function NewArticlePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const today = new Date().toISOString().slice(0, 10);
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Articles</span><h1>New article</h1><p>The byline is always Content Team, Unnati Vidya. Draft from official sources and add them under Sources.</p></div></div>
    <ArticleEditor canEdit={session.role !== "VIEWER"} canPublish={session.role === "ADMIN"} hasDraft={false} initialReason="New article"
      initial={{ title: "", category: "Validity", excerpt: "", cover: "/blog/ugc-approved-online-degree-guide.webp", publishedDate: today, body: [{ type: "p", text: "" }], faqs: [], sources: [] }} />
  </div></section>;
}
