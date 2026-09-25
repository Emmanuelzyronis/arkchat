import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useDrawer } from '../_layout';
import { useChatStore } from '@/store/chat.store';
import { useSettingsStore } from '@/store/settings.store';
import { apiClient } from '@/lib/api';
import { CLAUDE_MODELS } from '@arkchat/types';
import { ChatScreen } from '@/features/chat/ChatScreen';

const COLORS = {
  bg: '#0F172A',
  border: '#334155',
  foreground: '#F8FAFC',
} as const;

export default function ChatRoute() {
  const { id, prompt: initialPrompt } = useLocalSearchParams<{ id: string; prompt?: string }>();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();

  const conversations = useChatStore((s) => s.conversations);
  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const modelLabel = CLAUDE_MODELS.find((m) => m.id === preferredModel)?.name ?? 'Sonnet';
  const storeTitle = conversations.find((c) => c.id === id)?.title;

  const { data: conversationData } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => apiClient.getConversation(id),
    enabled: !storeTitle && !!id,
    staleTime: 60_000,
  });

  const conversationTitle = storeTitle ?? conversationData?.conversation?.title ?? null;

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.headerBtn}
          accessibilityLabel="Open sidebar"
        >
          <Ionicons name="menu-outline" size={22} color={COLORS.foreground} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {conversationTitle || 'New Chat'}
        </Text>

        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>{modelLabel}</Text>
        </View>
      </View>

      {/* Full-featured chat with file uploads, regenerate, edit, artifact panel */}
      <ChatScreen
        conversationId={id}
        conversationTitle={conversationTitle ?? undefined}
        initialPrompt={initialPrompt ? decodeURIComponent(String(initialPrompt)) : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.foreground,
    marginHorizontal: 8,
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
    fontSize: 11,
    fontWeight: '600',
  },
});
