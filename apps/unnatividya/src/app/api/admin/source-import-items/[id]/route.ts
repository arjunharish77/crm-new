import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const schema = z.object({
  action: z.enum(["MARK_REVIEWED", "APPLY_TO_CATALOG", "SKIP"]),
});

type ImportItem = {
  id: string;
  entity_type: string;
  entity_key: string;
  source_url: string;
  raw_data: Record<string, unknown>;
  review_status: string;
};

function sourceReviewPayload(item: ImportItem) {
  const rawData = item.raw_data || {};
  const parsed = (rawData.parsed || {}) as Record<string, unknown>;
  return {
    sourceUrl: item.source_url,
    sourceName: rawData.sourceName,
    mode: rawData.mode,
    importedAt: new Date().toISOString(),
    parsedTitle: parsed.title || null,
    parsedDescription: parsed.description || null,
    facts: parsed.facts || {},
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid source import action" }, { status: 400 });
  }

  const itemResult = await query<ImportItem>(
    `select id, entity_type, entity_key, source_url, raw_data, review_status
     from source_import_item
     where id = $1
     limit 1`,
    [id],
  );
  const item = itemResult.rows[0];
  if (!item) {
    return NextResponse.json({ error: "Source import item not found" }, { status: 404 });
  }

  if (parsed.data.action === "SKIP") {
    await query("update source_import_item set review_status = 'SKIPPED' where id = $1", [id]);
    await audit("SOURCE_IMPORT_ITEM_SKIPPED", item);
    return NextResponse.json({ message: "Import item skipped." });
  }

  if (parsed.data.action === "MARK_REVIEWED") {
    await query("update source_import_item set review_status = 'REVIEWED' where id = $1", [id]);
    await audit("SOURCE_IMPORT_ITEM_REVIEWED", item);
    return NextResponse.json({ message: "Import item marked reviewed." });
  }

  const mode = String(item.raw_data?.mode || "");
  if (mode === "REFERENCE_TAXONOMY_ONLY" || item.entity_type === "reference_taxonomy") {
    return NextResponse.json({ error: "Reference-only source rows cannot be applied to catalog." }, { status: 400 });
  }

  const payload = sourceReviewPayload(item);
  if (item.entity_type === "course") {
    const updated = await query(
      `update course
       set data = jsonb_set(data, '{sourceReview}', $1::jsonb, true),
           status = case when status = 'DRAFT' then 'NEEDS_REVIEW' else status end,
           updated_at = now()
       where id = $2`,
      [payload, item.entity_key],
    );
    if (!updated.rowCount) {
      return NextResponse.json({ error: "Target course not found." }, { status: 404 });
    }
  } else if (item.entity_type === "university") {
    const updated = await query(
      `update university
       set data = jsonb_set(data, '{sourceReview}', $1::jsonb, true),
           status = case when status = 'DRAFT' then 'NEEDS_REVIEW' else status end,
           updated_at = now()
       where id = $2`,
      [payload, item.entity_key],
    );
    if (!updated.rowCount) {
      return NextResponse.json({ error: "Target university not found." }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: `Cannot apply entity type ${item.entity_type}.` }, { status: 400 });
  }

  await query("update source_import_item set review_status = 'APPLIED' where id = $1", [id]);
  await audit("SOURCE_IMPORT_ITEM_APPLIED", item, payload);
  return NextResponse.json({ message: "Parsed source facts applied to catalog sourceReview." });
}

async function audit(action: string, item: ImportItem, metadata: Record<string, unknown> = {}) {
  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ($1, 'source_import_item', $2, $3)`,
    [action, item.id, { entityType: item.entity_type, entityKey: item.entity_key, ...metadata }],
  );
}
