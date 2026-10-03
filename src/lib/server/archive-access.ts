import { canUseModule, type ModuleNeed } from "@/lib/module-access";
import type { ArchiveKindKey } from "@/lib/server/archive-items";

// Role module permissions for the shared archive routes (/api/archive/...), which sit outside the
// modules' own API paths: Smart Views and reports follow the role's Views and Reports levels.
// Rules and templates are admin-only, and admins aren't limited by module levels.
const ARCHIVE_KIND_MODULE: Partial<Record<ArchiveKindKey, string>> = { "saved-view": "views", "custom-report": "reports" };

export function assertArchiveModuleAccess(user: any, kind: ArchiveKindKey, need: ModuleNeed) {
  const moduleKey = ARCHIVE_KIND_MODULE[kind];
  if (moduleKey && !canUseModule(user, moduleKey, need)) throw new Error("FORBIDDEN");
}
