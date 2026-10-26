"use client";

import { useState } from "react";

export function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- A full page load after sign-out drops the client router cache, so no admin page rendered for the old session can be shown again.
    window.location.assign("/admin/login");
  }

  return (
    <button className="btn ghost" type="button" onClick={logout} disabled={busy}>
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
