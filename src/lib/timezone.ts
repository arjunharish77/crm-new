// Deliberately zero-dependency (no db/query import, unlike date-format.ts which needs one for
// per-tenant timezone lookups) so modules that must stay client-safe -- e.g. query-filters.ts,
// imported by the client-side AdvancedFilterDrawer -- can use this same reference timezone
// without accidentally pulling the Postgres driver into a browser bundle.
export const DEFAULT_SERVER_TIME_ZONE = "Asia/Kolkata";
