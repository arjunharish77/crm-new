const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeIdentifier(identifier: string) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

export function quoteIdentifier(identifier: string) {
  return `"${assertSafeIdentifier(identifier).replace(/"/g, '""')}"`;
}

export function tableIdentifier(table: string) {
  return quoteIdentifier(table);
}

export function columnIdentifier(column: string) {
  return quoteIdentifier(column);
}

export function orderDirection(direction: unknown) {
  return String(direction).toLowerCase() === "asc" ? "asc" : "desc";
}

export function limitOffset(input: { limit?: unknown; offset?: unknown; maxLimit?: number } = {}) {
  const maxLimit = input.maxLimit ?? 200;
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), maxLimit);
  const offset = Math.max(Number(input.offset || 0), 0);
  return { limit, offset };
}
