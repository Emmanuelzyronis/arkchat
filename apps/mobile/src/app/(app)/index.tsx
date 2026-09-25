import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useDrawer } from './_layout';
import { useSettingsStore } from '@/store/settings.store';
import { CLAUDE_MODELS } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F172A',
  card: 'rgba(17, 24, 39, 0.7)',
  border: '#334155',
  primary: '#2563EB',
  accent: '#EA580C',
  foreground: '#F8FAFC',
  muted: '#64748B',
} as const;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();
  const { openDrawer } = useDrawer();
  const queryClient = useQueryClient();
  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const [error, setError] = useState<string | null>(null);
  const pendingPromptRef = useRef<string | null>(null);

  const createConversation = useMutation({
    mutationFn: () => apiClient.createConversation(preferredModel),
    onSuccess: (conversation) => {
      queryClient.setQueryData(['conversation', conversation.id], conversation);
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      if (prompt) {
        router.push(`/(app)/chat/${conversation.id}?prompt=${encodeURIComponent(prompt)}`);
      } else {
        router.push(`/(app)/chat/${conversation.id}`);
      }
    },
    onError: (err) => {
      pendingPromptRef.current = null;
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    },
  });

  const handleChipPress = (prompt: string) => {
    setError(null);
    pendingPromptRef.current = prompt;
    createConversation.mutate();
  };

  const modelLabel =
    CLAUDE_MODELS.find((m) => m.id === preferredModel)?.name ?? 'Sonnet';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.menuBtn}
          accessibilityLabel="Open sidebar"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu-outline" size={24} color={COLORS.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>ArkChat</Text>
        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>{modelLabel}</Text>
        </View>
      </View>

      {/* ── Center content ── */}
      <View style={styles.center}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow} />
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>✦</Text>
          </View>
        </View>

        <Text style={styles.headline}>How can I help you?</Text>
        <Text style={styles.subheadline}>
          Start a new conversation to explore ideas, get answers, or create
          anything with AI.
        </Text>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* New Conversation button */}
        <TouchableOpacity
          style={[
            styles.newConvBtn,
            createConversation.isPending && styles.newConvBtnDisabled,
          ]}
          onPress={() => {
            setError(null);
            createConversation.mutate();
          }}
          disabled={createConversation.isPending}
          activeOpacity={0.8}
          accessibilityLabel="Start a new conversation"
          accessibilityRole="button"
        >
          {createConversation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={20} color="#fff" />
          )}
          <Text style={styles.newConvBtnText}>
            {createConversation.isPending ? 'Creating…' : 'New Conversation'}
          </Text>
        </TouchableOpacity>

        {/* Capability chips */}
        <View style={styles.chips}>
          {CAPABILITY_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip.label}
              style={styles.chip}
              onPress={() => handleChipPress(chip.prompt)}
              disabled={createConversation.isPending}
              activeOpacity={0.7}
            >
              <Text style={styles.chipIcon}>{chip.icon}</Text>
              <Text style={styles.chipText}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const CAPABILITY_CHIPS = [
  { icon: '💡', label: 'Brainstorm ideas', prompt: 'Help me brainstorm ideas for' },
  { icon: '✍️', label: 'Write & edit', prompt: 'Help me write or edit' },
  { icon: '🔍', label: 'Research topics', prompt: 'Research and explain' },
  { icon: '💻', label: 'Code & debug', prompt: 'Help me code or debug' },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.3,
  },
  modelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  modelBadgeText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  // Center content
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  logoMark: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIcon: { fontSize: 36, color: COLORS.primary },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.foreground,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subheadline: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
  },
  // CTA button
  newConvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    minWidth: 220,
  },
  newConvBtnDisabled: { opacity: 0.65 },
  newConvBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Chips
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipIcon: { fontSize: 14 },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
});
