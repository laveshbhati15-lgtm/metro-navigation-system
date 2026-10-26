import { defineSecret } from 'firebase-functions/params';

/**
 * Secret definitions for Google Cloud Secret Manager / Firebase Functions.
 * Never commit secrets into source code or expose in client bundles.
 */
export const razorpayKeyIdSecret = defineSecret('RAZORPAY_KEY_ID');
export const razorpayKeySecretSecret = defineSecret('RAZORPAY_KEY_SECRET');
export const razorpayWebhookSecretSecret = defineSecret('RAZORPAY_WEBHOOK_SECRET');

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/**
 * Retrieve credentials securely from Firebase secrets or process.env (for local emulator).
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  let secretKeyId = '';
  let secretKeySecret = '';
  let secretWebhook = '';

  try {
    if (typeof razorpayKeyIdSecret?.value === 'function') {
      secretKeyId = razorpayKeyIdSecret.value();
    }
  } catch {
    // No secret bound (running in local emulator)
  }

  try {
    if (typeof razorpayKeySecretSecret?.value === 'function') {
      secretKeySecret = razorpayKeySecretSecret.value();
    }
  } catch {
    // No secret bound (running in local emulator)
  }

  try {
    if (typeof razorpayWebhookSecretSecret?.value === 'function') {
      secretWebhook = razorpayWebhookSecretSecret.value();
    }
  } catch {
    // No secret bound (running in local emulator)
  }

  const keyId = process.env.RAZORPAY_KEY_ID || secretKeyId;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || secretKeySecret;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || secretWebhook;

  if (!keyId || !keySecret) {
    return null;
  }

  return {
    keyId: keyId.trim(),
    keySecret: keySecret.trim(),
    webhookSecret: webhookSecret.trim(),
  };
}
