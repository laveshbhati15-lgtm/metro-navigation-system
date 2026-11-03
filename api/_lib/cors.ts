import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * ARCHITECTURAL NOTICE — CORS SECURITY BOUNDARY:
 *
 * CORS (Cross-Origin Resource Sharing) headers instruct compliant web browsers whether
 * client-side scripts running on another origin are permitted to read the HTTP response.
 *
 * - When an untrusted origin initiates a cross-origin fetch, omitting Access-Control-Allow-Origin
 *   causes the browser to block the caller from reading response data (such as guestAccessToken).
 * - CORS IS NOT AN AUTHENTICATION OR AUTHORIZATION MECHANISM: It does not prevent server-to-server
 *   requests, curl, or non-browser agents. Real access control is enforced exclusively by
 *   server-side Firebase ID token verification and cryptographic guest access token hashing.
 */

// Exact trusted production origins
const TRUSTED_PRODUCTION_ORIGINS = new Set([
  'https://metro-navigation-system-red.vercel.app',
  'https://metro-navigation-system.vercel.app',
]);

// Local development origins permitted ONLY when NODE_ENV !== 'production'
const DEVELOPMENT_ORIGIN_PATTERNS = [
  /^http:\/\/localhost:(3000|4173|5173)$/,
  /^http:\/\/127\.0\.0\.1:(3000|4173|5173)$/,
];

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  const normalized = origin.trim().toLowerCase();

  // 1. Exact production origins
  if (TRUSTED_PRODUCTION_ORIGINS.has(normalized)) {
    return true;
  }

  // 2. Development origins strictly prohibited in production
  if (process.env.NODE_ENV !== 'production') {
    return DEVELOPMENT_ORIGIN_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  return false;
}

/**
 * Applies strict CORS headers against explicit trusted allowlist.
 * Returns true if request handling should proceed, or false if preflight was terminated.
 */
export function handleCors(
  req: VercelRequest,
  res: VercelResponse,
  allowedMethods: string = 'GET, POST, OPTIONS'
): boolean {
  const origin = req.headers.origin;

  if (origin && typeof origin === 'string') {
    if (isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', allowedMethods);
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-guest-access-token'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
    } else {
      // Untrusted origin: reject preflight immediately with 403 Forbidden
      if (req.method === 'OPTIONS') {
        res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
        return false;
      }
      // For non-OPTIONS requests from untrusted origins, NEVER set Access-Control-Allow-Origin.
      // The browser will strictly block the calling origin from reading response bodies (e.g. guest tokens).
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  return true;
}
