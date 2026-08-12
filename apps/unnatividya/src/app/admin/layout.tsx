import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

async function countRows(table: string) {
  const result = await query<{ count: string }>(`select count(*)::text as count from ${table}`).catch(() => null);
  return result ? Number(result.rows[0]?.count || 0) : 0;
}

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  // /admin/login and /admin/setup must render standalone -- there is no session to check yet,
  // and wrapping them in the sidebar shell would be both pointless and (for login) impossible,
  // since the shell itself needs a session to render nav counts.
  const session = await getAdminSession();
  if (!session) return <>{children}</>;

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
