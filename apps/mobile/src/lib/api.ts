import Constants from 'expo-constants';
import { getStoredToken } from '../store/auth.store';
import type {
  Conversation,
  Message,
  Memory,
  ChatStreamRequest,
} from '@arkchat/types';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  public readonly name = 'ApiError';
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  // If a non-localhost URL is explicitly configured, always use it.
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }
  // In development, derive the API host from the Expo bundle server host.
  // This lets physical devices reach the API via LAN without manual IP config.
  if (__DEV__) {
    // Try several Expo manifest sources — which one is populated depends on SDK version and launch mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = Constants as any;
    const debuggerHost: string | undefined =
      c.manifest?.debuggerHost ??           // Expo Go (classic)
      c.expoConfig?.hostUri ??              // Newer Expo config with hostUri
      c.manifest2?.extra?.expoClient?.hostUri; // EAS dev client
    if (debuggerHost) {
      const host = debuggerHost.split(':')[0]; // strip the bundle port
      // Skip Expo tunnel domains — port-swapping doesn't work there.
      // For tunnel mode, set EXPO_PUBLIC_API_URL to your ngrok/cloudflare URL.
      const isExpoTunnel = host.includes('.exp.direct') || host.includes('tunnel.exp');
      if (host && host !== 'localhost' && host !== '127.0.0.1' && !isExpoTunnel) {
        return `http://${host}:3000`;
      }
    }
  }
  return (envUrl || 'http://localhost:3000').replace(/\/$/, '');
}

const BASE_URL = resolveApiUrl();

async function getAuthHeader(): Promise<{ Authorization: string }> {
  const token = await getStoredToken();
  if (!token) throw new ApiError(401, 'Not authenticated – no token stored');
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch {}
    const message =
      (body as { message?: string; error?: string })?.message ??
      (body as { error?: string })?.error ??
      `HTTP ${res.status} ${res.statusText}`;
    const error = new ApiError(res.status, message, body);
    if (res.status === 401) {
      import('../store/auth.store').then(({ useAuthStore }) => {
        useAuthStore.getState().signOut().catch(() => {});
      }).catch(() => {});
    }
    throw error;
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

type OnToken = (token: string) => void;
type OnDone = () => void;
type OnError = (error: Error) => void;

async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onToken: OnToken,
  onDone: OnDone,
): Promise<void> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') { onDone(); return; }

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
            token?: string;
            text?: string;
          };
          const token =
            parsed.choices?.[0]?.delta?.content ?? parsed.token ?? parsed.text;
          if (token) onToken(token);
        } catch {
          if (data) onToken(data);
        }
      }
    }
  }

  onDone();
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const apiClient = {
  async streamChat(
    body: ChatStreamRequest,
    onToken: OnToken,
    onDone: OnDone,
    onError: OnError,
  ): Promise<void> {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`${BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...authHeader,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let detail: unknown;
        try { detail = await res.json(); } catch {}
        throw new ApiError(res.status, `Stream failed: HTTP ${res.status}`, detail);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Response body is null');
      await consumeSSEStream(reader, onToken, onDone);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  },

  async getConversations(): Promise<Conversation[]> {
    const res = await request<{ conversations: Conversation[] }>('/api/conversations');
    return res.conversations;
  },

  async createConversation(model?: string): Promise<Conversation> {
    const res = await request<{ conversation: Conversation }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
    return res.conversation;
  },

  async getConversationMessages(id: string): Promise<Message[]> {
    const res = await request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`);
    return res.messages;
  },

  async getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
    return request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`);
  },

  deleteConversation(id: string): Promise<void> {
    return request<void>(`/api/conversations/${id}`, { method: 'DELETE' });
  },

  updateConversationTitle(id: string, title: string): Promise<void> {
    return request<void>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  async getMemories(): Promise<Memory[]> {
    const res = await request<{ memories: Memory[] }>('/api/memory');
    return res.memories;
  },

  addMemory(content: string, category = 'manual'): Promise<Memory> {
    return request<{ memory: Memory }>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({ content, category }),
    }).then((r) => r.memory);
  },

  deleteMemory(id: string): Promise<void> {
    return request<void>(`/api/memory/${id}`, { method: 'DELETE' });
  },

  stopStream(conversationId: string): Promise<void> {
    return request<void>('/api/chat/stop', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
  },

  updateProfile(patch: { customInstructions?: string; displayName?: string }): Promise<void> {
    return request<void>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        custom_instructions: patch.customInstructions,
        display_name: patch.displayName,
      }),
    });
  },
};
