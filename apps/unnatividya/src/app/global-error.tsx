"use client";

import PageErrorView from "@/components/page-error-view";

// This fallback replaces the root layout, so it owns its document and styling.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <head>
        <title>Page unavailable | Unnati Vidya</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </head>
      <body style={{ margin: 0, background: "#fff", color: "#363634", fontFamily: "Arial, sans-serif", fontSize: 16 }}>
        <main><PageErrorView {...props} /></main>
      </body>
    </html>
  );
}
