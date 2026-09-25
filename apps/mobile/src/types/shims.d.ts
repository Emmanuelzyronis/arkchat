// Type shims for packages whose types aren't at the top-level node_modules
// (resolved at runtime by Metro via nested expo/node_modules)

declare module 'react-native-gesture-handler' {
  import { ComponentType, ReactNode } from 'react';
  import { ViewProps } from 'react-native';

  export const GestureHandlerRootView: ComponentType<ViewProps & { children?: ReactNode }>;

  export const GestureDetector: ComponentType<{ gesture: unknown; children?: ReactNode }>;

  interface GestureBuilder {
    activeOffsetX(range: [number, number]): this;
    onUpdate(cb: (e: { translationX: number; translationY: number; velocityX: number; velocityY: number }) => void): this;
    onEnd(cb: (e: { translationX: number; velocityX: number }) => void): this;
    onBegin(cb: (e: unknown) => void): this;
    onFinalize(cb: (e: unknown) => void): this;
    runOnJS(value: boolean): this;
    enabled(value: boolean): this;
    minDistance(value: number): this;
    maxDistance(value: number): this;
  }

  export const Gesture: {
    Pan(): GestureBuilder;
    Tap(): GestureBuilder;
    LongPress(): GestureBuilder;
    Simultaneous(...gestures: GestureBuilder[]): GestureBuilder;
    Race(...gestures: GestureBuilder[]): GestureBuilder;
    Exclusive(...gestures: GestureBuilder[]): GestureBuilder;
  };

  export const ScrollView: ComponentType<unknown>;
  export const FlatList: ComponentType<unknown>;
  export const Switch: ComponentType<unknown>;
  export const TextInput: ComponentType<unknown>;
  export const DrawerLayout: ComponentType<unknown>;
  export const PanGestureHandler: ComponentType<unknown>;
  export const TapGestureHandler: ComponentType<unknown>;
  export const LongPressGestureHandler: ComponentType<unknown>;
  export const State: Record<string, number>;
}
declare module 'react-native-gesture-handler/DrawerLayout' {
  const DrawerLayout: unknown;
  export default DrawerLayout;
}


declare module 'expo-constants' {
  const Constants: {
    expoConfig?: Record<string, unknown> | null;
    manifest?: Record<string, unknown> | null;
    manifest2?: Record<string, unknown> | null;
  };
  export default Constants;
}

declare module 'expo-status-bar' {
  import { ComponentType } from 'react';
  interface StatusBarProps {
    style?: 'auto' | 'inverted' | 'light' | 'dark';
    backgroundColor?: string;
    translucent?: boolean;
    hidden?: boolean;
    animated?: boolean;
    networkActivityIndicatorVisible?: boolean;
  }
  export const StatusBar: ComponentType<StatusBarProps>;
  export function setStatusBarStyle(style: 'auto' | 'inverted' | 'light' | 'dark', animated?: boolean): void;
  export function setStatusBarHidden(hidden: boolean, animation?: 'none' | 'fade' | 'slide'): void;
}
