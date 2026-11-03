import crypto from 'crypto';
import { getTicketSigningSecrets } from './config.js';

export interface TicketStation {
  id: string;
  name: string;
}

export interface VerifiedTicket {
  id: string;
  createdAt: string;
  expiresAt: string;
  source: TicketStation;
  destination: TicketStation;
  passengerCount: number;
  ticketType: string;
  baseFare: number;
  totalFare: number;
  status: 'ACTIVE' | 'EXPIRED' | 'USED' | 'CANCELLED';
  paymentStatus: 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  isDemo: boolean;
  disclaimer: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  signatureVersion?: string;
  signature?: string;
  qrPayload: string;
}

export interface TicketVerificationResult {
  /**
   * TRUE strictly if the ticket possesses a valid, un-tampered HMAC SHA-256 signature
   * matching one of the authorized server secrets.
   */
  cryptographicallyVerified: boolean;
  /**
   * TRUE if the ticket is an unsigned legacy ticket (e.g. from Standard Checkout prior to HMAC signing).
   * Unsigned legacy tickets are NEVER treated as cryptographically verified.
   */
  isLegacy: boolean;
  /**
   * TRUE if the ticket is acceptable for backward-compatible rendering (either cryptographically verified OR valid legacy format).
   */
  valid: boolean;
  error?: string;
  signatureVersion?: string;
}

/**
 * Deterministically normalizes various timestamp representations to an ISO-8601 string.
 * Supports:
 * - ISO string / string parsing
 * - Firestore Timestamp objects with `.toDate()` method
 * - JavaScript Date instances
 * - Numeric timestamps (milliseconds or seconds since epoch)
 *
 * If raw is null/undefined or cannot be parsed, returns fallbackIso or null.
 */
