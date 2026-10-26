// Unit-style checks for the Find my course match percentage (UI redesign Q9a). No server or browser.
// Run from apps/unnatividya: node --import tsx scripts/recommender-match-score-smoke.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { courses } from "../src/data/catalog";
import { matchingCourses, sortMatches, type RecommenderAnswers } from "../src/lib/recommender-matching";
import { MATCH_WEIGHTS, matchRingColor, matchScore } from "../src/lib/recommender-match-score";

const course = (fee: number, extra: Partial<{ id: string; level: "UG" | "PG"; stream: string; duration: string }> = {}) =>
  ({ id: extra.id || `c-${fee}`, level: extra.level || "PG", stream: extra.stream || "Management", fee, duration: extra.duration || "24 months" });
const answers: RecommenderAnswers = { level: "PG", qualification: "bachelors", stream: "Management", budget: "180000", priority: "cost" };

// Weights add up to 100 and every part stays within its maximum.
assert.equal(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0), 100);

// A full match: chosen subject and level, a confirmed route, 25%+ headroom and the lowest fee.
const cheap = course(120000), mid = course(150000), top = course(180000);
const pool = [cheap, mid, top];
const best = matchScore(cheap, answers, pool);
assert.equal(best.percent, 100);
assert.deepEqual(best.parts.map(part => part.points), [35, 25, 25, 15]);
assert.deepEqual(best.pills.map(pill => pill.text), ["Subject ✓", "Postgraduate ✓", "₹60,000 under budget", "Fee priority ✓"]);

// Budget headroom is linear up to 25% of the ceiling; exactly at the ceiling is still within budget.
const atCeiling = matchScore(top, answers, pool);
assert.equal(atCeiling.parts[2].points, 15);
assert.ok(atCeiling.pills.some(pill => pill.text === "Within budget"));
assert.equal(matchScore(mid, answers, pool).parts[2].points, round1(15 + 10 * (30000 / 180000 / 0.25)));
assert.ok(matchScore(mid, answers, pool).pills.some(pill => pill.text === "₹30,000 under budget"));

// Lower-tuition priority scales by the lowest matching fee; scores fall as fees rise.
assert.equal(matchScore(top, answers, pool).parts[3].points, round1(15 * 120000 / 180000));
assert.ok(best.percent > matchScore(mid, answers, pool).percent && matchScore(mid, answers, pool).percent > atCeiling.percent);
assert.ok(matchScore(top, answers, pool).pills.some(pill => pill.text === "+₹60,000 vs lowest-fee match"));

// Duration priority and balanced priority use listed duration; no hidden factors.
const long = course(120000, { duration: "36 months" });
const durationAnswers = { ...answers, priority: "duration" as const };
assert.equal(matchScore(long, durationAnswers, [cheap, long]).parts[3].points, 10);
assert.ok(matchScore(long, durationAnswers, [cheap, long]).pills.some(pill => pill.text === "+12 months vs shortest match"));
assert.equal(matchScore(long, { ...answers, priority: "balanced" }, [cheap, long]).parts[3].points, 12.5);

// "No preference" answers score in the middle, never full marks, and are labelled.
const open = matchScore(cheap, { level: "any", qualification: "unsure", stream: "any", budget: "any", priority: "cost" }, pool);
assert.deepEqual(open.parts.map(part => part.points), [20, 15, 15, 15]);
assert.equal(open.percent, 65);
assert.deepEqual(open.pills.map(pill => pill.text), ["Any subject", "Entry route to confirm", "No budget limit set", "Fee priority ✓"]);

// Mismatches (only reachable outside the hard filters) score zero for that part.
const off = matchScore(course(200000, { level: "UG", stream: "Commerce" }), { ...answers, qualification: "school" }, pool);
assert.equal(off.parts[0].points, 0);
assert.equal(off.parts[2].points, 0);
assert.ok(off.pills.some(pill => pill.text === "₹20,000 over budget" && pill.tone === "warning"));

// Ring colours follow the design thresholds.
assert.equal(matchRingColor(85), "#12A35C");
assert.equal(matchRingColor(84), "#3B82F6");
assert.equal(matchRingColor(70), "#3B82F6");
assert.equal(matchRingColor(69), "#5B4CF0");

// The score is a pure function of answers and published facts: ratings, reviews, placement,
// salary and package values cannot change it.
const real = sortMatches(matchingCourses(courses, answers), answers.priority);
assert.ok(real.length >= 2);
for (const item of real) {
  const base = matchScore(item, answers, real);
  const noisy = { ...item, rating: 1, reviews: 999999, placement: "100%", avgPackage: "₹99 LPA", salary: "₹1 crore" };
  assert.deepEqual(matchScore(noisy, answers, real.map(entry => entry.id === item.id ? noisy : entry)), base);
  assert.ok(base.percent >= 0 && base.percent <= 100);
  assert.ok(base.parts.every(part => part.points >= 0 && part.points <= part.max));
}
const source = readFileSync(new URL("../src/lib/recommender-match-score.ts", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
for (const forbidden of ["rating", "review", "placement", "salary", "avgPackage", "package"]) assert.ok(!source.includes(forbidden), `match score must not read ${forbidden}`);

function round1(value: number) { return Math.round(value * 10) / 10; }
console.log("PASS recommender match score: fixed weights, budget headroom, priority, neutral answers, ring colours and no rating/placement inputs");
