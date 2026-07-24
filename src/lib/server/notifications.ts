import { randomUUID } from "crypto";
import { execute } from "@/lib/db/query";

export async function createUserNotification(input: {
  tenantId: string | null;
  userId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  await execute(
    `insert into "Notification" (id, "tenantId", "userId", title, message, data, "isRead", "createdAt", "readAt")
     values ($1, $2, $3, $4, $5, $6, false, $7, null)`,
    [randomUUID(), input.tenantId, input.userId, input.title, input.message, input.data ?? {}, new Date().toISOString()],
  );
}
