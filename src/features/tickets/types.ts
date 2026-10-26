import type { Station, LineCode, MetroRoute } from '@/core/graph/types';

export type TicketType = 'SINGLE' | 'RETURN';
export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED';
export type PaymentStatus = 'PAID' | 'UNVERIFIED_DEMO' | 'PENDING' | 'FAILED';

export interface DemoTicket {
  /** Unique booking reference, e.g. "DMRC-DEMO-202610-A9F3X2" */
  id: string;

  /** Creation timestamp in ISO 8601 format */
  createdAt: string;

  /** Expiration timestamp in ISO 8601 format (valid for 24 hours) */
  expiresAt: string;

  /** Departure station */
  source: Station;

  /** Arrival destination station */
  destination: Station;

  /** Selected route summary details */
  routeSummary: {
    label: string;
    totalTimeSeconds: number;
    totalStations: number;
    interchangeCount: number;
    lines: LineCode[];
    interchangeStations: string[];
  };

  /** Number of passengers (1–6) */
  passengerCount: number;

  /** Ticket category */
  ticketType: TicketType;

  /** Base fare per passenger in INR */
  baseFare: number;

  /** Total calculated fare in INR */
  totalFare: number;

  /** Demo status */
  status: TicketStatus;

  /** Payment verification status */
  paymentStatus: PaymentStatus;

  /** True only if server-side HMAC cryptographic signature verification succeeded */
  isVerifiedPayment: boolean;

  /** Razorpay order identifier in Test Mode */
  razorpayOrderId?: string;

  /** Razorpay payment identifier in Test Mode */
  razorpayPaymentId?: string;

  /** Strict disclaimer string embedded into ticket */
  disclaimer: string;

  /** QR code text payload containing demo-only serialized JSON */
  qrPayload: string;
}

export interface CreateTicketParams {
  source: Station;
  destination: Station;
  route: MetroRoute;
  passengerCount?: number;
  ticketType?: TicketType;
  paymentStatus?: PaymentStatus;
  isVerifiedPayment?: boolean;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}
