import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let dbInstance: FirebaseFirestore.Firestore | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;
let isConfigured = false;

/**
 * Initializes Firebase Admin SDK on Vercel using server-only FIREBASE_SERVICE_ACCOUNT_KEY.
 * Validates configuration structure without logging credential content.
 */
export function getFirebaseAdmin(): {
  db: FirebaseFirestore.Firestore;
  auth: ReturnType<typeof getAuth>;
  isConfigured: boolean;
} {
  if (getApps().length > 0 && dbInstance && authInstance) {
    return { db: dbInstance, auth: authInstance, isConfigured: true };
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'metro-navigation-system';

  try {
    if (rawServiceAccount) {
      const parsed = JSON.parse(rawServiceAccount);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing required service account fields.');
      }

      initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || projectId,
      });
      isConfigured = true;
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId });
      isConfigured = true;
    } else {
      isConfigured = false;
    }
  } catch (err: any) {
    isConfigured = false;
    console.error('Firebase Admin initialization error:', err.message);
  }

  if (getApps().length > 0) {
    dbInstance = getFirestore();
    authInstance = getAuth();
  }

  return {
    db: dbInstance as FirebaseFirestore.Firestore,
    auth: authInstance as ReturnType<typeof getAuth>,
    isConfigured,
  };
}

export { FieldValue };
