// The externally reachable CRM origin. Plivo signs this exact URL, so never infer it from
// an incoming Host header or silently replace it with an internal container address.
export function publicAppOrigin() {
    const value = (process.env.APP_URL ?? "").trim();
    if (!value) throw new Error("PUBLIC_APP_URL_MISSING");
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("PUBLIC_APP_URL_INVALID");
    }
    if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("PUBLIC_APP_URL_INVALID");
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL_HTTPS_REQUIRED");
    return url.origin;
}
