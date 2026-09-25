import React, { useState, useCallback } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '@/components/ui/TextInput';
import { ModelSelector } from '@/features/chat/ModelSelector';
import { useSettingsStore } from '@/store/settings.store';
import { useAuthStore } from '@/store/auth.store';
import { apiClient } from '@/lib/api';
import type { ClaudeModel } from '@arkchat/types';

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
} as const;

// ---------------------------------------------------------------------------
// Section container
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

interface SettingsRowProps {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  isLast?: boolean;
}

function SettingsRow({ label, sublabel, right, onPress, destructive, isLast }: SettingsRowProps) {
  const inner = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? (
        <Ionicons name="chevron-forward" size={16} color={COLORS.mutedFg} />
      ) : null)}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

// ---------------------------------------------------------------------------
// 3-segment control
// ---------------------------------------------------------------------------

interface SegmentedControlProps<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.segmentedControl}>
      {options.map((opt, i) => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.segment,
            value === opt.value && styles.segmentActive,
            i === 0 && styles.segmentFirst,
            i === options.length - 1 && styles.segmentLast,
          ]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.segmentLabel,
              value === opt.value && styles.segmentLabelActive,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark' | 'system';
type FontSize = 'sm' | 'md' | 'lg';

const THEME_OPTIONS: { label: string; value: Theme }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

const FONT_SIZE_OPTIONS: { label: string; value: FontSize }[] = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);

  const theme = useSettingsStore((s) => s.theme) as Theme;
  const fontSize = useSettingsStore((s) => s.fontSize) as FontSize;
  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const customInstructions = useSettingsStore((s) => s.customInstructions);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setModel = useSettingsStore((s) => s.setModel);
  const setCustomInstructions = useSettingsStore((s) => s.setCustomInstructions);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const setMemoryEnabled = useSettingsStore((s) => s.setMemoryEnabled);

  const parseInstructions = (raw: string | null | undefined) => {
    if (!raw) return { aboutMe: '', responseStyle: '' };
    const aboutMatch = raw.match(/## About Me\n([\s\S]*?)(?:\n\n## |$)/);
    const styleMatch = raw.match(/## Response Style\n([\s\S]*?)$/);
    return {
      aboutMe: aboutMatch ? aboutMatch[1].trim() : '',
      responseStyle: styleMatch ? styleMatch[1].trim() : '',
    };
  };

  const parsed = parseInstructions(customInstructions);
  const [aboutMe, setAboutMe] = useState(parsed.aboutMe);
  const [responseStyle, setResponseStyle] = useState(parsed.responseStyle);
  const [savingInstructions, setSavingInstructions] = useState(false);

  const handleSaveInstructions = useCallback(async () => {
    setSavingInstructions(true);
    const parts: string[] = [];
    if (aboutMe.trim()) parts.push(`## About Me\n${aboutMe.trim()}`);
    if (responseStyle.trim()) parts.push(`## Response Style\n${responseStyle.trim()}`);
    const combined = parts.join('\n\n');
    setCustomInstructions(combined);
    try {
      await apiClient.updateProfile({ customInstructions: combined });
    } catch {
      // Store is already updated; API failure is non-fatal
    }
    setSavingInstructions(false);
  }, [aboutMe, responseStyle, setCustomInstructions]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // In a full implementation, call API to delete account
            signOut();
          },
        },
      ],
    );
  };

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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Appearance ── */}
          <Section title="Appearance">
            <SettingsRow
              label="Theme"
              right={
                <SegmentedControl
                  options={THEME_OPTIONS}
                  value={theme}
                  onChange={setTheme}
                />
              }
            />
            <SettingsRow
              label="Font Size"
              isLast
              right={
                <SegmentedControl
                  options={FONT_SIZE_OPTIONS}
                  value={fontSize}
                  onChange={setFontSize}
                />
              }
            />
          </Section>

          {/* ── Model ── */}
          <Section title="Model">
            <View style={styles.modelSelectorWrap}>
              <ModelSelector
                selectedModel={preferredModel}
                onSelect={(m: ClaudeModel) => setModel(m)}
              />
            </View>
          </Section>

          {/* ── Custom Instructions ── */}
          <Section title="Custom Instructions">
            <View style={styles.instrRow}>
              <Text style={styles.instrLabel}>About me</Text>
              <TextInput
                placeholder="What should ArkChat know about you?"
                value={aboutMe}
                onChangeText={setAboutMe}
                multiline
                style={styles.instrInput}
              />
            </View>
            <View style={styles.instrRow}>
              <Text style={styles.instrLabel}>How I want ArkChat to respond</Text>
              <TextInput
                placeholder="Tone, format, language preferences…"
                value={responseStyle}
                onChangeText={setResponseStyle}
                multiline
                style={styles.instrInput}
              />
            </View>
            <View style={styles.instrRowLast}>
              <TouchableOpacity
                style={[styles.saveBtn, savingInstructions && styles.saveBtnDisabled]}
                onPress={handleSaveInstructions}
                disabled={savingInstructions}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>
                  {savingInstructions ? 'Saving…' : 'Save Instructions'}
                </Text>
              </TouchableOpacity>
            </View>
          </Section>

          {/* ── Memory ── */}
          <Section title="Memory">
            <SettingsRow
              label="Enable Memory"
              sublabel="ArkChat remembers context across chats"
              right={
                <Switch
                  value={memoryEnabled}
                  onValueChange={setMemoryEnabled}
                  trackColor={{ false: '#334155', true: COLORS.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor="#334155"
                />
              }
            />
            <SettingsRow
              label="View & Edit Memories"
              isLast
              onPress={() => router.push('/(app)/memory')}
            />
          </Section>

          {/* ── Account ── */}
          <Section title="Account">
            <SettingsRow
              label="Email"
              sublabel={user?.email ?? ''}
              isLast={false}
            />
            <SettingsRow
              label="Sign Out"
              onPress={handleSignOut}
              isLast={false}
            />
            <SettingsRow
              label="Delete Account"
              destructive
              onPress={handleDeleteAccount}
              isLast
            />
          </Section>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  headerRight: { width: 36 },
  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.sectionLabel,
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    minHeight: 50,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLeft: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: '500',
  },
  rowLabelDestructive: { color: COLORS.destructive },
  rowSublabel: {
    fontSize: 12,
    color: COLORS.mutedFg,
    marginTop: 1,
  },
  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segmentFirst: { borderRadius: 0 },
  segmentLast: { borderRadius: 0 },
  segmentActive: {
    backgroundColor: COLORS.primary,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.mutedFg,
  },
  segmentLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  // Model selector
  modelSelectorWrap: {
    padding: 14,
  },
  // Custom instructions
  instrRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  instrRowLast: { borderBottomWidth: 0 },
  instrLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.mutedFg,
    letterSpacing: 0.2,
  },
  instrInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  saveBtn: {
    margin: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
