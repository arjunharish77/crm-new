import { randomUUID } from "crypto";
import { execute, query, jsonbParam } from "@/lib/db/query";

// WP10 follow-up (F18 item 4/6): dead-letter tooling -- see migrations/0108_job_dead_letter.sql
// for the full rationale. This module is the read/write pair scripts/worker.ts and the
// platform-admin dead-letter API route both use.

export interface JobDeadLetterInput {
  queueName: string;
  jobName: string;
  jobId: string;
  tenantId: string | null;
  payload: unknown;
  errorMessage: string;
  attemptsMade: number;
}

/**
 * Records one permanently-failed job (the job's FINAL attempt, not an intermediate retry) as a
 * durable, queryable row. Called from scripts/worker.ts's `wireWorkerLifecycle`'s
 * `worker.on("failed", ...)` handler once `job.attemptsMade >= (job.opts?.attempts ?? 1)`.
 *
 * Deliberately swallow-free at the call site is NOT assumed here -- this can throw (a DB outage
 * shouldn't be silently invisible to an operator reading worker logs), so callers should wrap this
 * in their own best-effort `.catch` if a dead-letter write failure must never crash the worker
 * process itself (the existing `worker.on("failed")` handler already logs to console
 * unconditionally, so the failure is never entirely silent even if this insert itself fails).
 */
export async function recordJobDeadLetter(input: JobDeadLetterInput): Promise<void> {
  await execute(
    `insert into "JobDeadLetter"
       (id, "queueName", "jobName", "jobId", "tenantId", payload, "errorMessage", "attemptsMade", "failedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      input.queueName,
      input.jobName,
      input.jobId,
      input.tenantId,
      jsonbParam(input.payload),
      input.errorMessage,
      input.attemptsMade,
      new Date().toISOString(),
    ],
  );
}

export interface JobDeadLetterRow {
  id: string;
  queueName: string;
  jobName: string;
  jobId: string;
  tenantId: string | null;
  payload: unknown;
  errorMessage: string | null;
  attemptsMade: number;
  failedAt: string;
}

export interface ListJobDeadLetterOptions {
  limit?: number;
  queueName?: string;
  tenantId?: string;
}

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

/** Lists the most recent dead-letter rows, most-recently-failed first, for platform-admin triage/replay. */
export async function listRecentJobDeadLetters(options: ListJobDeadLetterOptions = {}): Promise<JobDeadLetterRow[]> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.queueName) {
    values.push(options.queueName);
    conditions.push(`"queueName" = $${values.length}`);
  }
  if (options.tenantId) {
    values.push(options.tenantId);
    conditions.push(`"tenantId" = $${values.length}`);
  }
  values.push(limit);
  const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return query<JobDeadLetterRow>(
    `select id, "queueName", "jobName", "jobId", "tenantId", payload, "errorMessage", "attemptsMade", "failedAt"
     from "JobDeadLetter"
     ${whereClause}
     order by "failedAt" desc
     limit $${values.length}`,
    values,
  );
}
