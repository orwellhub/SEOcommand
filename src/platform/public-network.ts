import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DNS_CACHE_MS = 5 * 60 * 1_000;
const cache = new Map<string, { expiresAt: number; promise: Promise<void> }>();

function publicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const value = address.toLowerCase().split("%")[0]!;
  if (isIP(value) === 4) return publicIpv4(value);
  if (isIP(value) !== 6) return false;
  if (value === "::" || value === "::1" || value.startsWith("::ffff:") || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8")) return false;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? publicIpv4(mapped) : true;
}

export function isObviouslyPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return false;
  const ipVersion = isIP(host);
  return ipVersion ? isPublicAddress(host) : /^[a-z0-9.-]+$/.test(host) && host.includes(".");
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!isObviouslyPublicHostname(host)) throw new Error("Only public internet hosts can be requested.");
  if (isIP(host)) return;
  const existing = cache.get(host);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = lookup(host, { all: true, verbatim: true }).then((addresses) => {
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new Error("The host resolves to a private or reserved network address.");
    }
  });
  cache.set(host, { expiresAt: Date.now() + DNS_CACHE_MS, promise });
  try {
    await promise;
  } catch (error) {
    cache.delete(host);
    throw error;
  }
}

/** Fetch a public GET resource while re-validating every redirect target. */
export async function fetchPublic(input: string | URL, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = new URL(input);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    if (!/^https?:$/.test(current.protocol)) throw new Error("Only HTTP and HTTPS URLs can be requested.");
    await assertPublicHostname(current.hostname);
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects === maxRedirects) throw new Error("Too many redirects.");
    await response.body?.cancel().catch(() => undefined);
    current = new URL(location, current);
  }
  throw new Error("Too many redirects.");
}
