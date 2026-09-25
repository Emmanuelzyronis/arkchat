import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  /** Display name used to derive initials when no image is provided */
  name?: string | null;
  /** Remote image URI */
  uri?: string | null;
  size?: AvatarSize;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const DIMENSION: Record<AvatarSize, number> = { sm: 24, md: 32, lg: 40 };
const FONT_SIZE: Record<AvatarSize, number> = { sm: 9, md: 12, lg: 15 };

// Gradient of subtle brand-tinted backgrounds derived from initials
const BG_COLORS = [
  '#1E3A5F', // blue-navy
  '#1E4034', // green-dark
  '#3B1F4A', // purple-dark
  '#4A2512', // orange-dark
  '#1A2F4A', // steel
  '#2E1F3B', // violet
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BG_COLORS[Math.abs(hash) % BG_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Avatar: React.FC<AvatarProps> = ({ name, uri, size = 'md' }) => {
  const dim = DIMENSION[size];
  const fontSize = FONT_SIZE[size];

  const containerStyle = [
    styles.container,
    {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      backgroundColor: name ? pickColor(name) : '#1E293B',
    },
  ];

  if (uri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri }}
          style={{ width: dim, height: dim, borderRadius: dim / 2 }}
          resizeMode="cover"
          accessibilityLabel={name ?? 'Avatar'}
        />
      </View>
    );
  }

  const initials = name ? getInitials(name) : '?';

  return (
    <View style={containerStyle} accessibilityLabel={name ?? 'Avatar'}>
      <Text style={[styles.initials, { fontSize, lineHeight: dim }]}>
        {initials}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
  },
  initials: {
    color: '#E2E8F0',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

export default Avatar;