export function normalizeTimestampToIso(raw: unknown, fallbackIso?: string): string {
  if (raw === null || raw === undefined) {
    return fallbackIso || new Date().toISOString();
  }

  // 1. If it's a Firestore Timestamp or object with toDate()
  if (typeof raw === 'object' && raw !== null && typeof (raw as any).toDate === 'function') {
    try {
      const d = (raw as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      // fallback
    }
  }

  // 2. If it's already a Date instance
  if (raw instanceof Date) {
    if (!isNaN(raw.getTime())) {
      return raw.toISOString();
    }
  }

  // 3. If it's a numeric timestamp
  if (typeof raw === 'number') {
    // If seconds (< 10000000000), convert to ms
    const ms = raw < 10000000000 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // 4. If it's a string
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
  }

  return fallbackIso || new Date().toISOString();
}

/**
 * Builds the canonical string representation for ticket HMAC signing.
 * Covers all security-relevant presentation and integrity fields:
 * - Version prefix ('v2')
 * - Booking ID & Ticket ID
 * - Source station ID & name
 * - Destination station ID & name
 * - Passenger count
 * - Base fare & Total fare
 * - Ticket type ('SINGLE' | 'RETURN')
 * - Ticket status ('ACTIVE' | 'EXPIRED' | 'USED')
 * - Payment status ('PAID')
 * - Payment ID
 * - Expiration timestamp
 * - Creation timestamp
 * - Demo disclaimer
 * - Demo indicator ('true' | 'false')
 */
export interface CanonicalTicketFields {
  bookingId: string;
  ticketId: string;
  sourceId: string;
  sourceName?: string;
  destinationId: string;
  destinationName?: string;
  passengerCount: number;
  baseFare?: number;
  totalFare: number;
  ticketType: string;
  status?: string;
  paymentStatus?: string;
  expiresAt: string;
  razorpayPaymentId?: string | null;
  createdAt: string;
  disclaimer?: string;
  isDemo?: boolean;
}

export function buildCanonicalTicketString(fields: CanonicalTicketFields): string {
  return [
    'v2',
    fields.bookingId || '',
    fields.ticketId || '',
    fields.sourceId || '',
    (fields.sourceName || '').trim(),
    fields.destinationId || '',
    (fields.destinationName || '').trim(),
    String(fields.passengerCount || 1),
    String(fields.baseFare !== undefined ? fields.baseFare : fields.totalFare || 0),
    String(fields.totalFare || 0),
    fields.ticketType || 'SINGLE',
    fields.status || 'ACTIVE',
    fields.paymentStatus || 'PAID',
    fields.razorpayPaymentId || '',
    fields.expiresAt || '',
    fields.createdAt || '',
    fields.disclaimer || 'DEMO — NOT VALID FOR METRO TRAVEL',
    fields.isDemo === false ? 'false' : 'true',
  ].join('|');
}

/**
 * Legacy v1 canonical string builder preserved for verifying v1 signatures.
 */
function buildCanonicalTicketStringV1(fields: {
  bookingId: string;
  ticketId: string;
  sourceId: string;
  destinationId: string;
  passengerCount: number;
  totalFare: number;
  ticketType: string;
  expiresAt: string;
  razorpayPaymentId?: string | null;
  createdAt: string;
}): string {
  return [
    'v1',
    fields.bookingId,
    fields.ticketId,
    fields.sourceId,
    fields.destinationId,
    String(fields.passengerCount),
    String(fields.totalFare),
    fields.ticketType,
    fields.expiresAt,
    fields.razorpayPaymentId || '',
    fields.createdAt,
  ].join('|');
}

/**
 * Sign ticket payload using HMAC SHA-256 with the active TICKET_SIGNING_SECRET.
 * Generates version 'v2' HMAC covering all security-critical presentation fields.
 */
export function signTicketPayload(
  fields: CanonicalTicketFields,
  secret?: string
): string {
  const activeSecret = secret || getTicketSigningSecrets()[0];
  const canonical = buildCanonicalTicketString(fields);
  const hash = crypto.createHmac('sha256', activeSecret).update(canonical).digest('hex');
  return `v2.${hash}`;
}

/**
 * Verify ticket signature with support for versioning (v2, v1) and secret rotation.
 * Accepts multiple candidate secrets (current + prior).
 *
 * CRITICAL INTEGRITY REQUIREMENT:
 * Unsigned legacy tickets are explicitly identified as isLegacy=true and cryptographicallyVerified=false.
 * They are NEVER falsely reported as cryptographically verified.
 */
export function verifyTicketSignature(
  ticket: Partial<VerifiedTicket>,
  candidateSecrets?: string[]
): TicketVerificationResult {
  if (!ticket || !ticket.id) {
    return {
      cryptographicallyVerified: false,
      isLegacy: false,
      valid: false,
      error: 'INVALID_TICKET_OBJECT',
    };
  }

  // Backward compatibility with legacy Standard Checkout tickets without cryptographic signatures
  if (!ticket.signature) {
    if ((ticket.isDemo === true || ticket.totalFare !== undefined) && ticket.source?.id && ticket.destination?.id) {
      return {
        cryptographicallyVerified: false,
        isLegacy: true,
        valid: true,
        error: 'LEGACY_UNSIGNED_TICKET',
      };
    }
    return {
      cryptographicallyVerified: false,
      isLegacy: false,
      valid: false,
      error: 'MISSING_SIGNATURE',
    };
  }

  const sig = ticket.signature;
  const isV2 = sig.startsWith('v2.');
  const isV1 = sig.startsWith('v1.');

  if (!isV2 && !isV1) {
    return {
      cryptographicallyVerified: false,
      isLegacy: false,
      valid: false,
      error: 'UNSUPPORTED_SIGNATURE_VERSION',
    };
  }

  const secrets = candidateSecrets || getTicketSigningSecrets();
  const signatureVersion = isV2 ? 'v2' : 'v1';
  const expectedDigest = sig.slice(3); // strip 'v2.' or 'v1.'

  let canonical: string;
  if (isV2) {
    canonical = buildCanonicalTicketString({
      bookingId: ticket.id,
      ticketId: ticket.id,
      sourceId: ticket.source?.id || '',
      sourceName: ticket.source?.name || '',
      destinationId: ticket.destination?.id || '',
      destinationName: ticket.destination?.name || '',
      passengerCount: ticket.passengerCount || 1,
      baseFare: ticket.baseFare !== undefined ? ticket.baseFare : ticket.totalFare || 0,
      totalFare: ticket.totalFare || 0,
      ticketType: ticket.ticketType || 'SINGLE',
      status: ticket.status || 'ACTIVE',
      paymentStatus: ticket.paymentStatus || 'PAID',
      expiresAt: ticket.expiresAt || '',
      razorpayPaymentId: ticket.razorpayPaymentId || '',
      createdAt: ticket.createdAt || '',
      disclaimer: ticket.disclaimer || 'DEMO — NOT VALID FOR METRO TRAVEL',
      isDemo: ticket.isDemo !== false,
    });
  } else {
    canonical = buildCanonicalTicketStringV1({
      bookingId: ticket.id,
      ticketId: ticket.id,
      sourceId: ticket.source?.id || '',
      destinationId: ticket.destination?.id || '',
      passengerCount: ticket.passengerCount || 1,
      totalFare: ticket.totalFare || 0,
      ticketType: ticket.ticketType || 'SINGLE',
      expiresAt: ticket.expiresAt || '',
      razorpayPaymentId: ticket.razorpayPaymentId || '',
      createdAt: ticket.createdAt || '',
    });
  }

  for (const secret of secrets) {
    const computedDigest = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    try {
      if (
        Buffer.byteLength(computedDigest) === Buffer.byteLength(expectedDigest) &&
        crypto.timingSafeEqual(Buffer.from(computedDigest), Buffer.from(expectedDigest))
      ) {
        return {
          cryptographicallyVerified: true,
          isLegacy: false,
          valid: true,
          signatureVersion,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    cryptographicallyVerified: false,
    isLegacy: false,
    valid: false,
    error: 'SIGNATURE_MISMATCH',
  };
}

/**
 * Format a verified booking into an immutable, cryptographically signed Ticket.
 * Never reuses stale or unsigned qrPayload.
 */
export function formatVerifiedTicket(booking: any): VerifiedTicket {
  const bookingId = booking.bookingId || booking.id;
  const createdAt = normalizeTimestampToIso(booking.createdAt);
  const expiresAt = normalizeTimestampToIso(
    booking.expiresAt,
    new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  );
  const sourceId = booking.sourceId || booking.source?.id || '';
  const sourceName = booking.sourceName || booking.source?.name || '';
  const destinationId = booking.destinationId || booking.destination?.id || '';
  const destinationName = booking.destinationName || booking.destination?.name || '';
  const passengerCount = booking.passengerCount || 1;
  const totalFare = booking.totalFare || 0;
  const baseFare = booking.baseFare || totalFare;
  const ticketType = booking.ticketType || 'SINGLE';
  const razorpayPaymentId = booking.razorpayPaymentId || null;
  const razorpayOrderId = booking.razorpayOrderId || null;

  const isRefunded = booking.status === 'REFUNDED' || booking.status === 'PARTIALLY_REFUNDED';
  const ticketStatus = isRefunded ? 'CANCELLED' : (booking.ticketStatus || 'ACTIVE');
  const paymentStatus = isRefunded ? booking.status : 'PAID';
  const disclaimer = isRefunded
    ? 'DEMO — REFUNDED / CANCELLED — NOT VALID FOR METRO TRAVEL'
    : (booking.disclaimer || 'DEMO — NOT VALID FOR METRO TRAVEL');

  const signature = signTicketPayload({
    bookingId,
    ticketId: bookingId,
    sourceId,
    sourceName,
    destinationId,
    destinationName,
    passengerCount,
    baseFare,
    totalFare,
    ticketType,
    status: ticketStatus,
    paymentStatus,
    expiresAt,
    razorpayPaymentId,
    createdAt,
    disclaimer,
    isDemo: true,
  });

  // Always generate freshly signed QR payload with fully deterministic fields
  // verifiedAt derives deterministically from normalized createdAt to guarantee byte-for-byte identical output
  const qrPayload = JSON.stringify({
    app: 'DELHI_METRO_NAVIGATOR',
    bookingId,
    type: 'DEMO_TICKET',
    status: paymentStatus,
    ticketStatus,
    valid: false,
    disclaimer,
    source: { id: sourceId, name: sourceName },
    destination: { id: destinationId, name: destinationName },
    passengers: passengerCount,
    ticketType,
    baseFare,
    totalFare,
    expiresAt,
    razorpayPaymentId,
    verifiedAt: createdAt,
    signatureVersion: 'v2',
    signature,
  });

  return {
    id: bookingId,
    createdAt,
    expiresAt,
    source: { id: sourceId, name: sourceName },
    destination: { id: destinationId, name: destinationName },
    passengerCount,
    ticketType,
    baseFare,
    totalFare,
    status: ticketStatus,
    paymentStatus,
    isDemo: true,
    disclaimer,
    ...(razorpayOrderId ? { razorpayOrderId } : {}),
    ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
    signatureVersion: 'v2',
    signature,
    qrPayload,
  };
}
