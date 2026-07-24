export class DatabaseError extends Error {
  readonly code?: string;
  readonly cause?: unknown;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "DatabaseError";
    this.code = options.code;
    this.cause = options.cause;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Record not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class TenantScopeError extends Error {
  constructor(message = "Tenant scope is required") {
    super(message);
    this.name = "TenantScopeError";
  }
}
