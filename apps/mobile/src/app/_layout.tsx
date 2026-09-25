import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore } from '@/store/settings.store';

// ---------------------------------------------------------------------------
// TanStack Query client
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time of 30s reduces redundant network calls on tab focus
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if ((error as { status?: number })?.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Auth guard (inner component so it has router access)
// ---------------------------------------------------------------------------

function AuthGuard() {
  const { token: session, loading, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Bootstrap: check SecureStore for persisted session
  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (loading) return; // Wait for hydration before redirecting

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!session && !inAuthGroup) {
      // Not authenticated – send to login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Already authenticated – send to app
      router.replace('/(app)');
    }
  }, [session, loading, segments]);

  return <Slot />;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const theme = useSettingsStore((s) => s.theme);

  // Resolve the actual status bar style
  const statusBarStyle = theme === 'light' ? 'dark' : 'light';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={statusBarStyle} backgroundColor="#0F172A" />
          <AuthGuard />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
