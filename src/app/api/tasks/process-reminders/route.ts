import { NextResponse } from "next/server";
import { processDueTaskReminders } from "@/lib/server/tasks";
import { forbidden, serverError } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.TASKS_CRON_SECRET;
    if (!cronSecret) return forbidden("Tasks cron secret is not configured");
    if (!cronSecretMatches(request, "x-tasks-cron-secret", cronSecret)) return forbidden("Invalid tasks cron secret");

    const result = await processDueTaskReminders();
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process task reminders", error);
  }
}
