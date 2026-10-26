export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import { ShortlistView } from "@/components/shortlist-view";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Your Shortlist",
  description: "Courses you've saved for later.",
  robots: { index: false, follow: false },
});

// The hero lives in ShortlistView: its count and actions come from this device's saved list.
export default async function ShortlistPage() {
  const catalog = await getPublishedCatalog();
  const { courses } = catalog;

  return <PublishedCatalogBoundary>{(
    <div className="uv-sl-page">
      <ShortlistView courses={courses} />
    </div>
  )}</PublishedCatalogBoundary>;
}
