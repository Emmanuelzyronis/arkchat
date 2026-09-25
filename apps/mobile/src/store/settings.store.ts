import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { ClaudeModel } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark' | 'system';
type FontSize = 'sm' | 'md' | 'lg';

interface SettingsState {
  theme: Theme;
  preferredModel: ClaudeModel;
  customInstructions: string;
  fontSize: FontSize;
  memoryEnabled: boolean;
}

interface SettingsActions {
  setTheme: (theme: Theme) => void;
  setModel: (model: ClaudeModel) => void;
  setCustomInstructions: (instructions: string) => void;
  setFontSize: (size: FontSize) => void;
  setMemoryEnabled: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// SecureStore storage adapter for Zustand persist middleware
// ---------------------------------------------------------------------------

const secureStorage = createJSONStorage<SettingsState>(() => ({
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // SecureStore has a 2048-byte value limit per key.
      // Settings are small so this is fine; chunk if needed in future.
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('[SettingsStore] Failed to persist settings:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
}));

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      // Defaults
      theme: 'dark' as Theme,
      preferredModel: 'claude-sonnet-5' as ClaudeModel,
      customInstructions: '',
      fontSize: 'md' as FontSize,
      memoryEnabled: true,

      setTheme: (theme) => set({ theme }),
      setModel: (preferredModel) => set({ preferredModel }),
      setCustomInstructions: (customInstructions) => set({ customInstructions }),
      setFontSize: (fontSize) => set({ fontSize }),
      setMemoryEnabled: (memoryEnabled) => set({ memoryEnabled }),
    }),
    {
      name: 'arkchat-settings-v1',
      storage: secureStorage,
      // Only persist the state fields, not actions
      partialize: (state) => ({
        theme: state.theme,
        preferredModel: state.preferredModel,
        customInstructions: state.customInstructions,
        fontSize: state.fontSize,
        memoryEnabled: state.memoryEnabled,
      }),
    },
  ),
);
