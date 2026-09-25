import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import type { Artifact, Message } from '@arkchat/types';
import { useSettingsStore } from '@/store/settings.store';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  userBubble: '#2563EB',
  aiBubble: '#111827',
  border: '#334155',
  foreground: '#F8FAFC',
  muted: '#CBD5E1',
  mutedFg: '#64748B',
  codeBg: '#0D1117',
  codeText: '#E2E8F0',
  actionBg: '#1E293B',
  primary: '#2563EB',
} as const;

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// ---------------------------------------------------------------------------
// Blinking cursor
// ---------------------------------------------------------------------------

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.Text style={[styles.cursor, { opacity }]}>|</Animated.Text>;
}

// ---------------------------------------------------------------------------
// Code block (inside markdown)
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language || 'code'}</Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={styles.copyBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={13}
            color={copied ? '#22C55E' : COLORS.mutedFg}
          />
          <Text style={[styles.copyBtnText, copied && styles.copyBtnCopied]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={styles.codeText}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Markdown configuration
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MARKDOWN_RULES = {
  fence: (node: any) => (
    <CodeBlock
      key={node.key}
      code={(node.content as string).replace(/\n$/, '')}
      language={(node.info as string | undefined)?.trim() ?? ''}
    />
  ),
  code_inline: (node: any) => (
    <Text key={node.key} style={styles.inlineCode}>
      {node.content as string}
    </Text>
  ),
};

const FONT_BASE: Record<string, number> = { sm: 13, md: 15, lg: 17 };

function buildMarkdownStyles(base: number) {
  const line = Math.round(base * 1.47);
  return {
    body: { color: COLORS.foreground, fontSize: base, lineHeight: line },
    heading1: { color: COLORS.foreground, fontSize: base + 5, fontWeight: '700' as const, marginTop: 12, marginBottom: 6 },
    heading2: { color: COLORS.foreground, fontSize: base + 2, fontWeight: '700' as const, marginTop: 10, marginBottom: 4 },
    heading3: { color: COLORS.foreground, fontSize: base, fontWeight: '700' as const, marginTop: 8, marginBottom: 4 },
    paragraph: { color: COLORS.foreground, fontSize: base, lineHeight: line, marginVertical: 4 },
    strong: { fontWeight: '700' as const, color: COLORS.foreground },
    em: { fontStyle: 'italic' as const, color: COLORS.muted },
    link: { color: '#60A5FA', textDecorationLine: 'underline' as const },
    bullet_list: { paddingLeft: 4 },
    ordered_list: { paddingLeft: 4 },
    list_item: { color: COLORS.foreground, fontSize: base, lineHeight: line },
    blockquote: { borderLeftWidth: 3, borderLeftColor: COLORS.primary, paddingLeft: 12, marginVertical: 6, opacity: 0.85 },
    hr: { backgroundColor: COLORS.border, height: 1, marginVertical: 10 },
    table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginVertical: 8 },
    th: { backgroundColor: '#1E293B', padding: 8, color: COLORS.foreground, fontWeight: '600' as const },
    td: { padding: 8, color: COLORS.muted, borderTopWidth: 1, borderTopColor: COLORS.border },
  };
}

// ---------------------------------------------------------------------------
// Full-screen image viewer
// ---------------------------------------------------------------------------

function FullscreenImage({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.fullscreenBg}>
          <Animated.Image
            source={{ uri }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.fullscreenClose} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// File attachments row
// ---------------------------------------------------------------------------

function FileAttachments({ content }: { content: Message['content'] }) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const attachments = content.filter((c) => c.type === 'image' || c.type === 'file');
  if (attachments.length === 0) return null;

  return (
    <>
      {previewUri && (
        <FullscreenImage uri={previewUri} onClose={() => setPreviewUri(null)} />
      )}
      <View style={styles.attachments}>
        {attachments.map((a, i) =>
          a.type === 'image' && a.url ? (
            <TouchableOpacity
              key={i}
              onPress={() => setPreviewUri(a.url!)}
              activeOpacity={0.85}
            >
              <Animated.Image
                source={{ uri: a.url }}
                style={styles.attachmentThumb}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : (
            <View key={i} style={styles.fileChip}>
              <Ionicons name="document-outline" size={14} color={COLORS.muted} />
              <Text style={styles.fileChipName} numberOfLines={1}>
                {a.file_name ?? 'File'}
              </Text>
            </View>
          ),
        )}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Actions bar (long-press menu)
// ---------------------------------------------------------------------------

interface ActionsBarProps {
  isUser: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDismiss: () => void;
}

function ActionsBar({ isUser, onCopy, onRegenerate, onEdit, onDismiss }: ActionsBarProps) {
  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.actionsBar, isUser && styles.actionsBarUser]}>
          <TouchableOpacity style={styles.actionItem} onPress={onCopy}>
            <Ionicons name="copy-outline" size={15} color={COLORS.muted} />
            <Text style={styles.actionLabel}>Copy</Text>
          </TouchableOpacity>
          {!isUser && onRegenerate && (
            <TouchableOpacity style={styles.actionItem} onPress={onRegenerate}>
              <Ionicons name="refresh-outline" size={15} color={COLORS.muted} />
              <Text style={styles.actionLabel}>Retry</Text>
            </TouchableOpacity>
          )}
          {isUser && onEdit && (
            <TouchableOpacity style={styles.actionItem} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={15} color={COLORS.muted} />
              <Text style={styles.actionLabel}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ---------------------------------------------------------------------------
// Artifact badge
// ---------------------------------------------------------------------------

const ARTIFACT_ICONS: Record<string, string> = {
  code: '{ }',
  html: '</>',
  markdown: '¶',
  text: 'T',
};

function ArtifactBadge({ artifact, onPress }: { artifact: Artifact; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.artifactBadge} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.artifactBadgeIcon}>
        {ARTIFACT_ICONS[artifact.type] ?? '◈'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.artifactTitle} numberOfLines={1}>
          {artifact.title}
        </Text>
        <Text style={styles.artifactMeta}>
          {artifact.type} · v{artifact.version}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={COLORS.mutedFg} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingText?: string;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, currentText: string) => void;
  onArtifactPress?: (artifact: Artifact) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  streamingText,
  onRegenerate,
  onEdit,
  onArtifactPress,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const fontSizePref = useSettingsStore((s) => s.fontSize);
  const mdStyles = useMemo(
    () => buildMarkdownStyles(FONT_BASE[fontSizePref] ?? 15),
    [fontSizePref],
  );
  const textBase = FONT_BASE[fontSizePref] ?? 15;
  const textContent = message.content.find((c) => c.type === 'text')?.text ?? '';
  const displayText = isStreaming && streamingText !== undefined ? streamingText : textContent;
  const artifacts = message.content
    .filter((c) => c.type === 'artifact' && c.artifact)
    .map((c) => c.artifact!);

  // Fade + slide-up animation on mount
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateYAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showActions, setShowActions] = useState(false);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowActions(true);
  }, []);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(displayText);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowActions(false);
  }, [displayText]);

  const handleRegenerate = useCallback(() => {
    setShowActions(false);
    onRegenerate?.(message.id);
  }, [message.id, onRegenerate]);

  const handleEdit = useCallback(() => {
    setShowActions(false);
    onEdit?.(message.id, textContent);
  }, [message.id, textContent, onEdit]);

  return (
    <Animated.View
      style={[
        styles.outerRow,
        isUser ? styles.outerRowUser : styles.outerRowAI,
        { opacity: fadeAnim, transform: [{ translateY: translateYAnim }] },
      ]}
    >
      {/* ArkChat avatar (AI only) */}
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>✦</Text>
        </View>
      )}

      <View style={styles.bubbleWrapper}>
        {/* Long-press actions overlay */}
        {showActions && (
          <ActionsBar
            isUser={isUser}
            onCopy={handleCopy}
            onRegenerate={onRegenerate ? handleRegenerate : undefined}
            onEdit={onEdit ? handleEdit : undefined}
            onDismiss={() => setShowActions(false)}
          />
        )}

        {/* File attachments (above text for user) */}
        {isUser && <FileAttachments content={message.content} />}

        {/* Bubble */}
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={handleLongPress}
          onPress={() => showActions && setShowActions(false)}
          delayLongPress={350}
        >
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
            {isUser ? (
              <Text style={[styles.userText, { fontSize: textBase, lineHeight: Math.round(textBase * 1.47) }]} selectable>
                {displayText}
                {isStreaming && <BlinkingCursor />}
              </Text>
            ) : (
              <View>
                <Markdown
                  style={mdStyles as never}
                  rules={MARKDOWN_RULES}
                >
                  {displayText}
                </Markdown>
                {isStreaming && <BlinkingCursor />}
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* File attachments (below bubble for AI) */}
        {!isUser && <FileAttachments content={message.content} />}

        {/* Artifact badges */}
        {artifacts.length > 0 && (
          <View style={styles.artifactsRow}>
            {artifacts.map((a) => (
              <ArtifactBadge key={a.id} artifact={a} onPress={() => onArtifactPress?.(a)} />
            ))}
          </View>
        )}

        {/* Timestamp */}
        {!isStreaming && (
          <Text style={[styles.timestamp, isUser && styles.timestampUser]}>
            {formatTime(message.created_at)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

export default MessageBubble;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    marginVertical: 3,
  },
  outerRowUser: { justifyContent: 'flex-end' },
  outerRowAI: { justifyContent: 'flex-start' },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 20,
  },
  aiAvatarText: { fontSize: 12, color: '#2563EB' },
  bubbleWrapper: { maxWidth: '82%', gap: 4, position: 'relative' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  cursor: { color: COLORS.muted, fontSize: 15, lineHeight: 22, fontWeight: '100' },
  timestamp: {
    fontSize: 11,
    color: COLORS.mutedFg,
    marginTop: 2,
    paddingLeft: 4,
  },
  timestampUser: { textAlign: 'right', paddingLeft: 0, paddingRight: 4 },
  // Actions bar
  actionsBar: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    flexDirection: 'row',
    backgroundColor: COLORS.actionBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 6,
  },
  actionsBarUser: { left: undefined, right: 0 },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
  },
  actionLabel: { fontSize: 12, fontWeight: '500', color: COLORS.muted },
  // Attachments
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  attachmentThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 160,
  },
  fileChipName: { fontSize: 12, color: COLORS.muted, flex: 1 },
  // Code block
  codeBlock: {
    backgroundColor: COLORS.codeBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginVertical: 6,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    backgroundColor: '#0A0E1A',
  },
  codeLanguage: {
    fontSize: 11,
    color: COLORS.mutedFg,
    fontWeight: '500',
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 11, color: COLORS.mutedFg, fontWeight: '500' },
  copyBtnCopied: { color: '#22C55E' },
  codeText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.codeText,
    padding: 12,
  },
  inlineCode: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    color: '#F472B6',
    backgroundColor: 'rgba(244, 114, 182, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  // Artifacts
  artifactsRow: { gap: 6, marginTop: 4 },
  artifactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artifactBadgeIcon: {
    fontSize: 13,
    color: '#60A5FA',
    fontFamily: MONO_FONT,
    fontWeight: '700',
    width: 22,
    textAlign: 'center',
  },
  artifactTitle: { fontSize: 13, fontWeight: '600', color: COLORS.foreground },
  artifactMeta: {
    fontSize: 11,
    color: COLORS.mutedFg,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  // Fullscreen image
  fullscreenBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
