import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CLAUDE_MODELS } from '@arkchat/types';
import type { ClaudeModel } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F172A',
  card: '#111827',
  cardActive: '#1A2744',
  border: '#334155',
  borderActive: '#2563EB',
  foreground: '#F8FAFC',
  muted: '#CBD5E1',
  mutedForeground: '#64748B',
  primary: '#2563EB',
  accent: '#EA580C',
} as const;

// Map model id → emoji icon
const MODEL_ICONS: Record<ClaudeModel, string> = {
  'claude-haiku-4-5': '⚡',
  'claude-sonnet-4-6': '✦',
  'claude-sonnet-5': '⚖️',
  'claude-opus-5-5': '🧠',
};

const MODEL_TAGLINES: Record<ClaudeModel, string> = {
  'claude-haiku-4-5': 'Fast',
  'claude-sonnet-4-6': 'Azure',
  'claude-sonnet-5': 'Balanced',
  'claude-opus-5-5': 'Capable',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModelSelectorProps {
  selectedModel: ClaudeModel;
  onSelect: (model: ClaudeModel) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  return (
    <View style={styles.container}>
      {CLAUDE_MODELS.map((m) => {
        const active = m.id === selectedModel;
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => onSelect(m.id)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${m.name} model – ${m.description}`}
          >
            {/* Icon */}
            <Text style={styles.icon}>{MODEL_ICONS[m.id]}</Text>

            {/* Labels */}
            <Text
              style={[styles.name, active && styles.nameActive]}
              numberOfLines={1}
            >
              {m.name}
            </Text>
            <Text style={styles.tagline} numberOfLines={1}>
              {MODEL_TAGLINES[m.id]}
            </Text>
            <Text style={styles.description} numberOfLines={2}>
              {m.description}
            </Text>

            {/* Active indicator */}
            {active && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default ModelSelector;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  cardActive: {
    borderColor: COLORS.borderActive,
    backgroundColor: COLORS.cardActive,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  icon: {
    fontSize: 22,
    marginBottom: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.1,
  },
  nameActive: {
    color: COLORS.foreground,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60A5FA',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 11,
    color: COLORS.mutedForeground,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 2,
  },
  activeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.primary,
  },
});
