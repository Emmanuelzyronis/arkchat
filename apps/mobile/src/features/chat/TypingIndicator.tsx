import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

const COLORS = {
  dot: '#CBD5E1',
  aiBubbleBg: '#111827',
  border: '#334155',
};

const DOT_SIZE = 8;
const BOUNCE_HEIGHT = -7;
const LOOP_DURATION = 1200; // total ms for one full cycle
const DOT_DURATION = 300;

// ---------------------------------------------------------------------------
// Single dot
// ---------------------------------------------------------------------------

function Dot({ delay }: { delay: number }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateY, {
          toValue: BOUNCE_HEIGHT,
          duration: DOT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: DOT_DURATION,
          useNativeDriver: true,
        }),
        Animated.delay(LOOP_DURATION - DOT_DURATION * 2 - delay),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, translateY]);

  return (
    <Animated.View
      style={[styles.dot, { transform: [{ translateY }] }]}
    />
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

export function TypingIndicator() {
  return (
    <View style={styles.row}>
      {/* ArkChat avatar */}
      <View style={styles.avatar}>
        <Animated.Text style={styles.avatarText}>✦</Animated.Text>
      </View>

      {/* Bubble */}
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={180} />
        <Dot delay={360} />
      </View>
    </View>
  );
}

export default TypingIndicator;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    color: '#2563EB',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: COLORS.aiBubbleBg,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: COLORS.dot,
  },
});
