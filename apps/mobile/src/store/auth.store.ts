import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import type { User } from '@arkchat/types';

const TOKEN_KEY = 'arkchat_jwt';
const USER_KEY = 'arkchat_user';

function resolveApiBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = Constants as any;
    const debuggerHost: string | undefined =
      c.manifest?.debuggerHost ??
      c.expoConfig?.hostUri ??
      c.manifest2?.extra?.expoClient?.hostUri;
    if (debuggerHost) {
      const host = debuggerHost.split(':')[0];
      const isExpoTunnel = host.includes('.exp.direct') || host.includes('tunnel.exp');
      if (host && host !== 'localhost' && host !== '127.0.0.1' && !isExpoTunnel) {
        return `http://${host}:3000`;
      }
    }
  }
  return (envUrl || 'http://localhost:3000').replace(/\/$/, '');
}

const API_BASE = resolveApiBase();

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const padded = base64 + '=='.slice((base64.length + 3) % 4);
    const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() / 1000 >= payload.exp - 60;
}

function tokenExpiresInDays(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return 99;
  return (payload.exp - Date.now() / 1000) / 86400;
}

async function silentRefresh(currentToken: string): Promise<string | null> {
  try {
    const base = resolveApiBase();
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiAuth(
  endpoint: string,
  body: Record<string, string>,
): Promise<{ token: string; user: { id: string; email: string } }> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return data as { token: string; user: { id: string; email: string } };
}

function buildUser(raw: { id: string; email: string }, name?: string): User {
  return {
    id: raw.id,
    email: raw.email,
    display_name: name ?? raw.email.split('@')[0],
    avatar_url: null,
    created_at: new Date().toISOString(),
    custom_instructions: null,
    preferred_model: 'claude-sonnet-5',
    theme: 'dark',
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  token: null,
  loading: true,

  initialize: async () => {
    set({ loading: true });
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      if (token && userJson) {
        if (isTokenExpired(token)) {
          await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
          await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
          set({ token: null, user: null, loading: false });
          return;
        }
        // Silently refresh when fewer than 2 days remain
        let activeToken = token;
        if (tokenExpiresInDays(token) < 2) {
          const refreshed = await silentRefresh(token);
          if (refreshed) {
            activeToken = refreshed;
            await SecureStore.setItemAsync(TOKEN_KEY, refreshed).catch(() => {});
          }
        }
        const user = JSON.parse(userJson) as User;
        set({ token: activeToken, user, loading: false });
        return;
      }
    } catch {}
    set({ token: null, user: null, loading: false });
  },

  signIn: async (email, password) => {
    const { token, user: raw } = await apiAuth('/api/auth/login', { email, password });
    const user = buildUser(raw);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  signUp: async (email, password, name) => {
    const { token, user: raw } = await apiAuth('/api/auth/register', { email, password });
    const user = buildUser(raw, name);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
    set({ user: null, token: null });
  },
}));

// Exported helper so api.ts can read the token without importing the whole store
export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
