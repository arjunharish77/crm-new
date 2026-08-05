"use client";

import { useState } from "react";

export function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/admin/login");
  }

  return (
    <button className="btn ghost" type="button" onClick={logout} disabled={busy}>
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
