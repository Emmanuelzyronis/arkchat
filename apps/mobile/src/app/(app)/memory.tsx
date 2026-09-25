import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { apiClient } from '@/lib/api';
import { TextInput } from '@/components/ui/TextInput';
import type { Memory } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F172A',
  card: '#111827',
  border: '#334155',
  foreground: '#F8FAFC',
  muted: '#CBD5E1',
  mutedFg: '#64748B',
  primary: '#2563EB',
  accent: '#EA580C',
  destructive: '#EF4444',
  sectionLabel: '#475569',
  modalBg: 'rgba(0,0,0,0.75)',
} as const;

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  preference: { bg: 'rgba(37, 99, 235, 0.15)', text: '#60A5FA' },
  fact: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ADE80' },
  goal: { bg: 'rgba(234, 88, 12, 0.15)', text: '#FB923C' },
  context: { bg: 'rgba(168, 85, 247, 0.15)', text: '#C084FC' },
  default: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94A3B8' },
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS.default;
  return (
    <View style={[styles.badge, { backgroundColor: color.bg }]}>
      <Text style={[styles.badgeText, { color: color.text }]}>
        {category}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Memory card
// ---------------------------------------------------------------------------

interface MemoryCardProps {
  memory: Memory;
  onDelete: (id: string) => void;
}

function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Memory',
      'Remove this memory? ArkChat will no longer remember this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(memory.id),
        },
      ],
    );
  };

  const timeAgo = relativeTime(memory.created_at);

  return (
    <TouchableOpacity
      style={styles.memoryCard}
      onLongPress={handleLongPress}
      activeOpacity={0.85}
      delayLongPress={350}
    >
      <View style={styles.memoryCardHeader}>
        <CategoryBadge category={memory.category} />
        <Text style={styles.memoryTime}>{timeAgo}</Text>
        <TouchableOpacity
          onPress={handleLongPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={15} color={COLORS.mutedFg} />
        </TouchableOpacity>
      </View>
      <Text style={styles.memoryContent} selectable>
        {memory.content}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Add memory modal
// ---------------------------------------------------------------------------

const MEMORY_CATEGORIES = ['preference', 'fact', 'goal', 'context', 'other'];

interface AddMemoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (content: string, category: string) => void;
  isSaving: boolean;
}

function AddMemoryModal({ visible, onClose, onSave, isSaving }: AddMemoryModalProps) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('fact');

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(content.trim(), category);
    setContent('');
    setCategory('fact');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.modalSheet}>
          {/* Handle */}
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Add Memory</Text>

          {/* Content */}
          <TextInput
            placeholder="What should ArkChat remember?"
            value={content}
            onChangeText={setContent}
            multiline
            style={styles.modalInput}
          />

          {/* Category picker */}
          <Text style={styles.categoryLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {MEMORY_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, (!content.trim() || isSaving) && styles.modalSaveBtnDisabled]}
              onPress={handleSave}
              disabled={!content.trim() || isSaving}
            >
              <Text style={styles.modalSaveText}>{isSaving ? 'Saving…' : 'Save Memory'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MemoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);


  // ── Fetch ────────────────────────────────────────────────────────────────
  const {
    data: memories = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['memories'],
    queryFn: () => apiClient.getMemories(),
    staleTime: 30_000,
  });

  // ── Delete mutation ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteMemory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete memory. Please try again.');
    },
  });

  const addMutation = useMutation({
    mutationFn: ({ content, category }: { content: string; category: string }) =>
      apiClient.addMemory(content, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setShowAddModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to add memory. Please try again.');
    },
  });

  const handleAddMemory = useCallback(
    (content: string, category: string) => {
      addMutation.mutate({ content, category });
    },
    [addMutation],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = searchText.trim()
    ? memories.filter(
        (m) =>
          m.content.toLowerCase().includes(searchText.toLowerCase()) ||
          m.category.toLowerCase().includes(searchText.toLowerCase()),
      )
    : memories;

  // ── Render item ──────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Memory }) => (
      <MemoryCard memory={item} onDelete={handleDelete} />
    ),
    [handleDelete],
  );

  const keyExtractor = useCallback((item: Memory) => item.id, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Memories</Text>
        <View style={styles.headerRight}>
          <Text style={styles.memoryCount}>
            {memories.length > 0 ? `${memories.length}` : ''}
          </Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.mutedFg} style={styles.searchIcon} />
        <TextInput
          placeholder="Search memories…"
          value={searchText}
          onChangeText={setSearchText}
          style={styles.searchInput}
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={17} color={COLORS.mutedFg} />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
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
              <Ionicons name="bookmarks-outline" size={40} color={COLORS.mutedFg} />
              <Text style={styles.emptyTitle}>
                {searchText ? 'No matching memories' : 'No memories yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchText
                  ? 'Try a different search term.'
                  : 'As you chat, ArkChat will remember important things about you.'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.85}
        accessibilityLabel="Add memory"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Add memory modal */}
      <AddMemoryModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddMemory}
        isSaving={addMutation.isPending}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.foreground },
  headerRight: {
    width: 36,
    alignItems: 'flex-end',
  },
  memoryCount: {
    fontSize: 13,
    color: COLORS.mutedFg,
    fontWeight: '500',
  },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 42,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.foreground,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  // List
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 88, // FAB clearance
    gap: 10,
  },
  // Memory card
  memoryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  memoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memoryTime: {
    flex: 1,
    fontSize: 11,
    color: COLORS.mutedFg,
  },
  memoryContent: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 20,
  },
  // Category badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'capitalize',
  },
  // Empty state
  emptyState: {
    paddingTop: 64,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.muted,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  // Add modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.modalBg,
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  modalInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.mutedFg,
    letterSpacing: 0.2,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.mutedFg,
    textTransform: 'capitalize',
  },
  categoryChipTextActive: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  modalSaveBtnDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
