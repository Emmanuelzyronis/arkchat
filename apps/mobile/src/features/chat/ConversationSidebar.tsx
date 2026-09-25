import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { Avatar } from '@/components/ui/Avatar';
import type { Conversation } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0D1525',
  border: '#1E293B',
  borderStrong: '#334155',
  foreground: '#F8FAFC',
  muted: '#CBD5E1',
  mutedFg: '#64748B',
  primary: '#2563EB',
  accent: '#EA580C',
  activeRow: 'rgba(37, 99, 235, 0.08)',
  activeBorder: '#2563EB',
  deleteRed: '#EF4444',
  sectionLabel: '#475569',
} as const;

const SWIPE_DELETE_WIDTH = 72;

// ---------------------------------------------------------------------------
// Date grouping helpers
// ---------------------------------------------------------------------------

interface Group {
  title: string;
  data: Conversation[];
}

function getDateGroups(conversations: Conversation[]): Group[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const yesterdayMs = todayMs - DAY;
  const weekAgoMs = todayMs - 7 * DAY;

  const groups: Group[] = [
    { title: 'Today', data: [] },
    { title: 'Yesterday', data: [] },
    { title: 'Previous 7 Days', data: [] },
    { title: 'Older', data: [] },
  ];

  for (const c of conversations) {
    const ts = new Date(c.last_message_at ?? c.created_at).getTime();
    if (ts >= todayMs) groups[0].data.push(c);
    else if (ts >= yesterdayMs) groups[1].data.push(c);
    else if (ts >= weekAgoMs) groups[2].data.push(c);
    else groups[3].data.push(c);
  }

  return groups.filter((g) => g.data.length > 0);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Swipeable conversation row
// ---------------------------------------------------------------------------

interface SwipeableRowProps {
  conversation: Conversation;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
}

function SwipeableRow({ conversation, isActive, onPress, onDelete }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const snapOpen = () => {
    isOpen.current = true;
    Animated.spring(translateX, {
      toValue: -SWIPE_DELETE_WIDTH,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  };

  const snapClose = () => {
    isOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gs) =>
          Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gs) => {
          const base = isOpen.current ? -SWIPE_DELETE_WIDTH : 0;
          const next = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, base + gs.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gs) => {
          const threshold = SWIPE_DELETE_WIDTH * 0.4;
          if (isOpen.current) {
            if (gs.dx > threshold) snapClose();
            else snapOpen();
          } else {
            if (gs.dx < -threshold || gs.vx < -0.6) snapOpen();
            else snapClose();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleDeletePress = () => {
    snapClose();
    Alert.alert(
      'Delete Conversation',
      `Delete "${conversation.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ],
    );
  };

  const ts = conversation.last_message_at ?? conversation.updated_at ?? conversation.created_at;

  return (
    <View style={styles.swipeContainer}>
      {/* Delete button (revealed on swipe) */}
      <View style={styles.deleteReveal} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeletePress}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Animated row */}
      <Animated.View
        style={[styles.rowAnimated, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.convRow, isActive && styles.convRowActive]}
          onPress={() => {
            snapClose();
            onPress();
          }}
          activeOpacity={0.7}
        >
          {isActive && <View style={styles.activeBorder} />}
          <View style={styles.convRowInner}>
            <Text
              style={[styles.convTitle, isActive && styles.convTitleActive]}
              numberOfLines={1}
            >
              {conversation.title || 'Untitled'}
            </Text>
            <Text style={styles.convTime}>{relativeTime(ts)}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Flat list item
// ---------------------------------------------------------------------------

type FlatItem =
  | { kind: 'header'; title: string }
  | { kind: 'conv'; conversation: Conversation };

// ---------------------------------------------------------------------------
// ConversationSidebar
// ---------------------------------------------------------------------------

interface ConversationSidebarProps {
  onClose: () => void;
}

export function ConversationSidebar({ onClose }: ConversationSidebarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setConversations = useChatStore((s) => s.setConversations);
  const deleteConversationFromStore = useChatStore((s) => s.deleteConversation);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch conversations ──────────────────────────────────────────────────
  const {
    data: conversations = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.getConversations(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (conversations.length > 0) {
      setConversations(conversations);
    }
  }, [conversations, setConversations]);

  // ── Build flat list data ─────────────────────────────────────────────────
  const listData = useMemo((): FlatItem[] => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? conversations.filter((c) =>
          (c.title ?? 'New Chat').toLowerCase().includes(q),
        )
      : conversations;

    const sorted = [...filtered].sort((a, b) => {
      const ta = new Date(a.last_message_at ?? a.created_at).getTime();
      const tb = new Date(b.last_message_at ?? b.created_at).getTime();
      return tb - ta;
    });

    if (q) {
      return sorted.map((c) => ({ kind: 'conv' as const, conversation: c }));
    }

    const groups = getDateGroups(sorted);
    const items: FlatItem[] = [];
    for (const g of groups) {
      items.push({ kind: 'header', title: g.title });
      for (const c of g.data) {
        items.push({ kind: 'conv', conversation: c });
      }
    }
    return items;
  }, [conversations, searchQuery]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleNewChat = () => {
    onClose();
    router.push('/(app)');
  };

  const handleConversationPress = useCallback(
    (id: string) => {
      onClose();
      router.push(`/(app)/chat/${id}`);
    },
    [onClose, router],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiClient.deleteConversation(id);
        deleteConversationFromStore(id);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        Alert.alert('Error', 'Failed to delete conversation.');
      }
    },
    [deleteConversationFromStore, queryClient],
  );

  const handleSignOut = async () => {
    onClose();
    await signOut();
  };

  const handleSettings = () => {
    onClose();
    router.push('/(app)/settings');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.kind === 'header') {
        return <SectionHeader title={item.title} />;
      }
      return (
        <SwipeableRow
          conversation={item.conversation}
          isActive={item.conversation.id === activeConversationId}
          onPress={() => handleConversationPress(item.conversation.id)}
          onDelete={() => handleDelete(item.conversation.id)}
        />
      );
    },
    [activeConversationId, handleConversationPress, handleDelete],
  );

  const keyExtractor = useCallback((item: FlatItem) => {
    if (item.kind === 'header') return `header-${item.title}`;
    return item.conversation.id;
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}
      edges={['left', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>✦</Text>
          </View>
          <Text style={styles.brandName}>ArkChat</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={COLORS.mutedFg} />
        </TouchableOpacity>
      </View>

      {/* New Chat button */}
      <TouchableOpacity
        style={styles.newChatBtn}
        onPress={handleNewChat}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.newChatText}>New Chat</Text>
      </TouchableOpacity>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={15} color={COLORS.mutedFg} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={COLORS.mutedFg}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          selectionColor={COLORS.primary}
          keyboardAppearance="dark"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={COLORS.mutedFg} />
          </TouchableOpacity>
        )}
      </View>

      {/* Conversation list */}
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={32} color={COLORS.mutedFg} />
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>Start a new chat to get going</Text>
            </View>
          ) : null
        }
      />

      {/* Footer */}
      <View style={styles.footer}>
        {/* User info */}
        <View style={styles.userRow}>
          <Avatar name={user?.display_name ?? user?.email} uri={user?.avatar_url} size="md" />
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.display_name ?? 'User'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* Footer actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.footerBtn} onPress={handleSettings} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={16} color={COLORS.mutedFg} />
            <Text style={styles.footerBtnText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerBtn} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={16} color={COLORS.mutedFg} />
            <Text style={styles.footerBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default ConversationSidebar;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: { fontSize: 13, color: COLORS.primary },
  brandName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  newChatText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    color: COLORS.foreground,
    fontSize: 14,
    paddingVertical: 0,
  },
  // List
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.sectionLabel,
    letterSpacing: 1.2,
  },
  // Swipeable row
  swipeContainer: {
    overflow: 'hidden',
    position: 'relative',
  },
  deleteReveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: SWIPE_DELETE_WIDTH,
    backgroundColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: SWIPE_DELETE_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.deleteRed,
  },
  rowAnimated: {
    backgroundColor: COLORS.bg,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bg,
  },
  convRowActive: {
    backgroundColor: COLORS.activeRow,
  },
  activeBorder: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: 3,
    borderRadius: 2,
    backgroundColor: COLORS.activeBorder,
  },
  convRowInner: {
    flex: 1,
    gap: 2,
  },
  convTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.muted,
    lineHeight: 18,
  },
  convTitleActive: {
    color: COLORS.foreground,
    fontWeight: '600',
  },
  convTime: {
    fontSize: 11,
    color: COLORS.mutedFg,
  },
  // Empty state
  emptyState: {
    paddingTop: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.mutedFg,
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.sectionLabel,
    textAlign: 'center',
  },
  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userInfo: { flex: 1 },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  userEmail: {
    fontSize: 11,
    color: COLORS.mutedFg,
    marginTop: 1,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  footerBtnText: {
    fontSize: 12,
    color: COLORS.mutedFg,
    fontWeight: '500',
  },
});
