import { courses, courseWithUniversity } from "../src/data/catalog";
import { rankWithGroq } from "../src/lib/groq-recommender";
import { classifyWithGroq } from "../src/lib/recommender-followup";
import { matchingCourses, sortMatches, type RecommenderAnswers } from "../src/lib/recommender-matching";

if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) throw new Error("Set GROQ_API_KEY and GROQ_MODEL in the local server environment.");
const answers: RecommenderAnswers = { level: "PG", qualification: "bachelors", stream: "Management", budget: "any", priority: "cost" };
const matches = sortMatches(matchingCourses(courses, answers), answers.priority);
const candidates = matches.slice(0, 12).map(course => ({ ...course, universityName: courseWithUniversity(course).university.name }));
const ranked = await rankWithGroq(candidates, matches, answers, { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL });
const classified = await classifyWithGroq("What are the fees for the second one?", candidates.slice(0, 3).map(courseWithUniversity), undefined, { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL });
console.log(JSON.stringify({ ranking: ranked.ok ? { ok: true, count: ranked.picks.length } : ranked, followUpClassification: classified.valid ? classified.context : "invalid" }));
if (!ranked.ok || !classified.valid || !classified.context) process.exitCode = 1;
