import { cache } from "react";
import { pool } from "@/lib/db";
import { buildCatalogSnapshot, catalogReader, type CatalogRow } from "@/lib/catalog-snapshot";

// Request-local memoization only. One database snapshot avoids mixing records from different
// editorial transactions. Connection/validation failures never silently restore stale seed data.
export const loadCatalogSnapshot = cache(async () => {
  const client=await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const universities=await client.query<CatalogRow>("select * from university where status='PUBLISHED' and is_published=true order by id");
    const courses=await client.query<CatalogRow>("select * from course where status='PUBLISHED' and is_published=true order by id");
    await client.query("commit");
    return buildCatalogSnapshot(universities.rows,courses.rows);
  } catch(error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
});

export const getPublishedCatalog = cache(async () => {
  const {snapshot,issues}=await loadCatalogSnapshot();
  if(!snapshot) throw new Error(`Published catalog is invalid (${issues.length} issues). Review CMS catalog readiness.`);
  return catalogReader(snapshot);
});
