export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/**
 * Retrieve credentials securely from process.env on Vercel.
 * Never commit secrets into source code or expose in client bundles.
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

  if (!keyId || !keySecret) {
    return null;
  }

  return {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
    webhookSecret: webhookSecret.trim(),
  };
}

export interface BackendDiagnostics {
  razorpay: {
    hasKeyId: boolean;
    keyType: 'TEST' | 'LIVE' | 'MISSING';
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
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
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const hasSaKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  let keyType: 'TEST' | 'LIVE' | 'MISSING' = 'MISSING';
  if (keyId) {
    keyType = keyId.startsWith('rzp_test_') ? 'TEST' : (keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST');
  }

  return {
    razorpay: {
      hasKeyId: !!keyId,
      keyType,
      hasKeySecret: !!keySecret,
      hasWebhookSecret: !!webhookSecret,
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
