import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
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
    <section className="admin-shell admin-auth">
      <div className="container">
        <div className="card admin-card">
          <Image src="/brand/unnatividya-logo-gradient.svg" alt="Unnati Vidya" width={172} height={28} className="admin-auth-logo" priority />
          <span className="eyebrow">One-time setup</span>
          <h1 className="admin-auth-title">
            Create CMS admin
          </h1>
          <p>
            Create the first website administrator. Setup is available only before a CMS account exists. This account is separate from your CRM login.
          </p>
          <SetupForm />
        </div>
      </div>
    </section>
  );
}
