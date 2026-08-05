import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { SetupForm } from "@/components/setup-form";

export const metadata: Metadata = {
  title: "CMS Setup",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const existing = await query<{ count: string }>("select count(*)::text as count from cms_user");
  if (Number(existing.rows[0]?.count || 0) > 0) {
    redirect("/admin/login");
  }

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="card admin-card">
          <span className="eyebrow">One-time setup</span>
          <h1 className="section-title" style={{ fontSize: 32 }}>
            Create CMS admin
          </h1>
          <p>
            This page works only while no CMS admin exists. The admin account is independent from CRM.
          </p>
          <SetupForm />
        </div>
      </div>
    </section>
  );
}
