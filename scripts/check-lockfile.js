/* eslint-disable no-console */
// Round-2 plan O7: package-lock.json must match package.json. The Docker image installs with
// `npm ci` from this lockfile, but this folder is also part of the outer workspace, where
// `npm install <pkg>` updates the OUTER lockfile and leaves this one behind (that broke the
// 2026-10-03 deploy). Run `npm run lockfile:check` locally; CI runs it on every push.
// To fix a mismatch: `npm run lockfile:update`.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const problems = [];

if (lock.lockfileVersion !== 3) problems.push(`lockfileVersion is ${lock.lockfileVersion}, expected 3`);
const lockRoot = (lock.packages && lock.packages[""]) || {};
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  const declared = pkg[field] || {};
  const locked = lockRoot[field] || {};
  for (const name of new Set([...Object.keys(declared), ...Object.keys(locked)])) {
    if (declared[name] !== locked[name]) {
      problems.push(`${field}.${name}: package.json has ${declared[name] ?? "nothing"}, the lockfile has ${locked[name] ?? "nothing"}`);
    } else if (!lock.packages[`node_modules/${name}`]) {
      problems.push(`${field}.${name} is declared but not installed in the lockfile`);
    }
  }
}

if (problems.length) {
  console.error("package-lock.json doesn't match package.json:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("Fix: npm run lockfile:update (then commit package-lock.json).");
  process.exit(1);
}
console.log("package-lock.json matches package.json.");
