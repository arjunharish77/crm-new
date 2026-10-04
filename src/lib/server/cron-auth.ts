import { timingSafeEqual } from "crypto";

// Round-2 plan S13: cron endpoints take their shared secret from a request header only (a
// `?secret=` in the URL ends up in proxy and access logs) and compare it in constant time.
export function cronSecretMatches(request: Request, headerName: string, expected: string | undefined) {
  if (!expected) return false;
  const supplied = Buffer.from(request.headers.get(headerName) ?? "");
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}
