import { cache } from "react";
import { pool } from "@/lib/db";
import { buildCatalogSnapshot, catalogReader, type CatalogRow, type CatalogSnapshot } from "@/lib/catalog-snapshot";

// Request-local memoization only. One database snapshot avoids mixing records from different
// editorial transactions. Admin previews read this live result directly.
export const loadLiveCatalogSnapshot = cache(async () => {
  const client=await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const universities=await client.query<CatalogRow>("select * from university where status='PUBLISHED' and is_published=true order by id");
    const courses=await client.query<CatalogRow>("select * from course where status='PUBLISHED' and is_published=true order by id");
    await client.query("commit");
    return buildCatalogSnapshot(universities.rows,courses.rows);
  } catch(error) { await client.query("rollback").catch(()=>{}); throw error; }
  finally { client.release(); }
});

// Last-good snapshot (next-phase plan §8): when the database is unreachable, or a published record
// was changed outside the CMS and no longer validates, public pages keep serving the last
// snapshot this process validated, for up to a day. It is never static seed data, and it lives
// only in this server process, so a restart during an outage still shows the error page.
const LAST_GOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type LastGood = { snapshot:CatalogSnapshot; at:number; warnedAt?:number };
declare global {
  // eslint-disable-next-line no-var
  var unnatiVidyaLastGoodCatalog: LastGood | undefined;
}

function fallback(reason:string) {
  const lastGood=globalThis.unnatiVidyaLastGoodCatalog;
  if(!lastGood || Date.now()-lastGood.at>LAST_GOOD_MAX_AGE_MS) return null;
  if(!lastGood.warnedAt || Date.now()-lastGood.warnedAt>60_000) {
    lastGood.warnedAt=Date.now();
    console.error(`[catalog] Serving the last good catalog from ${new Date(lastGood.at).toISOString()}: ${reason}`);
  }
  return { snapshot:lastGood.snapshot, issues:[] };
}

export const loadCatalogSnapshot = cache(async () => {
  let loaded:Awaited<ReturnType<typeof loadLiveCatalogSnapshot>>;
  try { loaded=await loadLiveCatalogSnapshot(); }
  catch(error) {
    const stale=fallback(error instanceof Error ? error.message : "database error");
    if(stale) return stale;
    throw error;
  }
  if(loaded.snapshot) { globalThis.unnatiVidyaLastGoodCatalog={ snapshot:loaded.snapshot, at:Date.now() }; return loaded; }
  return fallback(`${loaded.issues.length} catalog validation issues`) || loaded;
});

export const getPublishedCatalog = cache(async () => {
  const {snapshot,issues}=await loadCatalogSnapshot();
  if(!snapshot) throw new Error(`Published catalog is invalid (${issues.length} issues). Review CMS catalog readiness.`);
  return catalogReader(snapshot);
});
