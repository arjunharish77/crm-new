// The one public address of a form (UI/UX plan §5.13): /f/{slug}. The older /public-form/{id}
// address still works (same form) and shows /f/{slug} in the address bar.
export const publicFormPath = (slug: string) => `/f/${slug}`;
export const publicFormUrl = (slug: string) => `${typeof window === "undefined" ? "" : window.location.origin}${publicFormPath(slug)}`;
