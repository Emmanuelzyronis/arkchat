import React, { useCallback, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { UploadedFile } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F172A',
  inputBg: '#1E293B',
  border: '#334155',
  borderFocus: '#2563EB',
  foreground: '#F8FAFC',
  placeholder: '#64748B',
  primary: '#2563EB',
  stop: '#EF4444',
  muted: '#CBD5E1',
  mutedFg: '#64748B',
  chipBg: '#111827',
  chipBorder: '#334155',
} as const;

const MAX_INPUT_HEIGHT = 120;

// ---------------------------------------------------------------------------
// File chip (attached file preview)
// ---------------------------------------------------------------------------

interface FileChipProps {
  file: UploadedFile;
  onRemove: () => void;
}

function FileChip({ file, onRemove }: FileChipProps) {
  const isImage = file.type.startsWith('image/');

  return (
    <View style={styles.fileChip}>
      {isImage ? (
        <Animated.Image
          source={{ uri: file.data }}
          style={styles.fileChipImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.fileChipIcon}>
          <Ionicons name="document-outline" size={16} color={COLORS.muted} />
        </View>
      )}
      <Text style={styles.fileChipName} numberOfLines={1}>
        {file.name}
      </Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel={`Remove ${file.name}`}
      >
        <Ionicons name="close-circle" size={17} color={COLORS.mutedFg} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageInputProps {
  isStreaming: boolean;
  onSend: (text: string, files?: UploadedFile[]) => void;
  onStop: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageInput({ isStreaming, onSend, onStop }: MessageInputProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [inputHeight, setInputHeight] = useState(40);
  const inputRef = useRef<TextInput>(null);

  const canSend = (text.trim().length > 0 || files.length > 0) && !isStreaming;

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(text, files.length > 0 ? files : undefined);
    setText('');
    setFiles([]);
    setInputHeight(40);
  }, [canSend, onSend, text, files]);

  // ── Stop streaming ───────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStop();
  }, [onStop]);

  // ── Attachment picker ────────────────────────────────────────────────────
  const openAttachmentSheet = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Photo Library', 'Document'],
          cancelButtonIndex: 0,
        },
        async (index) => {
          if (index === 1) await pickCamera();
          if (index === 2) await pickGallery();
          if (index === 3) await pickDocument();
        },
      );
    } else {
      Alert.alert('Attach', 'Choose a source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Photo Library', onPress: pickGallery },
        { text: 'Document', onPress: pickDocument },
      ]);
    }
  }, []);

  const fileFromUri = (
    uri: string,
    name: string,
    mimeType: string,
  ): UploadedFile => ({
    name,
    type: mimeType,
    data: uri,
  });

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const name = a.fileName ?? `photo_${Date.now()}.jpg`;
      setFiles((prev) => [
        ...prev,
        fileFromUri(a.uri, name, a.mimeType ?? 'image/jpeg'),
      ]);
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      const newFiles = result.assets.map((a) => {
        const name = a.fileName ?? `image_${Date.now()}.jpg`;
        return fileFromUri(a.uri, name, a.mimeType ?? 'image/jpeg');
      });
      setFiles((prev) => [...prev, ...newFiles].slice(0, 6));
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setFiles((prev) => [
        ...prev,
        fileFromUri(a.uri, a.name, a.mimeType ?? 'application/octet-stream'),
      ]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      {/* Attached files row */}
      {files.length > 0 && (
        <ScrollView
          horizontal
          style={styles.filesRow}
          contentContainerStyle={styles.filesRowContent}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {files.map((f, i) => (
            <FileChip key={i} file={f} onRemove={() => removeFile(i)} />
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={styles.bar}>
        {/* Attachment button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={openAttachmentSheet}
          disabled={isStreaming}
          accessibilityLabel="Attach file"
          activeOpacity={0.7}
        >
          <Ionicons
            name="attach"
            size={22}
            color={isStreaming ? COLORS.mutedFg : COLORS.muted}
          />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={[styles.input, { height: Math.min(inputHeight, MAX_INPUT_HEIGHT) }]}
          value={text}
          onChangeText={setText}
          placeholder="Message ArkChat…"
          placeholderTextColor={COLORS.placeholder}
          multiline
          scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
          onContentSizeChange={(e) => {
            setInputHeight(e.nativeEvent.contentSize.height);
          }}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!isStreaming}
          selectionColor={COLORS.primary}
          accessibilityLabel="Message input"
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.stopBtn]}
            onPress={handleStop}
            accessibilityLabel="Stop streaming"
            activeOpacity={0.8}
          >
            <Ionicons name="stop" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityLabel="Send message"
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Keyboard hint */}
      {Platform.OS === 'ios' && (
        <Text style={styles.hint}>Return sends · Shift+Return for new line</Text>
      )}
    </View>
  );
}

export default MessageInput;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingBottom: 4,
  },
  filesRow: {
    maxHeight: 64,
    paddingBottom: 6,
  },
  filesRowContent: {
    gap: 8,
    paddingHorizontal: 12,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.chipBg,
    borderWidth: 1,
    borderColor: COLORS.chipBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
  },
  fileChipImage: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  fileChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileChipName: {
    flex: 1,
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.foreground,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(37, 99, 235, 0.28)',
    shadowOpacity: 0,
    elevation: 0,
  },
  stopBtn: {
    backgroundColor: COLORS.stop,
    shadowColor: COLORS.stop,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.mutedFg,
    paddingBottom: 4,
    opacity: 0.6,
  },
});
