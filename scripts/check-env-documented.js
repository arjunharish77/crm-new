/* eslint-disable no-console */
// Round-2 plan O2: every setting the app or the worker reads must be listed in
// deploy/vps/.env.example (set, or commented out with its default), so nothing new reaches
// production undocumented. CI runs this on every push.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const IGNORED = new Set(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE", "CI", "PORT", "HOSTNAME", "npm_package_version"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sources = [...walk(path.join(root, "src")), path.join(root, "scripts", "worker.ts")];
const read = new Map();
for (const file of sources) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[["']([A-Z][A-Z0-9_]+)["']\]/g)) {
    const name = match[1] || match[2];
    if (!IGNORED.has(name) && !read.has(name)) read.set(name, path.relative(root, file));
  }
}

const documented = new Set();
for (const line of fs.readFileSync(path.join(root, "deploy", "vps", ".env.example"), "utf8").split("\n")) {
  const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/);
  if (match) documented.add(match[1]);
}

const missing = [...read].filter(([name]) => !documented.has(name));
if (missing.length) {
  console.error("Settings read by the code but not in deploy/vps/.env.example:");
  for (const [name, file] of missing) console.error(`  - ${name} (first read in ${file})`);
  console.error("Add each one there (set, or commented out with its default and a one-line note).");
  process.exit(1);
}
console.log(`All ${read.size} settings the code reads are documented in deploy/vps/.env.example.`);
