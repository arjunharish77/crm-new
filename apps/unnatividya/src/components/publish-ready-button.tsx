"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishReadyButton({ revisionIds }: { revisionIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/publish-ready", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revisionIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Publishing failed. No changes were made.");
      setDone(true);
      setMessage(`Published ${result.published} revision${result.published === 1 ? "" : "s"}: ${result.catalog} catalog, ${result.articles} article and ${result.guides} guide. Refreshing the checklist…`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publishing failed. No changes were made.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="bulk-publish-action">
    <button className="btn primary" type="button" onClick={() => void publish()} disabled={busy || done || !revisionIds.length}>
      {busy ? "Publishing…" : done ? "Published" : `Publish all ${revisionIds.length} ready revision${revisionIds.length === 1 ? "" : "s"}`}
    </button>
    {message ? <p role="status" className={done ? "bulk-publish-success" : "bulk-publish-error"}>{message}</p> : null}
  </div>;
}
