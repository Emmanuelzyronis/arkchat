import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ConversationSidebar } from '@/features/chat/ConversationSidebar';

// ---------------------------------------------------------------------------
// Drawer context – consumed by child screens to open/close the drawer
// ---------------------------------------------------------------------------

interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const DrawerContext = createContext<DrawerContextValue>({
  openDrawer: () => {},
  closeDrawer: () => {},
});

export const useDrawer = () => useContext(DrawerContext);

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);
const SWIPE_THRESHOLD = DRAWER_WIDTH * 0.4;
const COLORS = {
  bg: '#0F172A',
  drawer: '#0D1525',
  drawerBorder: '#1E293B',
  card: '#111827',
  muted: '#1E293B',
  border: '#334155',
  foreground: '#F8FAFC',
  mutedForeground: '#64748B',
  primary: '#2563EB',
  accent: '#EA580C',
} as const;

// ---------------------------------------------------------------------------
// Animated drawer shell
// ---------------------------------------------------------------------------

function DrawerShell({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        damping: 22,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -DRAWER_WIDTH,
        damping: 22,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setIsOpen(false));
  }, []);

  // Swipe-from-left gesture to open the drawer
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([8, 9999]) // Only activate on rightward swipes
    .onUpdate((e: { translationX: number }) => {
      if (!isOpen) {
        const raw = -DRAWER_WIDTH + e.translationX;
        translateX.setValue(Math.min(0, Math.max(-DRAWER_WIDTH, raw)));
        backdropOpacity.setValue(
          Math.min(1, Math.max(0, (e.translationX) / DRAWER_WIDTH)),
        );
      }
    })
    .onEnd((e: { translationX: number; velocityX: number }) => {
      if (!isOpen) {
        if (e.translationX > SWIPE_THRESHOLD || e.velocityX > 600) {
          openDrawer();
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: -DRAWER_WIDTH,
              damping: 22,
              stiffness: 200,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      }
    })
    .runOnJS(true);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      <GestureDetector gesture={swipeGesture}>
        <View style={styles.container}>
          {/* Main content */}
          {children}

          {/* Backdrop */}
          {isOpen ? (
            <TouchableWithoutFeedback onPress={closeDrawer} accessible={false}>
              <Animated.View
                style={[styles.backdrop, { opacity: backdropOpacity }]}
              />
            </TouchableWithoutFeedback>
          ) : null}

          {/* Drawer panel */}
          <Animated.View
            style={[
              styles.drawer,
              { transform: [{ translateX }] },
            ]}
            pointerEvents={isOpen ? 'box-none' : 'none'}
          >
            <ConversationSidebar onClose={closeDrawer} />
          </Animated.View>
        </View>
      </GestureDetector>
    </DrawerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// App group layout
// ---------------------------------------------------------------------------

export default function AppLayout() {
  return (
    <DrawerShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bg },
          animation: 'slide_from_right',
        }}
      />
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10,
  },
  // Drawer panel
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 24,
  },
  // Sidebar
  sidebar: {
    flex: 1,
    backgroundColor: COLORS.drawer,
    borderRightWidth: 1,
    borderRightColor: COLORS.drawerBorder,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: { fontSize: 15, color: COLORS.primary },
  brandName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.muted,
  },
  closeBtnText: { color: COLORS.mutedForeground, fontSize: 13, fontWeight: '600' },
  // New conversation button
  newConvBtn: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  newConvBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Body
  sidebarBody: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.mutedForeground,
    letterSpacing: 1.2,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  emptyList: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyListText: {
    color: COLORS.mutedForeground,
    fontSize: 13,
  },
  // Footer
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userInfo: { flex: 1 },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  userEmail: {
    fontSize: 12,
    color: COLORS.mutedForeground,
    marginTop: 1,
  },
  signOutBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.muted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  signOutText: {
    color: COLORS.mutedForeground,
    fontSize: 13,
    fontWeight: '500',
  },
});
