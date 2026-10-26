// Cron-safe evidence capture. This never updates course/university/article content or submits
// catalog revisions: a human checks changed official pages and proposes factual edits in CMS.
const { Client } = require('pg');
const { monitoredSources, officialSourceUrl, digestSource, readLimited, comparisonStatus } = require('./weekly-source-check-core.cjs');

async function capture(client, source) {
  const previous = (await client.query(`select sii.source_hash from source_import_item sii
    join source_import si on si.id=sii.source_import_id
    where sii.entity_type=$1 and sii.entity_key=$2 and sii.source_url=$3
      and si.metadata->>'workflow'='weekly-source-check'
    order by sii.created_at desc, sii.id desc limit 1`,
  [source.entityType, source.entityKey, source.sourceUrl])).rows[0]?.source_hash || null;
  const importRow = (await client.query(`insert into source_import(source_name,source_url,status,metadata)
    values($1,$2,'FETCHING',$3) returning id`,
  ['WEEKLY_OFFICIAL_SOURCE', source.sourceUrl, { workflow: 'weekly-source-check', entityType: source.entityType, entityKey: source.entityKey }])).rows[0];
  try {
    const response = await fetch(source.sourceUrl, {
      headers: { 'User-Agent': 'UnnatiVidyaSourceReviewBot/1.0 (+https://unnatividya.com)', Accept: 'text/html,application/pdf,text/plain' },
      signal: AbortSignal.timeout(15000), redirect: 'manual',
    });
    // No automatic cross-host redirect: redirects may leave the approved official domains.
    if (response.status >= 300 && response.status < 400) {
      const target = new URL(response.headers.get('location') || '', source.sourceUrl);
      throw Error(officialSourceUrl(target.href) ? `Official source moved to ${target.href}; update the CMS source URL after review.` : 'Source redirected outside the approved official hosts.');
    }
    if (!response.ok) throw Error(`Official source returned HTTP ${response.status}.`);
    const body = await readLimited(response);
    const result = digestSource(body, response.headers.get('content-type') || '');
    const comparison = comparisonStatus(previous, result.hash);
    if (comparison !== 'UNCHANGED') {
      await client.query(`insert into source_import_item(source_import_id,entity_type,entity_key,source_url,source_hash,raw_data,review_status)
        values($1,$2,$3,$4,$5,$6,'NEEDS_REVIEW')`, [importRow.id, source.entityType, source.entityKey, source.sourceUrl, result.hash,
        { mode: 'WEEKLY_EVIDENCE_ONLY', sourceName: 'WEEKLY_OFFICIAL_SOURCE', fetchedAt: new Date().toISOString(), comparison, previousHash: previous,
          parsed: { title: comparison === 'BASELINE' ? 'First captured version' : 'Official source changed', facts: { captureType: result.kind, comparison, excerpt: result.sample } } }]);
    }
    await client.query(`update source_import set status=$2, metadata=metadata||$3::jsonb where id=$1`,
      [importRow.id, comparison === 'UNCHANGED' ? 'UNCHANGED' : 'FETCHED', { comparison, currentHash: result.hash, previousHash: previous, contentType: result.kind }]);
    return comparison;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Fetch failed';
    await client.query(`update source_import set status='FAILED', metadata=metadata||$2::jsonb where id=$1`, [importRow.id, { error: message }]);
    return 'FAILED';
  }
}

async function main() {
  const connectionString = process.env.UNNATIVIDYA_DATABASE_URL;
  if (!connectionString) throw Error('UNNATIVIDYA_DATABASE_URL is required.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Prevent overlapping cron/manual runs without adding a migration or a shared secret.
    const lock = (await client.query('select pg_try_advisory_lock(8501202601) as locked')).rows[0].locked;
    if (!lock) throw Error('Another weekly source check is still running.');
    const rows = (await client.query(`select 'course' as entity_type,id,data from course where status='PUBLISHED' and is_published=true
      union all select 'university' as entity_type,id,data from university where status='PUBLISHED' and is_published=true`)).rows;
    const sources = monitoredSources(rows);
    const counts = { BASELINE: 0, CHANGED: 0, UNCHANGED: 0, FAILED: 0 };
    for (const source of sources) {
      const status = await capture(client, source);
      counts[status]++;
      console.log(`${status} ${source.entityType}:${source.entityKey} ${source.sourceUrl}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log(`Weekly official-source check complete: ${sources.length} sources, ${JSON.stringify(counts)}. Review drafts in CMS → Source imports.`);
    if (counts.FAILED) process.exitCode = 1;
  } finally { await client.end(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { capture, main };
