import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useSettingsStore } from '@/store/settings.store';
import type { UploadedFile } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(conversationId: string) {
  const queryClient = useQueryClient();

  // ── Store selectors ──────────────────────────────────────────────────────
  const conversationMessages = useChatStore(
    (s) => s.messages[conversationId] ?? [],
  );
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingText = useChatStore((s) => s.streamingText);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendStreamingText = useChatStore((s) => s.appendStreamingText);
  const setStreamingText = useChatStore((s) => s.setStreamingText);
  const finalizeStreamingMessage = useChatStore(
    (s) => s.finalizeStreamingMessage,
  );
  const setMessages = useChatStore((s) => s.setMessages);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);

  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);

  /** Set to true when the user taps Stop to ignore incoming tokens */
  const stopFlagRef = useRef(false);

  // ── Load messages from API on mount ─────────────────────────────────────
  const { data: fetchedMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiClient.getConversationMessages(conversationId),
    enabled: !!conversationId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (fetchedMessages && fetchedMessages.length > 0) {
      setMessages(conversationId, fetchedMessages);
    }
  }, [fetchedMessages, conversationId, setMessages]);

  // ── sendMessage ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, files?: UploadedFile[]) => {
      const trimmed = text.trim();
      if (!trimmed && (!files || files.length === 0)) return;
      if (isStreaming) return;

      stopFlagRef.current = false;

      // Optimistically add the user message
      const userMsg = {
        id: `local-user-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: trimmed },
          ...(files ?? []).map((f) => ({
            type: f.type.startsWith('image/')
              ? ('image' as const)
              : ('file' as const),
            url: f.data,
            file_name: f.name,
            mime_type: f.type,
          })),
        ],
        model: null,
        created_at: new Date().toISOString(),
        parent_id: null,
        branch_index: 0,
      };
      addMessage(conversationId, userMsg);
      setIsStreaming(true);
      setStreamingText('');

      // Build a flat message history for the API
      const history = conversationMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content.find((c) => c.type === 'text')?.text ?? '',
        }));
      history.push({ role: 'user' as const, content: trimmed });

      await apiClient.streamChat(
        {
          conversationId,
          messages: history,
          model: preferredModel,
          files,
          memoryEnabled,
        },
        (token) => {
          // Silently drop tokens if the user stopped the stream
          if (stopFlagRef.current) return;
          appendStreamingText(token);
        },
        () => {
          // onDone – promote accumulated text to a real message
          finalizeStreamingMessage(conversationId, preferredModel);
          // Invalidate so the server version (with real IDs) replaces optimistic messages
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          // Also refresh conversation list to pick up auto-generated title
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          // Fetch updated conversation title and push to store
          queryClient.fetchQuery({
            queryKey: ['conversation', conversationId],
            queryFn: () => apiClient.getConversation(conversationId),
            staleTime: 0,
          }).then((data) => {
            if (data?.conversation?.title) {
              useChatStore.getState().updateConversationTitle(conversationId, data.conversation.title);
            }
          }).catch(() => {});
        },
        (error) => {
          console.error('[useChat] Stream error:', error);
          const errMsg = {
            id: `local-err-${Date.now()}`,
            conversation_id: conversationId,
            role: 'assistant' as const,
            content: [
              {
                type: 'text' as const,
                text: 'Something went wrong. Please try again.',
              },
            ],
            model: null,
            created_at: new Date().toISOString(),
            parent_id: null,
            branch_index: 0,
          };
          addMessage(conversationId, errMsg);
          setIsStreaming(false);
          setStreamingText('');
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, isStreaming, conversationMessages, preferredModel, memoryEnabled],
  );

  // ── stopStreaming ────────────────────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    stopFlagRef.current = true;
    finalizeStreamingMessage(conversationId, preferredModel);
    apiClient.stopStream(conversationId).catch(() => {});
  }, [conversationId, preferredModel, finalizeStreamingMessage]);

  // ── regenerateMessage ────────────────────────────────────────────────────
  const regenerateMessage = useCallback(
    async (messageId: string) => {
      const msgs = useChatStore.getState().messages[conversationId] ?? [];
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return;

      // Walk backwards to find the preceding user message
      let userIdx = idx - 1;
      while (userIdx >= 0 && msgs[userIdx].role !== 'user') {
        userIdx--;
      }
      if (userIdx < 0) return;

      const userText =
        msgs[userIdx].content.find((c) => c.type === 'text')?.text ?? '';
      if (!userText) return;

      // Remove messages from the AI message onwards and re-send
      const trimmed = msgs.slice(0, idx);
      setMessages(conversationId, trimmed);
      await sendMessage(userText);
    },
    [conversationId, sendMessage, setMessages],
  );

  // ── editMessage ──────────────────────────────────────────────────────────
  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      const msgs = useChatStore.getState().messages[conversationId] ?? [];
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return;

      // Replace the message content and discard any messages after it
      const updated = [
        ...msgs.slice(0, idx),
        {
          ...msgs[idx],
          content: [{ type: 'text' as const, text: newText }],
        },
      ];
      setMessages(conversationId, updated);
      await sendMessage(newText);
    },
    [conversationId, sendMessage, setMessages],
  );

  return {
    messages: conversationMessages,
    isStreaming,
    streamingText,
    sendMessage,
    stopStreaming,
    regenerateMessage,
    editMessage,
  };
}
