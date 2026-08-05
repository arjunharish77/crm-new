export function normalizeRedirectPath(path: string) {
  const cleaned = path.trim();
  if (!cleaned) return "/";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  const withSlash = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function isInternalPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//");
}
