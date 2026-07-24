export type DataAccessMode = "supabase" | "postgres";

export function getDataAccessMode(): DataAccessMode {
  return process.env.DATA_ACCESS_MODE === "postgres" ? "postgres" : "supabase";
}

export function isPostgresMode() {
  return getDataAccessMode() === "postgres";
}
