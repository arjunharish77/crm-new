export function siteUrl() {
  return process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
}

export function searchVerification() {
  return {
    google: process.env.GOOGLE_SITE_VERIFICATION || "",
    bing: process.env.BING_SITE_VERIFICATION || "",
  };
}

export function indexNowConfig() {
  return {
    enabled: process.env.INDEXNOW_ENABLED === "true",
    key: process.env.INDEXNOW_KEY || "",
    keyLocation: process.env.INDEXNOW_KEY_LOCATION || "",
  };
}
