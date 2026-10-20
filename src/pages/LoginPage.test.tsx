import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LoginPage } from './LoginPage';

describe('LoginPage Component', () => {
  it('renders login form elements with accessible labels and buttons', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /create account/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toBeDefined();
  });
});
