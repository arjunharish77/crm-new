import { z } from "zod";

export const recommenderAnswersSchema = z.object({
  level: z.enum(["UG", "PG", "any"]),
  qualification: z.enum(["school", "bachelors", "unsure"]),
  stream: z.enum(["Management", "IT & Computers", "Commerce", "Arts & Humanities", "any"]),
  budget: z.enum(["100000", "180000", "any"]),
  priority: z.enum(["cost", "duration", "balanced"]),
}).strict();
