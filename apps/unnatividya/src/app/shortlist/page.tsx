export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ShortlistView } from "@/components/shortlist-view";

export const metadata: Metadata = {
  title: "Your Shortlist",
  description: "Courses you've saved for later.",
  robots: { index: false, follow: false },
};

export default async function ShortlistPage() {
  const catalog = await getPublishedCatalog();
  const { courses } = catalog;
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return <PublishedCatalogBoundary>{(
    <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Shortlist
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Your shortlist</h1>
        </div>
      </div>
      <div style={{ ...shell, paddingTop: 28, paddingBottom: 64, flex: 1 }}>
        <ShortlistView courses={courses} />
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
