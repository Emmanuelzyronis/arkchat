import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import type { Artifact } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0A0E1A',
  card: '#111827',
  border: '#334155',
  foreground: '#F8FAFC',
  muted: '#CBD5E1',
  mutedFg: '#64748B',
  primary: '#2563EB',
  accent: '#EA580C',
  codeBg: '#0D1117',
  codeText: '#E2E8F0',
  tabActive: '#2563EB',
  tabInactive: '#1E293B',
} as const;

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const TABLET_WIDTH = 768;
const PANEL_WIDTH_TABLET = 360;

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type Tab = 'code' | 'preview' | 'raw';

const AVAILABLE_TABS: Record<Artifact['type'], Tab[]> = {
  code: ['code', 'raw'],
  html: ['preview', 'code', 'raw'],
  markdown: ['raw', 'code'],
  text: ['raw'],
};

// ---------------------------------------------------------------------------
// Markdown styles for the Raw/Markdown tab
// ---------------------------------------------------------------------------

const mdStyles = {
  body: { color: COLORS.foreground, fontSize: 14, lineHeight: 21 },
  paragraph: { color: COLORS.foreground, fontSize: 14, lineHeight: 21, marginVertical: 4 },
  heading1: { color: COLORS.foreground, fontSize: 18, fontWeight: '700' as const, marginTop: 12, marginBottom: 6 },
  heading2: { color: COLORS.foreground, fontSize: 16, fontWeight: '700' as const, marginTop: 8, marginBottom: 4 },
  strong: { fontWeight: '700' as const, color: COLORS.foreground },
  em: { fontStyle: 'italic' as const, color: COLORS.muted },
  link: { color: '#60A5FA' },
  bullet_list: { paddingLeft: 4 },
  list_item: { color: COLORS.foreground, fontSize: 14, lineHeight: 21 },
  code_inline: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    color: '#F472B6',
    backgroundColor: 'rgba(244, 114, 182, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
};

// ---------------------------------------------------------------------------
// Version navigation
// ---------------------------------------------------------------------------

interface VersionNavProps {
  version: number;
  maxVersion?: number;
  onPrev: () => void;
  onNext: () => void;
}

function VersionNav({ version, maxVersion = version, onPrev, onNext }: VersionNavProps) {
  return (
    <View style={styles.versionNav}>
      <TouchableOpacity
        onPress={onPrev}
        disabled={version <= 1}
        style={[styles.versionBtn, version <= 1 && styles.versionBtnDisabled]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="chevron-back" size={14} color={version <= 1 ? COLORS.mutedFg : COLORS.muted} />
      </TouchableOpacity>
      <Text style={styles.versionLabel}>v{version}</Text>
      <TouchableOpacity
        onPress={onNext}
        disabled={version >= maxVersion}
        style={[styles.versionBtn, version >= maxVersion && styles.versionBtnDisabled]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="chevron-forward" size={14} color={version >= maxVersion ? COLORS.mutedFg : COLORS.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  tabs: Tab[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const TAB_LABELS: Record<Tab, string> = {
    code: 'Code',
    preview: 'Preview',
    raw: 'Raw',
  };

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => onTabChange(tab)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
            {TAB_LABELS[tab]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel content
// ---------------------------------------------------------------------------

interface PanelContentProps {
  artifact: Artifact;
  activeTab: Tab;
}

function PanelContent({ artifact, activeTab }: PanelContentProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(artifact.content);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (activeTab === 'preview' && artifact.type === 'html') {
    return (
      <WebView
        source={{ html: artifact.content }}
        style={styles.webview}
        originWhitelist={['*']}
        sandbox="allow-scripts allow-same-origin"
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback={false}
        mixedContentMode="never"
        backgroundColor={COLORS.codeBg}
      />
    );
  }

  if (activeTab === 'raw' && artifact.type === 'markdown') {
    return (
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.mdContent}>
        <Markdown style={mdStyles as never}>{artifact.content}</Markdown>
      </ScrollView>
    );
  }

  // Code / raw text view
  return (
    <View style={styles.codeContainer}>
      <View style={styles.codeToolbar}>
        <Text style={styles.codeToolbarLang}>
          {artifact.language || artifact.type}
        </Text>
        <TouchableOpacity onPress={handleCopy} style={styles.toolbarCopyBtn}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? '#22C55E' : COLORS.mutedFg}
          />
          <Text style={[styles.toolbarCopyText, copied && styles.toolbarCopyDone]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.contentScroll} horizontal={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text selectable style={styles.codeText}>
            {artifact.content}
          </Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ArtifactPanel
// ---------------------------------------------------------------------------

interface ArtifactPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_WIDTH;

  // Animation values
  const slideAnim = useRef(
    new Animated.Value(isTablet ? PANEL_WIDTH_TABLET : 0),
  ).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('code');

  // Slide-in when artifact becomes non-null
  useEffect(() => {
    if (artifact) {
      // Reset tab to first available
      const tabs = AVAILABLE_TABS[artifact.type] ?? ['raw'];
      setActiveTab(tabs[0]);
      setVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide out
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: isTablet ? PANEL_WIDTH_TABLET : Dimensions.get('window').height * 0.55,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false));
    }
  }, [artifact, isTablet, opacityAnim, slideAnim]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible || !artifact) return null;

  const availableTabs = AVAILABLE_TABS[artifact.type] ?? ['raw'];
  const TYPE_BADGES: Record<string, string> = {
    code: 'Code',
    html: 'HTML',
    markdown: 'Markdown',
    text: 'Text',
  };

  const panelStyle = isTablet
    ? [
        styles.panelTablet,
        { transform: [{ translateX: slideAnim }] },
      ]
    : [
        styles.panelPhone,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ];

  return (
    <Animated.View style={panelStyle as unknown as object} pointerEvents="box-none">
      <View style={styles.panel}>
        {/* Drag handle (phone only) */}
        {!isTablet && <View style={styles.dragHandle} />}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerMeta}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{TYPE_BADGES[artifact.type]}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {artifact.title}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <VersionNav
              version={artifact.version}
              onPrev={() => {/* version navigation would update parent */}}
              onNext={() => {}}
            />
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab bar */}
        {availableTabs.length > 1 && (
          <TabBar
            tabs={availableTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}

        {/* Content */}
        <View style={styles.content}>
          <PanelContent artifact={artifact} activeTab={activeTab} />
        </View>
      </View>
    </Animated.View>
  );
}

export default ArtifactPanel;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Panel positioning
  panelTablet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: PANEL_WIDTH_TABLET,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  panelPhone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  panel: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  headerMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.3)',
    flexShrink: 0,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Version nav
  versionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  versionBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
  versionBtnDisabled: { opacity: 0.35 },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    paddingHorizontal: 2,
    minWidth: 20,
    textAlign: 'center',
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.mutedFg,
  },
  tabLabelActive: {
    color: COLORS.foreground,
    fontWeight: '600',
  },
  // Content area
  content: { flex: 1, overflow: 'hidden' },
  contentScroll: { flex: 1 },
  mdContent: { padding: 16 },
  // Code view
  codeContainer: { flex: 1 },
  codeToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#0A0E1A',
  },
  codeToolbarLang: {
    fontSize: 11,
    color: COLORS.mutedFg,
    fontFamily: MONO_FONT,
    fontWeight: '500',
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  toolbarCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarCopyText: { fontSize: 12, color: COLORS.mutedFg, fontWeight: '500' },
  toolbarCopyDone: { color: '#22C55E' },
  codeText: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.codeText,
    padding: 14,
  },
  webview: { flex: 1, backgroundColor: COLORS.codeBg },
});
