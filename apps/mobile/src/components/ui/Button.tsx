import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Design tokens (matching app colour system)
// ---------------------------------------------------------------------------

const COLORS = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  accent: '#EA580C',
  card: '#111827',
  muted: '#1E293B',
  border: '#334155',
  foreground: '#F8FAFC',
  mutedForeground: '#94A3B8',
  destructive: '#EF4444',
  destructiveDark: '#DC2626',
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEIGHT: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
const H_PADDING: Record<Size, number> = { sm: 12, md: 16, lg: 20 };
const FONT_SIZE: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    // Minimum 44px touch target per HIG / Material guidelines
    minHeight: 44,
    gap: 8,
  },
  // Variant backgrounds
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    // Glassmorphism card feel
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
  },
  destructive: {
    backgroundColor: COLORS.destructive,
  },
  // Text colours per variant
  primaryText: { color: '#FFFFFF', fontWeight: '600' },
  secondaryText: { color: COLORS.foreground, fontWeight: '500' },
  ghostText: { color: COLORS.mutedForeground, fontWeight: '500' },
  destructiveText: { color: '#FFFFFF', fontWeight: '600' },
  // Disabled
  disabled: { opacity: 0.45 },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  style,
  ...rest
}) => {
  const isDisabled = disabled || loading;
  const height = HEIGHT[size];
  const paddingHorizontal = H_PADDING[size];
  const fontSize = FONT_SIZE[size];

  const containerStyle = [
    styles.base,
    styles[variant],
    { height, paddingHorizontal },
    isDisabled && styles.disabled,
    style,
  ];

  const textStyle = [
    styles[`${variant}Text`],
    { fontSize, lineHeight: fontSize * 1.4 },
  ];

  const spinnerColor =
    variant === 'primary' || variant === 'destructive' ? '#FFFFFF' : COLORS.mutedForeground;

  return (
    <TouchableOpacity
      style={containerStyle}
      disabled={isDisabled}
      activeOpacity={0.75}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : null}
      {typeof children === 'string' ? (
        <Text style={textStyle} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {children}
        </View>
      )}
    </TouchableOpacity>
  );
};

export default Button;
