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
