import { create } from 'zustand';
import type { Conversation, Message } from '@arkchat/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  /** Messages keyed by conversationId */
  messages: Record<string, Message[]>;
  isStreaming: boolean;
  /** Accumulates SSE tokens during an active stream */
  streamingText: string;
  isLoadingConversations: boolean;
}

interface ChatActions {
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  /** Replace the full message array for a conversation (e.g. after a fetch) */
  setMessages: (conversationId: string, messages: Message[]) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (token: string) => void;
  /**
   * Promote the accumulated streamingText into a proper assistant Message and
   * clear the streaming state.
   */
  finalizeStreamingMessage: (conversationId: string, model: string) => void;
  setConversations: (convs: Conversation[]) => void;
  updateConversationTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsLoadingConversations: (loading: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  // ── State defaults ──────────────────────────────────────────────────────
  conversations: [],
  activeConversationId: null,
  messages: {},
  isStreaming: false,
  streamingText: '',
  isLoadingConversations: false,

  // ── Actions ─────────────────────────────────────────────────────────────

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), message],
      },
    })),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  setStreamingText: (text) => set({ streamingText: text }),

  appendStreamingText: (token) =>
    set((state) => ({ streamingText: state.streamingText + token })),

  finalizeStreamingMessage: (conversationId, model) => {
    const { streamingText } = get();
    if (!streamingText.trim()) {
      set({ isStreaming: false, streamingText: '' });
      return;
    }
    const aiMessage: Message = {
      id: `local-ai-${Date.now()}`,
      conversation_id: conversationId,
      role: 'assistant',
      content: [{ type: 'text', text: streamingText }],
      model,
      created_at: new Date().toISOString(),
      parent_id: null,
      branch_index: 0,
    };
    set((state) => ({
      isStreaming: false,
      streamingText: '',
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), aiMessage],
      },
    }));
  },

  setConversations: (convs) => set({ conversations: convs }),

  updateConversationTitle: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    })),

  deleteConversation: (id) =>
    set((state) => {
      // Eslint doesn't like unused vars from destructuring so use spread omit
      const newMessages = { ...state.messages };
      delete newMessages[id];
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        messages: newMessages,
        activeConversationId:
          state.activeConversationId === id ? null : state.activeConversationId,
      };
    }),

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setIsLoadingConversations: (loading) =>
    set({ isLoadingConversations: loading }),
}));
