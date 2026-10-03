import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { CatalogReviewQueue, type QueueParams } from "@/components/catalog-review-queue";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Universities",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type UniversityRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  city: string | null;
  status: string;
  is_published: boolean;
  updated_at: string;
};

export default async function AdminUniversitiesPage({ searchParams }: { searchParams: Promise<QueueParams> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const universities = await query<UniversityRow>(`select id, slug, name, short_name, city, status, is_published, updated_at from university order by name, id`);
  return <CatalogReviewQueue type="university" canCreate={session.role !== "VIEWER"} params={await searchParams} records={universities.rows.map(university => ({
    id: university.id, name: university.name, searchText: `${university.name} ${university.id} ${university.short_name}`, status: university.status, published: university.is_published,
    fields: [{ label: "City", value: university.city || "Not provided" }, { label: "URL slug", value: university.slug }, { label: "Updated (India time)", value: new Date(university.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) }],
  }))} />;
}
