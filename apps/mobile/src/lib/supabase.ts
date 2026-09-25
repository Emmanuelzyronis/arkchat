import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * SecureStore adapter for Supabase auth token storage.
 * Uses expo-secure-store (hardware-backed AES-256 on device) instead of
 * AsyncStorage which is unencrypted. Keys are stored in the iOS Keychain /
 * Android Keystore via the secure enclave.
 */
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      // SecureStore keys must be <= 255 chars, alphanumeric + .-_
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
      return await SecureStore.getItemAsync(safeKey);
    } catch (error) {
      console.warn('[SecureStore] getItem failed for key:', key, error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
      await SecureStore.setItemAsync(safeKey, value);
    } catch (error) {
      console.error('[SecureStore] setItem failed for key:', key, error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
      await SecureStore.deleteItemAsync(safeKey);
    } catch (error) {
      console.warn('[SecureStore] removeItem failed for key:', key, error);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // URL-based auth flows (magic links / OAuth) are handled in-app
    detectSessionInUrl: false,
  },
});
