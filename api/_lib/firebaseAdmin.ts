import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let dbInstance: FirebaseFirestore.Firestore | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;
let isConfigured = false;
let lastInitError: string | null = null;

/**
 * Initializes Firebase Admin SDK on Vercel using server-only FIREBASE_SERVICE_ACCOUNT_KEY.
 * Validates configuration structure without logging credential content.
 */
export function getFirebaseAdmin(): {
  db: FirebaseFirestore.Firestore | null;
  auth: ReturnType<typeof getAuth> | null;
  isConfigured: boolean;
  initError: string | null;
} {
  if (getApps().length > 0 && dbInstance && authInstance) {
    return { db: dbInstance, auth: authInstance, isConfigured: true, initError: null };
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'metro-navigation-system';

  try {
    if (rawServiceAccount) {
      let jsonString = rawServiceAccount.trim();
      if (
        (jsonString.startsWith('"') && jsonString.endsWith('"')) ||
        (jsonString.startsWith("'") && jsonString.endsWith("'"))
      ) {
        jsonString = jsonString.slice(1, -1).trim();
      }
      // Handle potential base64 encoding
      if (!jsonString.startsWith('{')) {
        try {
          const decoded = Buffer.from(jsonString, 'base64').toString('utf8');
          if (decoded.trim().startsWith('{')) {
            jsonString = decoded.trim();
          }
        } catch {
          // Keep original string if base64 decoding fails
        }
      }

      const parsed = JSON.parse(jsonString);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing required service account fields (project_id, client_email, or private_key).');
      }

      // Handle escaped newlines in PEM private key
      if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }

      const existingApps = getApps();
      const app = existingApps.length > 0
        ? existingApps[0]
        : initializeApp({
            credential: cert(parsed),
            projectId: parsed.project_id || projectId,
          });

      dbInstance = getFirestore(app);
      authInstance = getAuth(app);
      isConfigured = true;
      lastInitError = null;
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      const existingApps = getApps();
      const app = existingApps.length > 0 ? existingApps[0] : initializeApp({ projectId });
      dbInstance = getFirestore(app);
      authInstance = getAuth(app);
      isConfigured = true;
      lastInitError = null;
    } else {
      isConfigured = false;
      lastInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.';
    }
  } catch (err: any) {
    isConfigured = false;
    lastInitError = err.message || 'Failed to initialize Firebase Admin credential.';
    console.error('Firebase Admin initialization error:', lastInitError);
  }

  return {
    db: dbInstance,
    auth: authInstance,
    isConfigured,
    initError: lastInitError,
  };
}

export { FieldValue };
