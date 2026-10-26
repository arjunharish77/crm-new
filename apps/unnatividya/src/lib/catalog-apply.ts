import type { PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { CatalogValidationError, validatePublishedCatalog } from "@/lib/catalog-write";
import { entityTypeSchema, revisionColumns, revisionContentSchemas, type CatalogRevision } from "@/lib/catalog-revisions";

export const CATALOG_LOCK = 714083291;
export const DIRECT_PUBLISH_NOTE = "Published directly by an administrator.";

export class CatalogApplyConflict extends Error {}

// One apply step for every route that publishes a catalog revision: the administrator review,
// an administrator's direct "Save and publish", and bulk publishing. The caller holds the catalog
// lock inside a transaction. The live record must still match the revision's base snapshot, and the
// whole published catalog is validated before the caller commits (bulk publishing validates once,
// after its last revision).
export async function applyCatalogRevision(client: PoolClient, revisionId: string, adminId: string, note: string, { metadata = {}, validate = true }: { metadata?: Record<string, unknown>; validate?: boolean } = {}) {
  const revision = (await client.query<CatalogRevision>("select * from catalog_revision where id=$1 for update", [revisionId])).rows[0];
  if (!revision || revision.status !== "NEEDS_REVIEW") throw new CatalogApplyConflict("This revision isn't waiting for review.");
  const type = entityTypeSchema.parse(revision.entity_type);
  const content = revisionContentSchemas[type].parse(revision.proposed_content) as Record<string, unknown>;
  const current = (await client.query<{ snapshot: Record<string, unknown> }>(`select to_jsonb(t) as snapshot from ${type} t where id=$1 for update`, [revision.entity_id])).rows[0]?.snapshot;
  if (!current || !isDeepStrictEqual(current, revision.base_snapshot)) throw new CatalogApplyConflict("Catalog changed since this proposal. Create a new revision from the latest record; nothing was applied.");
  if (current.is_published && current.slug !== content.slug) throw new CatalogValidationError([{ entityType: type, entityId: revision.entity_id, field: "slug", message: "Published URLs are locked until a reviewed redirect workflow is available." }]);
  const columns = revisionColumns[type];
  await client.query(`update ${type} set ${columns.map((key, i) => `${key}=$${i + 1}`).join(",")}, updated_at=now() where id=$${columns.length + 1}`, [...columns.map(key => content[key]), revision.entity_id]);
  if (validate) await validatePublishedCatalog(client);
  await client.query("update catalog_revision set status='APPLIED',reviewed_by=$1,review_note=$2,reviewed_at=now() where id=$3", [adminId, note, revisionId]);
  await client.query(`insert into cms_audit_log(user_id,action,entity_type,entity_id,metadata) values($1,'CATALOG_REVISION_APPLIED','catalog_revision',$2,$3)`,
    [adminId, revisionId, { entityType: revision.entity_type, entityId: revision.entity_id, note, rollbackOf: revision.rollback_of, ...metadata }]);
  return revision;
}
