import { describe, it, expect } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthNavControl } from '@/components/auth/AuthNavControl';

describe('AuthContext & useAuth', () => {
  it('throws an error if useAuth is called outside of AuthProvider', () => {
    const origError = console.error;
    console.error = () => {};

    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider'
    );

    console.error = origError;
  });

  it('renders children with initial auth state', () => {
    render(
      <AuthProvider>
        <div data-testid="auth-child">Metroverse App</div>
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-child').textContent).toBe('Metroverse App');
  });

  it('renders unauthenticated state in AuthNavControl with Sign In button', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthNavControl />
        </AuthProvider>
      </MemoryRouter>
    );

    const signInButton = await screen.findByRole('link', { name: /sign in/i });
    expect(signInButton).toBeDefined();
    expect(signInButton.getAttribute('href')).toBe('/login');
  });
});
