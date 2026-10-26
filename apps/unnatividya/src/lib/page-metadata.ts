import type { Metadata } from "next";

const SITE_NAME = "Unnati Vidya";
const DEFAULT_IMAGE = "/brand/og-default.jpg";

// Every indexable page sets its own canonical; this derives the matching Open Graph tags from it
// (technical SEO review H4/H5). The layout no longer supplies a canonical or og:url, so a page
// that forgets one gets none, rather than silently pointing at the homepage.
export function withSocial(metadata: Metadata): Metadata {
  const canonical = metadata.alternates?.canonical;
  const url = typeof canonical === "string" ? canonical : canonical instanceof URL ? canonical.toString() : undefined;
  const title = typeof metadata.title === "string" ? metadata.title
    : metadata.title && typeof metadata.title === "object" && "absolute" in metadata.title ? metadata.title.absolute : undefined;
  const page = metadata.openGraph || {};
  return {
    ...metadata,
    openGraph: {
      siteName: SITE_NAME,
      type: "website",
      images: [DEFAULT_IMAGE],
      ...(title ? { title } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...page,
      ...(url ? { url } : {}),
    },
  };
}

const TITLE_SUFFIX = " | Unnati Vidya";
const TITLE_LIMIT = 60;

// The first (most informative) candidate that fits in 60 characters with the site suffix; then
// the first that fits without it; otherwise the shortest, without the suffix (review M7).
export function fitTitle(...candidates: string[]): Metadata["title"] {
  const withSuffix = candidates.find((title) => (title + TITLE_SUFFIX).length <= TITLE_LIMIT);
  if (withSuffix) return withSuffix;
  const bare = candidates.find((title) => title.length <= TITLE_LIMIT) || [...candidates].sort((a, b) => a.length - b.length)[0];
  return { absolute: bare };
}

// ₹1,80,000 → "₹1.8L" for titles, where space is tight.
export function lakh(amount: number) {
  return `₹${Number((amount / 100000).toFixed(2)).toString()}L`;
}

export function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}
