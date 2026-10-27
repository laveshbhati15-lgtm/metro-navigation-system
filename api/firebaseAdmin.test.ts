import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sanitizeFirestoreError,
  probeFirestore,
  getFirebaseAdmin,
} from './_lib/firebaseAdmin.js';

describe('Firebase Admin Utilities & Firestore Error Handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('sanitizeFirestoreError', () => {
    it('correctly maps gRPC numeric status codes to standard string names', () => {
      expect(sanitizeFirestoreError({ code: 7, message: 'Missing permissions' }).code).toBe(
        'PERMISSION_DENIED'
      );
      expect(sanitizeFirestoreError({ code: 5, message: 'Not found' }).code).toBe('NOT_FOUND');
      expect(sanitizeFirestoreError({ code: 3, message: 'Invalid argument' }).code).toBe(
        'INVALID_ARGUMENT'
      );
      expect(sanitizeFirestoreError({ code: 16, message: 'Unauthenticated' }).code).toBe(
        'UNAUTHENTICATED'
      );
      expect(sanitizeFirestoreError({ code: 14, message: 'Unavailable' }).code).toBe(
        'UNAVAILABLE'
      );
    });

    it('preserves existing string error codes', () => {
      expect(sanitizeFirestoreError({ code: 'PERMISSION_DENIED', message: 'Denied' }).code).toBe(
        'PERMISSION_DENIED'
      );
      expect(sanitizeFirestoreError({ code: 'RESOURCE_EXHAUSTED', message: 'Quota' }).code).toBe(
        'RESOURCE_EXHAUSTED'
      );
    });

    it('defaults code to UNKNOWN when code is missing or unmapped', () => {
      expect(sanitizeFirestoreError({ message: 'Random error' }).code).toBe('UNKNOWN');
      expect(sanitizeFirestoreError(null).code).toBe('UNKNOWN');
    });

    it('uses details field if available over message', () => {
      const err = {
        code: 7,
        message: '7 PERMISSION_DENIED: Generic error',
        details: 'Cloud Firestore API has not been used in project metro-navigation-system before or it is disabled.',
      };
      const sanitized = sanitizeFirestoreError(err);
      expect(sanitized.code).toBe('PERMISSION_DENIED');
      expect(sanitized.message).toBe(
        'Cloud Firestore API has not been used in project metro-navigation-system before or it is disabled.'
      );
    });

    it('redacts private keys and auth tokens from error messages', () => {
      const err = {
        code: 7,
        message:
          'Error with key -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY----- and token ya29.c.b0AXx123456789 during write',
      };
      const sanitized = sanitizeFirestoreError(err);
      expect(sanitized.message).not.toContain('-----BEGIN PRIVATE KEY-----');
      expect(sanitized.message).toContain('[REDACTED_KEY]');
      expect(sanitized.message).not.toContain('ya29.c.b0AXx123456789');
      expect(sanitized.message).toContain('[REDACTED_TOKEN]');
    });

    it('truncates excessively long messages', () => {
      const longMessage = 'A'.repeat(500);
      const sanitized = sanitizeFirestoreError({ code: 2, message: longMessage });
      expect(sanitized.message.length).toBeLessThanOrEqual(255);
      expect(sanitized.message.endsWith('...')).toBe(true);
    });
  });

  describe('probeFirestore', () => {
    it('returns NOT_INITIALIZED when db instance is null', async () => {
      const result = await probeFirestore(null);
      expect(result.ok).toBe(false);
      expect(result.stage).toBe('NOT_INITIALIZED');
      expect(result.code).toBe('DATABASE_UNAVAILABLE');
    });

    it('returns CONNECTED when collection read succeeds', async () => {
      const mockDb: any = {
        collection: () => ({
          limit: () => ({
            get: async () => ({ empty: true }),
          }),
        }),
      };
      const result = await probeFirestore(mockDb);
      expect(result.ok).toBe(true);
      expect(result.stage).toBe('CONNECTED');
    });

    it('returns PROBE_FAILED with sanitized code and message when collection read throws', async () => {
      const mockDb: any = {
        collection: () => ({
          limit: () => ({
            get: async () => {
              const err: any = new Error('7 PERMISSION_DENIED: Missing read permissions');
              err.code = 7;
              err.details = 'Missing read permissions';
              throw err;
            },
          }),
        }),
      };
      const result = await probeFirestore(mockDb);
      expect(result.ok).toBe(false);
      expect(result.stage).toBe('PROBE_FAILED');
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.message).toBe('Missing read permissions');
    });
  });

  describe('getFirebaseAdmin configuration safety', () => {
    it('safely handles missing FIREBASE_SERVICE_ACCOUNT_KEY without throwing', () => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      delete process.env.FIRESTORE_EMULATOR_HOST;

      const admin = getFirebaseAdmin();
      expect(admin.isConfigured).toBe(false);
      expect(admin.initError).toContain('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
      expect(admin.metadata.hasPrivateKey).toBe(false);
    });

    it('safely handles malformed non-JSON FIREBASE_SERVICE_ACCOUNT_KEY without crashing process', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = 'this-is-not-valid-json{{{';

      const admin = getFirebaseAdmin();
      expect(admin.isConfigured).toBe(false);
      expect(admin.initError).toBeDefined();
      expect(admin.metadata.isConfigured).toBe(false);
    });

    it('safely handles service account JSON missing required fields', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        project_id: 'some-project',
        // missing client_email and private_key
      });

      const admin = getFirebaseAdmin();
      expect(admin.isConfigured).toBe(false);
      expect(admin.initError).toContain('missing required service account fields');
    });
  });
});
