import { Stack } from 'expo-router';

/**
 * Auth group layout.
 * Simple Stack with no visible header and a consistent dark background.
 * The root _layout handles all auth-guard redirects.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#0F172A' },
      }}
    />
  );
}
