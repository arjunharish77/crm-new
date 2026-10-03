import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

// "Select all N matching" support for list pages (UI/UX plan B8). Bulk actions used to act on the
// rows loaded on screen (or, for leads, on the first 5,000 leads ignoring the filters) while the
// toolbar said "N selected". These helpers resolve the exact matching ids on the server, with the
// same filters and record access as the list, so the count shown is the count changed.

export class BulkSelectionTooLargeError extends Error {
    constructor(public cap: number) {
        super(`More than ${cap.toLocaleString()} records match. Narrow the filters and try again.`);
    }
}

// `listPath` is the list endpoint ("/leads"); `query` is the list's own query string minus paging.
export async function fetchMatchingIds(listPath: string, query: URLSearchParams | string): Promise<string[]> {
    const params = new URLSearchParams(query);
    params.delete("page");
    params.delete("limit");
    const qs = params.toString();
    const result = await apiFetch<{ ids: string[]; truncated: boolean; cap: number }>(`${listPath}/ids${qs ? `?${qs}` : ""}`);
    if (result.truncated) throw new BulkSelectionTooLargeError(result.cap);
    return Array.isArray(result.ids) ? result.ids : [];
}

export function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

// Runs one request per id, a few at a time, and reports how many succeeded and failed, so a
// partial failure is never shown as success.
export async function runForEach(ids: string[], run: (id: string) => Promise<unknown>, concurrency = 8) {
    let succeeded = 0;
    let failed = 0;
    for (const group of chunk(ids, concurrency)) {
        const results = await Promise.allSettled(group.map(run));
        for (const result of results) result.status === "fulfilled" ? succeeded++ : failed++;
    }
    return { succeeded, failed };
}

// Bulk owner reassignment, sent in batches of the endpoint's 500-record limit. A batch that fails
// as a whole counts all of its records as failed; the rest still run.
export async function reassignOwnersInBatches(entityType: "LEAD" | "OPPORTUNITY", ids: string[], newOwnerId: string, reason: string) {
    const total = { reassigned: 0, failed: 0, pendingApproval: 0 };
    for (const batch of chunk(ids, 500)) {
        try {
            const outcome = await apiFetch<{ reassigned: number; failed: number; pendingApproval: number }>("/assignment/reassign/bulk", {
                method: "POST",
                body: JSON.stringify({ entityType, entityIds: batch, newOwnerId, reason }),
            });
            total.reassigned += Number(outcome.reassigned ?? 0);
            total.failed += Number(outcome.failed ?? 0);
            total.pendingApproval += Number(outcome.pendingApproval ?? 0);
        } catch {
            total.failed += batch.length;
        }
    }
    return total;
}

// Bulk opportunity delete, sent in batches of the endpoint's 1,000-record limit (Section 8 #5). A
// batch that fails as a whole counts all of its records as failed; the rest still run.
export async function deleteOpportunitiesInBatches(ids: string[]) {
    let deleted = 0;
    const failed: Array<{ id: string; reason: string }> = [];
    for (const batch of chunk(ids, 1000)) {
        try {
            const outcome = await apiFetch<{ deleted: number; failed: Array<{ id: string; reason: string }> }>("/opportunities/bulk", {
                method: "DELETE",
                body: JSON.stringify({ ids: batch }),
            });
            deleted += Number(outcome.deleted ?? 0);
            failed.push(...(Array.isArray(outcome.failed) ? outcome.failed : []));
        } catch (error) {
            const reason = (error as Error)?.message || "Couldn't delete";
            failed.push(...batch.map((id) => ({ id, reason })));
        }
    }
    return { deleted, failed };
}

export function plural(count: number, one: string, many: string) {
    return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

// Like runForEach, but keeps which ids failed and the server's message for each.
export async function runForEachWithErrors(ids: string[], run: (id: string) => Promise<unknown>, concurrency = 8) {
    let succeeded = 0;
    const failures: Array<{ id: string; reason?: string }> = [];
    for (const group of chunk(ids, concurrency)) {
        const results = await Promise.allSettled(group.map(run));
        results.forEach((result, index) => {
            if (result.status === "fulfilled") succeeded++;
            else failures.push({ id: group[index], reason: (result.reason as any)?.message });
        });
    }
    return { succeeded, failures };
}

// One summary for a bulk action that runs per item (UI/UX plan B12): success only when every item
// succeeded; otherwise a warning that names what failed and why, and what was skipped.
export function showBulkResult(input: {
    done: string;
    succeeded: number;
    noun: [string, string];
    failures: Array<{ label: string; reason?: string }>;
    skipped?: { count: number; why: string };
}) {
    const parts = [`${plural(input.succeeded, input.noun[0], input.noun[1])} ${input.done}`];
    if (input.failures.length) parts.push(`${input.failures.length.toLocaleString()} failed`);
    if (input.skipped?.count) parts.push(`${input.skipped.count.toLocaleString()} skipped (${input.skipped.why})`);
    const message = parts.join(", ");
    if (!input.failures.length && !input.skipped?.count) {
        toast.success(message);
        return;
    }
    const shown = input.failures.slice(0, 3).map((failure) => (failure.reason ? `${failure.label}: ${failure.reason}` : failure.label));
    const more = input.failures.length > 3 ? `and ${(input.failures.length - 3).toLocaleString()} more` : "";
    const description = [...shown, more].filter(Boolean).join("; ") || undefined;
    (input.failures.length ? toast.warning : toast.info)(message, { description, duration: input.failures.length ? 12000 : undefined });
}
