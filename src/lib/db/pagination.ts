export type PageInput = {
  limit?: unknown;
  offset?: unknown;
  maxLimit?: number;
};

export type Page = {
  limit: number;
  offset: number;
};

export function parsePage(input: PageInput = {}): Page {
  const maxLimit = input.maxLimit ?? 200;
  const parsedLimit = Number(input.limit ?? 50);
  const parsedOffset = Number(input.offset ?? 0);
  return {
    limit: Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), maxLimit),
    offset: Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0),
  };
}
