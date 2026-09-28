// F07 fix (WP06): tenant-configurable outbound destinations (webhook subscriptions, marketplace
// app webhooks, AI provider endpoints, HTTP communication connectors) previously had no
// validation beyond "non-empty URL" before this server fetched them -- confirmed by the audit as
// exploitable SSRF, most severely via the webhook test-delivery console, which echoes the raw
// response body back to the caller (a read oracle for anything the server can reach). This is
// the shared guard every tenant-controlled fetch destination in this codebase should go through.
//
// Deliberately NOT applied to genuinely administrator-owned internal connectors (e.g. the ML
// service, configured only via a server env var, never by a tenant) -- see ml-service-client.ts,
// which is unaffected by this module. That's the "separate administrator-owned connector policy"
// carve-out the audit itself describes, not an oversight.
import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDestinationError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function inIpv4Range(ip: string, base: string, prefixLength: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// IPv4 ranges that must never be reachable from a tenant-supplied destination: loopback, private
// (RFC1918), link-local (includes the 169.254.169.254 cloud-metadata address every major
// provider uses), "this network", and shared carrier-grade NAT space.
const BLOCKED_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Range(ip, base, prefix));
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  // IPv4-mapped/compatible IPv6 (::ffff:127.0.0.1, ::ffff:169.254.169.254, etc.) -- extract the
  // embedded IPv4 address and check it the same way.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // Not a parseable IP at all -- fail closed rather than let something unexpected through.
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

// Validates a tenant-supplied destination URL: scheme, and every DNS-resolved address (so
// "myhost.example.com" that currently resolves to a private IP is caught, not just literal IPs).
// Call this immediately before each actual request, not only at configuration-save time -- a
// hostname's DNS record can change between when a webhook URL was saved and when it's used.
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeDestinationError("Destination is not a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeDestinationError("Only http/https destinations are allowed");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeDestinationError("This destination is not allowed");
  }

  // A literal IP in the URL itself (bypasses DNS lookup entirely).
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new UnsafeDestinationError("This destination is not allowed");
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeDestinationError("Destination hostname could not be resolved");
  }
  if (!addresses.length) {
    throw new UnsafeDestinationError("Destination hostname could not be resolved");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new UnsafeDestinationError("This destination resolves to a disallowed address");
    }
  }
}
