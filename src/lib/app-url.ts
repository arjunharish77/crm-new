// The app's public address from APP_URL, read safely: stray quotes from hand-editing .env are
// dropped, a bare host ("app.example.com") gets https://, and anything unparseable falls back to
// localhost instead of throwing. (A bad value used to make every page rendered on request --
// the record pages -- fail with "Invalid URL".)
export function appUrl(): URL {
    const raw = String(process.env.APP_URL ?? "").trim().replace(/^['"]+|['"]+$/g, "").trim();
    if (raw) {
        try {
            return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
        } catch {
            // fall through
        }
    }
    return new URL("http://localhost:3000");
}

// The same, as a string without a trailing slash, for building links.
export function appBaseUrlString() {
    return appUrl().toString().replace(/\/$/, "");
}
