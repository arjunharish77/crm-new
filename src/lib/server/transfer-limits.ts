// Round-2 plan wave 3, B4: how long a running import or export holds its claim before another run
// may take it over, and how many runs a job gets before it is marked failed.
export const TRANSFER_LEASE_MS = 5 * 60 * 1000;
export const MAX_TRANSFER_ATTEMPTS = 3;
