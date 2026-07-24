import { NextResponse } from "next/server";
import { processDueTaskReminders } from "@/lib/server/tasks";
import { forbidden, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.TASKS_CRON_SECRET;
    const suppliedSecret = request.headers.get("x-tasks-cron-secret") ?? url.searchParams.get("secret");
    if (!cronSecret) return forbidden("Tasks cron secret is not configured");
    if (suppliedSecret !== cronSecret) return forbidden("Invalid tasks cron secret");

    const result = await processDueTaskReminders();
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process task reminders", error);
  }
}
