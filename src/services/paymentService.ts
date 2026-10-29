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

    const scriptSrc = 'https://checkout.razorpay.com/v1/checkout.js';
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`
    );

    const timeoutId = setTimeout(() => {
      resolve(typeof window.Razorpay !== 'undefined');
    }, 7000);

    const handleSuccess = () => {
      clearTimeout(timeoutId);
      resolve(true);
    };

    const handleFailure = () => {
      clearTimeout(timeoutId);
      console.warn('Failed to load Razorpay Checkout script (blocked by network or privacy extension).');
      resolve(false);
    };

    if (existing) {
      if (window.Razorpay) {
        clearTimeout(timeoutId);
        resolve(true);
        return;
      }
      existing.addEventListener('load', handleSuccess, { once: true });
      existing.addEventListener('error', handleFailure, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.onload = handleSuccess;
    script.onerror = handleFailure;
    document.body.appendChild(script);
  });
}

async function parseErrorResponse(
  response: Response,
  defaultPrefix: string
): Promise<Error> {
  let errorData: any = {};
  let rawText = '';

  if (typeof response.text === 'function') {
    try {
      rawText = await response.text();
      if (rawText) {
        try {
          errorData = JSON.parse(rawText);
        } catch {
          // Response body is plain text or HTML
        }
      }
    } catch {
      // Stream could not be read
    }
  } else if (typeof response.json === 'function') {
    try {
      errorData = await response.json();
    } catch {
      // Body may not be JSON
    }
  }

  let message = errorData?.error;
  if (!message) {
    if (rawText && rawText.length < 150 && !rawText.includes('<html')) {
      message = rawText.trim();
    } else {
      message = `${defaultPrefix} (HTTP ${response.status})`;
    }
  }

  if (errorData?.code) {
    message += ` [${errorData.code}${errorData.stage ? ` @ ${errorData.stage}` : ''}]`;
  }

  if (errorData?.firestoreErrorCode || errorData?.firestoreErrorMessage) {
    const details = [errorData.firestoreErrorCode, errorData.firestoreErrorMessage]
      .filter(Boolean)
      .join(': ');
    message += ` (${details})`;
  }

  const err: any = new Error(message);
  err.status = response.status;
  err.code = errorData?.code;
  err.stage = errorData?.stage;
  err.firestoreErrorCode = errorData?.firestoreErrorCode;
  err.firestoreErrorMessage = errorData?.firestoreErrorMessage;
  err.requestId = errorData?.requestId;
  return err;
}

/**
 * Checks server-side payment configuration diagnostics (safe, without secrets).
 */
export async function fetchPaymentBackendDiagnostics(): Promise<any> {
  const response = await fetch(
    `${FUNCTIONS_BASE_URL}/createRazorpayOrder?diagnostics=1`,
    {
      method: 'GET',
    }
  );
  if (!response.ok) {
    throw await parseErrorResponse(response, 'Failed to fetch backend diagnostics');
  }
  return response.json();
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

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE_URL}/createRazorpayOrder`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceId: params.sourceId,
        destinationId: params.destinationId,
        passengerCount: params.passengerCount,
        ticketType: params.ticketType,
      }),
    });
  } catch (netErr: any) {
    const isSafariLoadFailed = netErr?.message === 'Load failed';
    const message = isSafariLoadFailed
      ? `Network connection error while contacting payment server (${FUNCTIONS_BASE_URL}). Check internet connection or verify API availability.`
      : (netErr?.message || 'Network request failed while connecting to payment server.');
    const err: any = new Error(message);
    err.isNetworkError = true;
    err.code = 'NETWORK_ERROR';
    err.originalError = netErr;
    throw err;
  }

  if (!response.ok) {
    throw await parseErrorResponse(response, 'Order creation failed');
  }

  return response.json();
}

/**
 * Submits payment signature to backend for cryptographic HMAC SHA256 verification.
 */
export async function verifyServerPayment(
  params: VerifyPaymentRequest
): Promise<VerifyPaymentResponse> {
  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE_URL}/verifyRazorpayPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  } catch (netErr: any) {
    const isSafariLoadFailed = netErr?.message === 'Load failed';
    const message = isSafariLoadFailed
      ? `Network connection error while contacting payment verification server (${FUNCTIONS_BASE_URL}).`
      : (netErr?.message || 'Network request failed while contacting verification server.');
    const err: any = new Error(message);
    err.isNetworkError = true;
    err.code = 'NETWORK_ERROR';
    err.originalError = netErr;
    throw err;
  }

  if (!response.ok) {
    throw await parseErrorResponse(response, 'Payment verification failed');
  }

  return response.json();
}
