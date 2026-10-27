import { queryAsSystem } from "@/lib/db/query";
import { enqueueExportJob, enqueueImportJob } from "@/lib/server/job-queue";
import { failStaleImportJob } from "@/lib/server/crm";
import { failStaleExportRequest } from "@/lib/server/exports";
import { MAX_TRANSFER_ATTEMPTS } from "@/lib/server/transfer-limits";

// Round-2 plan wave 3, B4 (worker job "transfers.recoverStale", every 5 minutes). An import or
// export whose lease ran out was being processed when its worker stopped. It is queued again under
// a new job id (an import resumes from its saved progress, an export starts again), or -- after
// MAX_TRANSFER_ATTEMPTS runs -- marked failed and the person who asked is told. Before this, such a
// job stayed "processing" for good.
export async function recoverStaleTransfers(limit = 50) {
  const imports = await queryAsSystem<{ id: string; tenantId: string; attempts: number }>(
    `select id, "tenantId", attempts from "ImportJob" where status = 'PROCESSING' and "leaseExpiresAt" < now() order by "leaseExpiresAt" limit $1`,
    [limit],
  );
  const exports = await queryAsSystem<{ id: string; tenantId: string; attempts: number }>(
    `select id, "tenantId", attempts from "ExportRequest" where status = 'RUNNING' and "leaseExpiresAt" < now() order by "leaseExpiresAt" limit $1`,
    [limit],
  );
  let requeued = 0;
  let failed = 0;
  for (const job of imports) {
    if (job.attempts >= MAX_TRANSFER_ATTEMPTS) {
      await failStaleImportJob(job.id, job.attempts + 1);
      failed++;
    } else {
      await enqueueImportJob(job.id, job.tenantId, job.attempts);
      requeued++;
    }
  }
  for (const request of exports) {
    if (request.attempts >= MAX_TRANSFER_ATTEMPTS) {
      await failStaleExportRequest(request.id, request.attempts + 1);
      failed++;
    } else {
      await enqueueExportJob(request.id, request.tenantId, request.attempts);
      requeued++;
    }
  }
  return { requeued, failed };
}
