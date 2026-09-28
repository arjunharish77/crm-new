import type { TransactionClient } from "@/lib/db/transaction";
/** Shared transaction for combined creation. Hooks run only after commit. */
export type CreateUnitOfWork = { tx: TransactionClient; afterCommit: Array<() => Promise<unknown>> };
