import { randomUUID } from "crypto";
import { execute, queryOne } from "@/lib/db/query";

// Gap checklist Module 10's "user workspace personalization" item, "notification preferences"
// sub-item -- a real category per notification (User.preferences.notifications.mutedCategories
// checks against this), not just a display-layer filter. "SECURITY" is a deliberate, hard floor:
// it is never muteable, checked before the preference lookup even runs, since these are
// compliance-relevant alerts (password policy, abuse detection) a user must not be able to
// silence for themselves.
export type NotificationCategory =
  | "TASKS"
  | "REASSIGNMENT"
  | "VIEWS"
  | "INTEGRATIONS"
  | "MARKETING"
  | "REPORTS"
  | "CALLS"
  | "CASES"
  | "NBA"
  | "SECURITY";

export async function createUserNotification(input: {
  tenantId: string | null;
  userId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  category?: NotificationCategory;
}) {
  const category = input.category ?? null;
  if (category && category !== "SECURITY") {
    const target = await queryOne<{ preferences: Record<string, unknown> | null }>(
      `select preferences from "User" where id = $1 limit 1`,
      [input.userId],
    );
    const muted = (target?.preferences as any)?.notifications?.mutedCategories;
    if (Array.isArray(muted) && muted.includes(category)) return;
  }
  await execute(
    `insert into "Notification" (id, "tenantId", "userId", title, message, data, category, "isRead", "createdAt", "readAt")
     values ($1, $2, $3, $4, $5, $6, $7, false, $8, null)`,
    [randomUUID(), input.tenantId, input.userId, input.title, input.message, input.data ?? {}, category, new Date().toISOString()],
  );
}
