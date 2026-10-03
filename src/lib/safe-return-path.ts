// Where to send someone after they sign in (UI/UX plan B16). Links from emails and notifications
// reach /login as ?from=<path>; only a same-origin app path is ever used, so a crafted link can't
// send people to another site after they sign in.
const NEVER_RETURN_TO = ["/login", "/register", "/api", "/reset-password", "/bootstrap"];

export function safeReturnPath(from: string | null | undefined, origin: string): string | null {
    if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return null;
    let url: URL;
    try {
        url = new URL(from, origin);
    } catch {
        return null;
    }
    if (url.origin !== origin) return null;
    if (NEVER_RETURN_TO.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
}

// The /login URL that brings the user back to where they are now.
export function loginPathFromHere(extra?: Record<string, string>): string {
    if (typeof window === "undefined") return "/login";
    const params = new URLSearchParams(extra);
    const here = `${window.location.pathname}${window.location.search}`;
    if (safeReturnPath(here, window.location.origin)) params.set("from", here);
    const qs = params.toString();
    return qs ? `/login?${qs}` : "/login";
}
