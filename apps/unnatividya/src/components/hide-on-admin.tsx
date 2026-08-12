"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Wraps server components that have no reason to know about routing (SiteFooter, StickyCtas)
// so the admin CMS's dark sidebar shell doesn't end up sandwiched between the public site's
// marketing footer and floating WhatsApp/callback buttons.
export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
