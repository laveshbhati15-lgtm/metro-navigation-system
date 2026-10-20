import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

/**
 * Firebase Web Configuration
 * Values are injected at build/runtime via Vite environment variables (VITE_FIREBASE_*).
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

/**
 * Verify if valid, non-placeholder Firebase configuration is present.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_firebase_api_key_here' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your_project_id' &&
  firebaseConfig.appId &&
  firebaseConfig.appId !== '1:1234567890:web:abcdef123456'
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (error) {
    console.error('Failed to initialize Firebase Auth client:', error);
  }
} else {
  if (import.meta.env.DEV) {
    console.info(
      'ℹ️ Firebase Authentication is not yet configured. Set VITE_FIREBASE_* environment variables in .env.local to enable live authentication.'
    );
  }
}

export { app, auth, googleProvider };

/**
 * Translates Firebase Auth error codes into clear, user-friendly messages.
 */
export function formatAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'An unexpected error occurred. Please try again.';
  }

  const err = error as { code?: string; message?: string };
  const code = err.code || '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please verify your details.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Access temporarily restricted due to multiple failed attempts. Please reset your password or try again later.';
    case 'auth/user-disabled':
      return 'This passenger account has been disabled. Please contact support.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in operation was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email address under a different sign-in method.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please verify your internet connection.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled in Firebase Console.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}
