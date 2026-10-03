import type { CatalogEntityType } from "./catalog-revisions";
export type CatalogWorkingDraft = {
  id: string; entity_type: CatalogEntityType; entity_id: string;
  base_snapshot: Record<string, unknown>; proposed_content: Record<string, unknown>;
  reason: string; version: number;
};
