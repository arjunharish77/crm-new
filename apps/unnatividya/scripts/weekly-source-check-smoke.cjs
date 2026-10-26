/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { officialSourceUrl, monitoredSources, digestSource, readLimited, comparisonStatus } = require('./weekly-source-check-core.cjs');
const { capture } = require('./weekly-source-check.js');

(async () => {
  assert.equal(officialSourceUrl('https://www.onlinemanipal.com/online-mba-manipal-university-jaipur'), true);
  for (const url of ['http://amityonline.com/', 'https://amityonline.com.evil.test/', 'https://127.0.0.1/', 'https://x@amityonline.com/', 'https://amityonline.com:444/']) assert.equal(officialSourceUrl(url), false);
  const rows = [{ entity_type: 'course', id: 'mba-muj', data: { sourceUrls: ['https://www.onlinemanipal.com/mba', 'https://www.onlinemanipal.com/mba', 'https://example.test/'], categoryFees: { sourceUrl: 'https://www.onlinemanipal.com/fees.pdf' } } }];
  assert.deepEqual(monitoredSources(rows), [
    { entityType: 'course', entityKey: 'mba-muj', sourceUrl: 'https://www.onlinemanipal.com/mba' },
    { entityType: 'course', entityKey: 'mba-muj', sourceUrl: 'https://www.onlinemanipal.com/fees.pdf' },
  ]);
  const html = '<html><script>track(1)</script><style>body{color:red}</style><h1>MBA</h1><p>' + 'Official eligibility text. '.repeat(20) + '</p></html>';
  const a = digestSource(Buffer.from(html), 'text/html');
  const b = digestSource(Buffer.from(html.replace('track(1)', 'track(2)').replace('color:red', 'color:blue')), 'text/html');
  assert.equal(a.hash, b.hash);
  assert.equal(comparisonStatus(null, a.hash), 'BASELINE');
  assert.equal(comparisonStatus(a.hash, b.hash), 'UNCHANGED');
  assert.equal(comparisonStatus(a.hash, digestSource(Buffer.from(html.replace('Official eligibility', 'Changed eligibility')), 'text/html').hash), 'CHANGED');
  assert.equal(digestSource(Buffer.from('%PDF-1.7 test'), 'application/pdf').kind, 'pdf');
  assert.throws(() => digestSource(Buffer.from('<html>empty</html>'), 'text/html'), /too little readable text/);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });
  assert.deepEqual(await readLimited({ body: stream }), Buffer.from([1, 2, 3]));
  const queries = [];
  const db = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('select sii.source_hash')) return { rows: [] };
    if (sql.includes('insert into source_import(')) return { rows: [{ id: 'fixture-import' }] };
    return { rows: [] };
  } };
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    assert.equal(await capture(db, { entityType: 'course', entityKey: 'mba-muj', sourceUrl: 'https://www.onlinemanipal.com/mba' }), 'BASELINE');
    assert.equal(queries.some(q => q.sql.includes('insert into source_import_item') && q.params[5].mode === 'WEEKLY_EVIDENCE_ONLY'), true);
    assert.equal(queries.some(q => /update\s+(course|university|article)\b/i.test(q.sql)), false);
    queries.length = 0;
    global.fetch = async () => new Response('Moved', { status: 302, headers: { location: 'https://example.test/' } });
    assert.equal(await capture(db, { entityType: 'course', entityKey: 'mba-muj', sourceUrl: 'https://www.onlinemanipal.com/mba' }), 'FAILED');
    assert.equal(queries.some(q => q.sql.includes('insert into source_import_item')), false);
  } finally { global.fetch = originalFetch; }
  console.log('PASS weekly source-check safety, manifest, normalization and comparison checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
