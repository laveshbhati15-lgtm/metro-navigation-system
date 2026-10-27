import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

let dbInstance: FirebaseFirestore.Firestore | null = null;
let authInstance: Auth | null = null;
let isConfigured = false;
let lastInitError: string | null = null;

export interface FirebaseAdminMetadata {
  isConfigured: boolean;
  projectId: string | null;
  clientEmailDomain: string | null;
  hasPrivateKey: boolean;
  initError: string | null;
}

let configMetadata: FirebaseAdminMetadata = {
  isConfigured: false,
  projectId: null,
  clientEmailDomain: null,
  hasPrivateKey: false,
  initError: null,
};

const GRPC_STATUS_MAP: Record<number, string> = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

/**
 * Sanitizes Firestore errors to extract standard error codes and safe messages
 * without ever exposing keys, credentials, or internal secrets.
 */
export function sanitizeFirestoreError(err: any): {
  code: string;
  message: string;
} {
  if (!err) {
    return { code: 'UNKNOWN', message: 'Unknown Firestore error' };
  }

  let code = 'UNKNOWN';
  if (typeof err.code === 'number' && GRPC_STATUS_MAP[err.code]) {
    code = GRPC_STATUS_MAP[err.code];
  } else if (typeof err.code === 'string' && err.code.trim()) {
    code = err.code.trim();
  }

  let message = typeof err.message === 'string' ? err.message : '';
  if (err.details && typeof err.details === 'string') {
    message = err.details;
  }

  // Sanitize message: strip potential private keys or authorization tokens
  message = message
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[REDACTED_KEY]')
    .replace(/ya29\.[0-9A-Za-z._-]+/g, '[REDACTED_TOKEN]')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  if (message.length > 250) {
    message = message.substring(0, 250) + '...';
  }

  return { code, message: message || 'Firestore database error' };
}

/**
 * Safely probes Firestore connectivity and permissions with a lightweight read.
 */
export async function probeFirestore(db: FirebaseFirestore.Firestore | null): Promise<{
  ok: boolean;
  stage: string;
  code?: string;
  message?: string;
}> {
  if (!db) {
    return {
      ok: false,
      stage: 'NOT_INITIALIZED',
      code: 'DATABASE_UNAVAILABLE',
      message: 'Firestore instance is not initialized',
    };
  }

  try {
    // Attempt lightweight limit(1) read to verify collection connectivity
    await db.collection('demo_bookings').limit(1).get();
    return { ok: true, stage: 'CONNECTED' };
  } catch (err: any) {
    const sanitized = sanitizeFirestoreError(err);
    return {
      ok: false,
      stage: 'PROBE_FAILED',
      code: sanitized.code,
      message: sanitized.message,
    };
  }
}

/**
 * Lazily loads Firebase Auth SDK to prevent module-level ERR_REQUIRE_ESM crashes.
 */
export async function getFirebaseAuth(app?: any): Promise<Auth | null> {
  if (authInstance) return authInstance;
  try {
    const authModule = await import('firebase-admin/auth');
    const existingApps = getApps();
    const targetApp = app || (existingApps.length > 0 ? existingApps[0] : undefined);
    if (!targetApp) return null;
    authInstance = authModule.getAuth(targetApp);
    return authInstance;
  } catch (err: any) {
    console.warn('Firebase Admin Auth lazy-load notice:', err?.message);
    return null;
  }
}

/**
 * Initializes Firebase Admin SDK on Vercel using server-only FIREBASE_SERVICE_ACCOUNT_KEY.
 * Validates configuration structure without logging credential content.
 */
export function getFirebaseAdmin(): {
  db: FirebaseFirestore.Firestore | null;
  auth: Auth | null;
  isConfigured: boolean;
  initError: string | null;
  metadata: FirebaseAdminMetadata;
} {
  if (getApps().length > 0 && dbInstance) {
    return {
      db: dbInstance,
      auth: authInstance,
      isConfigured: true,
      initError: null,
      metadata: configMetadata,
    };
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

      const resolvedProjectId = parsed.project_id || projectId;
      const clientEmailDomain = typeof parsed.client_email === 'string'
        ? parsed.client_email.split('@')[1] || null
        : null;

      configMetadata = {
        isConfigured: true,
        projectId: resolvedProjectId,
        clientEmailDomain,
        hasPrivateKey: Boolean(parsed.private_key),
        initError: null,
      };

      const existingApps = getApps();
      const app = existingApps.length > 0
        ? existingApps[0]
        : initializeApp({
            credential: cert(parsed),
            projectId: resolvedProjectId,
          });

      dbInstance = getFirestore(app);
      isConfigured = true;
      lastInitError = null;
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      const existingApps = getApps();
      const app = existingApps.length > 0 ? existingApps[0] : initializeApp({ projectId });
      dbInstance = getFirestore(app);
      isConfigured = true;
      lastInitError = null;
      configMetadata = {
        isConfigured: true,
        projectId,
        clientEmailDomain: 'emulator.local',
        hasPrivateKey: false,
        initError: null,
      };
    } else {
      isConfigured = false;
      lastInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.';
      configMetadata = {
        isConfigured: false,
        projectId,
        clientEmailDomain: null,
        hasPrivateKey: false,
        initError: lastInitError,
      };
    }
  } catch (err: any) {
    isConfigured = false;
    lastInitError = err.message || 'Failed to initialize Firebase Admin credential.';
    configMetadata = {
      isConfigured: false,
      projectId,
      clientEmailDomain: null,
      hasPrivateKey: false,
      initError: lastInitError,
    };
    console.error('Firebase Admin initialization error:', lastInitError);
  }

  return {
    db: dbInstance,
    auth: authInstance,
    isConfigured,
    initError: lastInitError,
    metadata: configMetadata,
  };
}

export { FieldValue };
