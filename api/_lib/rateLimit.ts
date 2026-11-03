import type { VercelRequest } from '@vercel/node';

/**
 * ARCHITECTURAL NOTICE — RATE LIMITING SCOPE & BOUNDARIES:
 *
 * This implementation provides container-level in-memory sliding window rate limiting.
 *
 * SCOPE & LIMITATION:
 * In a serverless deployment environment (such as Vercel Serverless Functions), requests
 * are distributed across multiple ephemeral runtime containers. Each container maintains its
 * own independent memory space.
 *
 * Therefore, this in-memory limiter acts as a BEST-EFFORT abuse-mitigation safeguard
 * against high-frequency single-instance burst floods and local automated scripts.
 * It DOES NOT provide production-grade globally synchronized distributed rate limiting.
 *
 * TRUST ASSUMPTIONS ON CLIENT IP:
 * - On Vercel, incoming edge proxies populate `x-forwarded-for` and `x-real-ip`.
 * - In multi-hop proxy setups, `x-forwarded-for` can contain spoofed client values if
 *   intermediate headers are not sanitized by the edge ingress.
 * - Here, the leftmost address in `x-forwarded-for` is used as the identifying key.
 * - This provides defensive per-client throttling but must not be relied upon as an
 *   absolute cryptographic authentication barrier.
 *
 * MEMORY PRUNING & BOUNDS:
 * To prevent unbounded growth from stale IP entries across long-running warm containers,
 * entries with empty active windows are pruned periodically (every 50 requests).
 * Furthermore, an absolute size cap (MAX_TRACKED_IPS = 10,000) prevents memory exhaustion.
 *
 * PRODUCTION REQUIREMENTS FOR DISTRIBUTED RATE LIMITING:
 * To achieve strict distributed rate limiting across all serverless nodes:
 * 1. A centralized low-latency shared key-value store (e.g. Upstash Redis via @upstash/ratelimit
 *    or Vercel KV / Edge Config) is required.
 * 2. An external dependency and environment credentials (e.g. UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN) must be provisioned.
 * 3. Alternatively, Firestore-backed rate limiting could be used, but writing to Firestore on
 *    every inbound request introduces database latency (80-150ms per check) and per-document
 *    contention limits (1 write/sec/doc).
 *
 * Under current constraints (no external paid services or unapproved dependencies), this
 * limiter provides defensive best-effort protection without distributed guarantees.
 */

interface ClientWindow {
  timestamps: number[];
}

const MAX_TRACKED_IPS = 10000;
let checkCount = 0;
const ipMap = new Map<string, ClientWindow>();

/**
 * Prune stale entries whose timestamps have all expired.
 */
function pruneStaleEntries(now: number, windowMs: number): void {
  for (const [ip, entry] of ipMap.entries()) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    if (entry.timestamps.length === 0) {
      ipMap.delete(ip);
    }
  }

  // If still over cap, evict oldest entries
  if (ipMap.size > MAX_TRACKED_IPS) {
    const toRemove = ipMap.size - MAX_TRACKED_IPS;
    const keys = Array.from(ipMap.keys());
    for (let i = 0; i < toRemove; i++) {
      ipMap.delete(keys[i]);
    }
  }
}

function getClientIp(req: VercelRequest): string {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const raw = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    return raw.split(',')[0].trim();
  }
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    return Array.isArray(xRealIp) ? xRealIp[0].trim() : xRealIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Best-effort rate limiting per serverless container instance.
 * Preserves default of 20 requests per minute.
 */
export function checkRateLimit(
  req: VercelRequest,
  maxRequests: number = 20,
  windowMs: number = 60000
): { allowed: boolean; retryAfter?: number; isDistributed: false } {
  const now = Date.now();
  const ip = getClientIp(req);

  // Periodic pruning every 50 checks to prevent memory leakage from stale IPs
  checkCount++;
  if (checkCount % 50 === 0) {
    pruneStaleEntries(now, windowMs);
  }

  let entry = ipMap.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    ipMap.set(ip, entry);
  }

  // Filter timestamps within window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
    return {
      allowed: false,
      retryAfter: Math.max(1, retryAfterSeconds),
      isDistributed: false,
    };
  }

  entry.timestamps.push(now);
  return { allowed: true, isDistributed: false };
}

export function resetRateLimitForTesting(): void {
  ipMap.clear();
}
