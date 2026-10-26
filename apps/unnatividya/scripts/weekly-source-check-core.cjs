/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require('node:crypto');

const OFFICIAL_HOSTS = new Set(['onlinemanipal.com', 'www.onlinemanipal.com', 'amityonline.com', 'www.amityonline.com', 'deb.ugc.ac.in']);
const MAX_BYTES = 3 * 1024 * 1024;

function officialSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && OFFICIAL_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function monitoredSources(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const data = row.data || {};
    const urls = [
      ...(Array.isArray(data.sourceUrls) ? data.sourceUrls : []),
      ...['feeReview', 'eligibilityReview', 'curriculumReview', 'categoryFees', 'eligibilityRules', 'recognition']
        .map(field => data[field]?.sourceUrl),
      ...Object.values(data.programDetails || {}).map(detail => detail?.sourceUrl),
      ...(Array.isArray(data.intakes) ? data.intakes.map(intake => intake?.sourceUrl) : []),
    ];
    for (const sourceUrl of urls) {
      if (typeof sourceUrl !== 'string' || !officialSourceUrl(sourceUrl)) continue;
      const key = `${row.entity_type}:${row.id}:${sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ entityType: row.entity_type, entityKey: row.id, sourceUrl });
    }
  }
  return result;
}

function readableHtml(body) {
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
}

function digestSource(bytes, contentType) {
  const type = contentType.toLowerCase();
  if (type.includes('pdf') || bytes.subarray(0, 4).toString() === '%PDF') {
    return { hash: createHash('sha256').update(bytes).digest('hex'), kind: 'pdf', sample: 'PDF document; open the source to review changed clauses.' };
  }
  if (!type.includes('html') && !type.includes('text/plain')) throw Error(`Unsupported source type: ${contentType || 'unknown'}`);
  const text = readableHtml(bytes.toString('utf8'));
  if (text.length < 300) throw Error('Page has too little readable text to compare; check a rendered official page manually.');
  // Whitespace and scripts are excluded so changing tracking code does not create a review draft.
  return { hash: createHash('sha256').update(text).digest('hex'), kind: 'html', sample: text.slice(0, 6000) };
}

async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Source returned an empty body.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Source exceeds the 3 MB capture limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

function comparisonStatus(previousHash, currentHash) {
  return previousHash === currentHash ? 'UNCHANGED' : previousHash ? 'CHANGED' : 'BASELINE';
}

module.exports = { officialSourceUrl, monitoredSources, digestSource, readLimited, comparisonStatus };
