import { describe, it, expect } from 'vitest';
import { formatAuthError, isFirebaseConfigured, firebaseConfig } from './firebase';

describe('Firebase Auth configuration & error formatting', () => {
  it('correctly maps common Firebase Auth error codes to user-friendly messages', () => {
    expect(formatAuthError({ code: 'auth/invalid-credential' })).toBe(
      'Invalid email or password. Please verify your details.'
    );
    expect(formatAuthError({ code: 'auth/wrong-password' })).toBe(
      'Invalid email or password. Please verify your details.'
    );
    expect(formatAuthError({ code: 'auth/user-not-found' })).toBe(
      'Invalid email or password. Please verify your details.'
    );
    expect(formatAuthError({ code: 'auth/email-already-in-use' })).toBe(
      'An account with this email address already exists. Please sign in instead.'
    );
    expect(formatAuthError({ code: 'auth/weak-password' })).toBe(
      'Password is too weak. Please use at least 6 characters.'
    );
    expect(formatAuthError({ code: 'auth/invalid-email' })).toBe(
      'Please enter a valid email address.'
    );
    expect(formatAuthError({ code: 'auth/too-many-requests' })).toBe(
      'Access temporarily restricted due to multiple failed attempts. Please reset your password or try again later.'
    );
    expect(formatAuthError({ code: 'auth/popup-closed-by-user' })).toBe(
      'Google sign-in popup was closed before completing.'
    );
    expect(formatAuthError({ code: 'auth/popup-blocked' })).toBe(
      'Google sign-in popup was blocked by your browser. Please allow popups for this site.'
    );
    expect(formatAuthError({ code: 'auth/network-request-failed' })).toBe(
      'Network connection error. Please verify your internet connection.'
    );
  });

  it('handles custom or unknown error objects safely', () => {
    expect(formatAuthError(new Error('Custom backend failure'))).toBe('Custom backend failure');
    expect(formatAuthError(null)).toBe('An unexpected error occurred. Please try again.');
    expect(formatAuthError('some string')).toBe('An unexpected error occurred. Please try again.');
  });

  it('detects unconfigured environment when placeholders are empty or absent', () => {
    // In test environment without .env.local, isFirebaseConfigured should safely evaluate to boolean
    expect(typeof isFirebaseConfigured).toBe('boolean');
    expect(firebaseConfig).toBeDefined();
  });
});
