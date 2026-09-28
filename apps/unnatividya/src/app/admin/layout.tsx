import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PUBLIC_ADMIN_PAGE_PATHS = new Set(["/admin/login", "/admin/setup"]);

async function countRows(table: string) {
  const result = await query<{ count: string }>(`select count(*)::text as count from ${table}`).catch(() => null);
  return result ? Number(result.rows[0]?.count || 0) : 0;
}

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    // /admin/login and /admin/setup must render standalone -- there is no session to check yet,
    // and wrapping them in the sidebar shell would be both pointless and (for login) impossible,
    // since the shell itself needs a session to render nav counts.
    const pathname = (await headers()).get("x-uv-admin-pathname") || "";
    if (PUBLIC_ADMIN_PAGE_PATHS.has(pathname)) return <>{children}</>;

    // F26 fix (WP16): every other admin page used to fall through to this same branch too --
    // proxy.ts's own (cheaper, DB-less) cookie check can still pass a token that this
    // authoritative, DB-backed getAdminSession() rejects (a deactivated admin, or a forced
    // revocation via session_valid_after). That used to silently render the real page content
    // with no sidebar instead of denying access -- redirect to login instead, exactly like
    // proxy.ts does for a missing/expired cookie.
    redirect("/admin/login");
  }

  const [leads, courses, universities] = await Promise.all([
    countRows("lead_capture"),
    countRows("course"),
    countRows("university"),
  ]);

  const counts: Record<string, number> = { Leads: leads, Courses: courses, Universities: universities };

  return (
    <AdminSidebar session={session} counts={counts}>
      {children}
    </AdminSidebar>
  );
}
