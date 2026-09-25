import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@/store/settings.store';
import { useChatStore } from '@/store/chat.store';
import { useChat } from './useChat';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { MessageInput } from './MessageInput';
import { ArtifactPanel } from './ArtifactPanel';
import type { Artifact, Message, UploadedFile } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F172A',
  border: '#334155',
  foreground: '#F8FAFC',
  muted: '#64748B',
  primary: '#2563EB',
} as const;

// ---------------------------------------------------------------------------
// Welcome / empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>✦</Text>
      </View>
      <Text style={styles.emptyTitle}>How can I help you today?</Text>
      <Text style={styles.emptySubtitle}>
        Ask me anything — code, writing, analysis, or just a conversation.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Scroll-to-bottom FAB
// ---------------------------------------------------------------------------

function ScrollToBottomFab({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.scrollFab, { opacity: fadeAnim }]} pointerEvents="box-none">
      <TouchableOpacity style={styles.scrollFabBtn} onPress={onPress} activeOpacity={0.8}>
        <Ionicons name="chevron-down" size={20} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatScreenProps {
  conversationId: string;
  conversationTitle?: string;
  initialPrompt?: string;
}

// ---------------------------------------------------------------------------
// ChatScreen
// ---------------------------------------------------------------------------

export function ChatScreen({ conversationId, conversationTitle, initialPrompt }: ChatScreenProps) {
  const flatListRef = useRef<FlatList<Message>>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const autoSentRef = useRef(false);

  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  const { messages, isStreaming, streamingText, sendMessage, stopStreaming, regenerateMessage, editMessage } =
    useChat(conversationId);

  useEffect(() => {
    if (initialPrompt && !autoSentRef.current) {
      autoSentRef.current = true;
      setTimeout(() => sendMessage(initialPrompt), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 60);
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages.length, streamingText, isAtBottom, scrollToBottom]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    setIsAtBottom(distanceFromBottom < 80);
  }, []);

  // ── Message actions ──────────────────────────────────────────────────────
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      await regenerateMessage(messageId);
    },
    [regenerateMessage],
  );

  const handleEdit = useCallback(
    async (messageId: string, currentText: string) => {
      // In a full implementation you'd show an inline edit input;
      // for now, re-send the current text as an edit operation
      await editMessage(messageId, currentText);
    },
    [editMessage],
  );

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string, files?: UploadedFile[]) => {
      setIsAtBottom(true);
      await sendMessage(text, files);
    },
    [sendMessage],
  );

  // ── Render item ──────────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        onRegenerate={item.role === 'assistant' ? handleRegenerate : undefined}
        onEdit={item.role === 'user' ? handleEdit : undefined}
        onArtifactPress={setOpenArtifact}
      />
    ),
    [handleRegenerate, handleEdit],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // ── Footer: streaming preview ────────────────────────────────────────────
  const ListFooter = useMemo(() => {
    if (!isStreaming) return null;
    if (streamingText) {
      const streamMsg: Message = {
        id: '__streaming__',
        conversation_id: conversationId,
        role: 'assistant',
        content: [{ type: 'text', text: streamingText }],
        model: preferredModel,
        created_at: new Date().toISOString(),
        parent_id: null,
        branch_index: 0,
      };
      return (
        <MessageBubble
          message={streamMsg}
          isStreaming
          streamingText={streamingText}
        />
      );
    }
    return <TypingIndicator />;
  }, [isStreaming, streamingText, conversationId, preferredModel]);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={80}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 100,
          }}
          ListEmptyComponent={<EmptyState />}
          ListFooterComponent={ListFooter}
          ListFooterComponentStyle={styles.footer}
        />

        {/* Scroll-to-bottom FAB */}
        <ScrollToBottomFab
          visible={!isAtBottom}
          onPress={() => {
            setIsAtBottom(true);
            scrollToBottom();
          }}
        />

        {/* Input */}
        <MessageInput isStreaming={isStreaming} onSend={handleSend} onStop={stopStreaming} />
      </KeyboardAvoidingView>

      {/* Artifact panel */}
      <ArtifactPanel artifact={openArtifact} onClose={() => setOpenArtifact(null)} />
    </View>
  );
}

export default ChatScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  listContent: {
    paddingVertical: 16,
    gap: 4,
  },
  listContentEmpty: {
    flex: 1,
  },
  footer: {
    paddingBottom: 8,
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconText: {
    fontSize: 28,
    color: COLORS.primary,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.foreground,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  // Scroll FAB
  scrollFab: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
    zIndex: 10,
  },
  scrollFabBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
});
