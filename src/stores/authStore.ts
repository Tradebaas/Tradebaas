import { create } from 'zustand';
import { getBackendUrl } from '@/lib/backend-url';

const BACKEND_URL = getBackendUrl();

interface User {
  id: string;
  email: string;
  fullName?: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('tradebaas:auth-token'),
  isAuthenticated: !!localStorage.getItem('tradebaas:auth-token'),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Login failed');
      }

      const { accessToken, user } = data;

      // Store token in localStorage
      localStorage.setItem('tradebaas:auth-token', accessToken);

      set({
        token: accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (email: string, password: string, fullName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      // Auto-login after registration
      await get().login(email, password);
    } catch (error: any) {
      set({
        error: error.message || 'Registration failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('tradebaas:auth-token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('tradebaas:auth-token');
    if (!token) {
      set({ isAuthenticated: false, user: null, token: null });
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Token invalid - clear auth
        get().logout();
        return;
      }

      set({
        user: data.user,
        token,
        isAuthenticated: true,
      });
    } catch (error) {
      // On error, clear auth
      get().logout();
    }
  },

  clearError: () => set({ error: null }),
}));
