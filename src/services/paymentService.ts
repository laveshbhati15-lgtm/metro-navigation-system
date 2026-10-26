declare global {
  interface Window {
    Razorpay?: any;
  }
}

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  (import.meta.env.DEV
    ? 'http://127.0.0.1:5001/metro-navigation-system/us-central1'
    : '/api');

export interface CreateOrderRequest {
  sourceId: string;
  destinationId: string;
  passengerCount: number;
  ticketType: 'SINGLE' | 'RETURN';
  idToken?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  bookingId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  fareInRupees: number;
  sourceName: string;
  destinationName: string;
  passengerCount: number;
  ticketType: string;
}

export interface VerifyPaymentRequest {
  bookingId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  status: 'PAID';
  bookingId: string;
  ticket: any;
}

/**
 * Loads Razorpay Standard Checkout SDK into DOM asynchronously.
 */
export function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load Razorpay Checkout script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Calls backend Firebase Cloud Function to create an authenticated Razorpay order.
 * Never supplies or trusts client-side fare amounts.
 */
export async function createPaymentOrder(
  params: CreateOrderRequest
): Promise<CreateOrderResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (params.idToken) {
    headers['Authorization'] = `Bearer ${params.idToken}`;
  }

  const response = await fetch(`${FUNCTIONS_BASE_URL}/createRazorpayOrder`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceId: params.sourceId,
      destinationId: params.destinationId,
      passengerCount: params.passengerCount,
      ticketType: params.ticketType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Order creation failed with HTTP status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Submits payment signature to backend for cryptographic HMAC SHA256 verification.
 */
export async function verifyServerPayment(
  params: VerifyPaymentRequest
): Promise<VerifyPaymentResponse> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/verifyRazorpayPayment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Payment verification failed with HTTP status ${response.status}`
    );
  }

  return response.json();
}
