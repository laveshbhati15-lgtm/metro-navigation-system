export type PaymentMode = 'TEST' | 'LIVE';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isLive: boolean;
  paymentMode: PaymentMode;
  liveQrEnabled: boolean;
}

/**
 * Retrieve credentials securely from process.env on Vercel.
 * Enforces fail-closed mode segregation:
 * - PAYMENT_MODE must match the key prefix (rzp_test_ or rzp_live_).
 * - Live Dynamic QR requires explicit ENABLE_LIVE_DYNAMIC_QR='true'.
 * - Never fall back silently between Test and Live.
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  const rawMode = (process.env.PAYMENT_MODE || 'TEST').trim().toUpperCase();
  const paymentMode: PaymentMode = rawMode === 'LIVE' ? 'LIVE' : 'TEST';

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const liveQrEnabled = process.env.ENABLE_LIVE_DYNAMIC_QR === 'true';

  // Webhook secret resolution:
  // Strict mode isolation: Selects secret based on active PAYMENT_MODE.
  // Prioritizes mode-specific secret (RAZORPAY_TEST_WEBHOOK_SECRET / RAZORPAY_LIVE_WEBHOOK_SECRET),
  // falling back to legacy RAZORPAY_WEBHOOK_SECRET if mode-specific is not defined.
  let webhookSecret = '';
  if (paymentMode === 'LIVE') {
    webhookSecret = (process.env.RAZORPAY_LIVE_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  } else {
    webhookSecret = (process.env.RAZORPAY_TEST_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  }

  if (!keyId || !keySecret) {
    return null;
  }

  // Key prefix validation
  const isTestKey = keyId.startsWith('rzp_test_');
  const isLiveKey = keyId.startsWith('rzp_live_');

  if (!isTestKey && !isLiveKey) {
    throw new Error('INVALID_KEY_PREFIX: Razorpay Key ID must start with rzp_test_ or rzp_live_');
  }

  // Fail-closed mode verification
  if (paymentMode === 'TEST' && !isTestKey) {
    throw new Error('CONFIG_MISMATCH: Live key (rzp_live_...) cannot be used when PAYMENT_MODE is TEST');
  }

  if (paymentMode === 'LIVE' && !isLiveKey) {
    throw new Error('CONFIG_MISMATCH: Test key (rzp_test_...) cannot be used when PAYMENT_MODE is LIVE');
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    isLive: isLiveKey,
    paymentMode,
    liveQrEnabled,
  };
}

/**
 * Get ticket signing secrets for HMAC SHA-256 integrity verification.
 * Supports comma-separated list of secrets to enable zero-downtime secret rotation.
 * The first secret is the active signing secret; subsequent secrets are valid for verification.
 */
export function getTicketSigningSecrets(): string[] {
  const envSecret = process.env.TICKET_SIGNING_SECRET?.trim();
  if (envSecret) {
    const secrets = envSecret.split(',').map((s) => s.trim()).filter(Boolean);
    if (secrets.length === 0 || secrets.some((s) => s.length < 16)) {
      throw new Error('CRITICAL_CONFIG_ERROR: TICKET_SIGNING_SECRET keys must be at least 16 characters long.');
    }
    return secrets;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL_CONFIG_ERROR: TICKET_SIGNING_SECRET must be configured in production environment.');
  }

  // Fallback strictly for local development and mock unit testing only
  return ['dev_mock_ticket_signing_secret_do_not_use_in_prod_12345678'];
}

export interface BackendDiagnostics {
  razorpay: {
    hasKeyId: boolean;
    keyType: 'TEST' | 'LIVE' | 'UNKNOWN' | 'MISSING';
    paymentMode: PaymentMode;
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
    dynamicQrAllowed: boolean;
    liveQrEnabled: boolean;
  };
  firebase: {
    hasServiceAccountKey: boolean;
    isConfigured: boolean;
    projectId?: string | null;
    clientEmailDomain?: string | null;
    hasPrivateKey?: boolean;
    initError: string | null;
    firestoreProbe?: {
      ok: boolean;
      stage: string;
      code?: string;
      message?: string;
    };
  };
  nodeEnv: string;
  disclaimer: string;
}

export function getDiagnosticsSummary(firebaseStatus: {
  isConfigured: boolean;
  initError: string | null;
  metadata?: {
    projectId?: string | null;
    clientEmailDomain?: string | null;
    hasPrivateKey?: boolean;
  };
  firestoreProbe?: {
    ok: boolean;
    stage: string;
    code?: string;
    message?: string;
  };
}): BackendDiagnostics {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const rawMode = (process.env.PAYMENT_MODE || 'TEST').trim().toUpperCase();
  const paymentMode: PaymentMode = rawMode === 'LIVE' ? 'LIVE' : 'TEST';
  const liveQrEnabled = process.env.ENABLE_LIVE_DYNAMIC_QR === 'true';

  let webhookSecret = '';
  if (paymentMode === 'LIVE') {
    webhookSecret = (process.env.RAZORPAY_LIVE_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  } else {
    webhookSecret = (process.env.RAZORPAY_TEST_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  }

  const hasSaKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  let keyType: 'TEST' | 'LIVE' | 'UNKNOWN' | 'MISSING' = 'MISSING';
  if (keyId) {
    if (keyId.startsWith('rzp_test_')) {
      keyType = 'TEST';
    } else if (keyId.startsWith('rzp_live_')) {
      keyType = 'LIVE';
    } else {
      keyType = 'UNKNOWN';
    }
  }

  const dynamicQrAllowed =
    (paymentMode === 'TEST' && keyType === 'TEST') ||
    (paymentMode === 'LIVE' && keyType === 'LIVE' && liveQrEnabled);

  return {
    razorpay: {
      hasKeyId: !!keyId,
      keyType,
      paymentMode,
      hasKeySecret: !!keySecret,
      hasWebhookSecret: !!webhookSecret,
      dynamicQrAllowed,
      liveQrEnabled,
    },
    firebase: {
      hasServiceAccountKey: hasSaKey,
      isConfigured: firebaseStatus.isConfigured,
      projectId: firebaseStatus.metadata?.projectId || null,
      clientEmailDomain: firebaseStatus.metadata?.clientEmailDomain || null,
      hasPrivateKey: firebaseStatus.metadata?.hasPrivateKey || false,
      initError: firebaseStatus.initError,
      firestoreProbe: firebaseStatus.firestoreProbe,
    },
    nodeEnv: process.env.NODE_ENV || 'production',
    disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
  };
}
