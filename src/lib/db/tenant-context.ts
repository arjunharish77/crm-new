import { AsyncLocalStorage } from "node:async_hooks";

// WP07 (F04): ambient per-request tenant context, read by src/lib/db/query.ts so that ad hoc
// query()/queryOne()/execute() calls (the ~90% of call sites that don't already go through
// withTransaction) can still set a transaction-local "app.tenant_id"/"app.user_id"/"app.role_id"
// for RLS without every one of those call sites having to be rewritten to thread a user argument
// through. Set via enterTenantContext() (AsyncLocalStorage#enterWith, not #run) from
// getCurrentUser() -- the single choke point nearly every API route already calls -- so it "sticks"
// for the rest of that request's async chain without requiring every route handler to be
// restructured into a callback shape. Node's AsyncLocalStorage isolates concurrent async chains
// correctly even when they share this same module-level store, so this is safe under concurrent
// requests in one process.
export type TenantContext = {
  tenantId: string | null;
  userId: string | null;
  roleId: string | null;
  // Round-2 plan O5: the request's id (x-request-id, set in src/proxy.ts), for logs and Sentry.
  requestId?: string | null;
  // Set on a store opened by beginRequestContext: one request's own object, filled in place.
  requestScoped?: boolean;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function enterTenantContext(context: TenantContext) {
  // A request's own store (beginRequestContext) is filled in place: in the Next.js server a store
  // entered inside an awaited helper wasn't visible to the route afterwards (round-2 plan O5:
  // error logs and Sentry had no request or workspace id), but the same object is.
  const current = storage.getStore();
  if (current?.requestScoped) {
    Object.assign(current, context, { requestScoped: true, requestId: context.requestId ?? current.requestId ?? null });
    return;
  }
  storage.enterWith(context);
}

// Opens this request's context store. Call it synchronously at the start of request handling
// (before any await), so the store belongs to the route's own async flow; later
// enterTenantContext calls fill it in. A store that already exists is kept.
export function beginRequestContext(requestId: string | null | undefined) {
  const current = storage.getStore();
  if (current) {
    if (requestId && !current.requestId) current.requestId = requestId;
    return current;
  }
  const context: TenantContext = { tenantId: null, userId: null, roleId: null, requestId: requestId ?? null, requestScoped: true };
  storage.enterWith(context);
  return context;
}

export function getTenantContext(): TenantContext | null {
  return storage.getStore() ?? null;
}

export function runWithTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}
