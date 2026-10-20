import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  type User,
  type UserCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured, formatAuthError } from '@/lib/firebase';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserCredential>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  loginWithGoogle: () => Promise<UserCredential>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    // Subscribe to Firebase auth state persistence
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (error) => {
        console.error('Firebase onAuthStateChanged error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string): Promise<UserCredential> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error(
        'Firebase Authentication is not configured. Please add your credentials to .env.local.'
      );
    }
    try {
      return await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      throw new Error(formatAuthError(error));
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<UserCredential> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error(
        'Firebase Authentication is not configured. Please add your credentials to .env.local.'
      );
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName && displayName.trim() && cred.user) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
        // Force refresh local user state
        setUser({ ...cred.user, displayName: displayName.trim() });
      }
      return cred;
    } catch (error) {
      throw new Error(formatAuthError(error));
    }
  };

  const loginWithGoogle = async (): Promise<UserCredential> => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      throw new Error(
        'Firebase Google Authentication is not configured. Please add your credentials to .env.local.'
      );
    }
    try {
      return await signInWithPopup(auth, googleProvider);
    } catch (error) {
      throw new Error(formatAuthError(error));
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error(
        'Firebase Authentication is not configured. Please add your credentials to .env.local.'
      );
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      throw new Error(formatAuthError(error));
    }
  };

  const logout = async (): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      setUser(null);
      return;
    }
    try {
      await signOut(auth);
    } catch (error) {
      throw new Error(formatAuthError(error));
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      isConfigured: isFirebaseConfigured,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      resetPassword,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
