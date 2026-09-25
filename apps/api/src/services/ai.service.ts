/**
 * AI service — streams Claude responses via Azure Microsoft AI Foundry.
 *
 * Package : @anthropic-ai/foundry-sdk
 * Endpoint: https://<resource>.services.ai.azure.com/anthropic
 * Auth    : ANTHROPIC_FOUNDRY_API_KEY + ANTHROPIC_FOUNDRY_RESOURCE env vars
 */

import Anthropic from '@anthropic-ai/foundry-sdk';
import type { ClaudeModel, UploadedFile } from '@arkchat/types';

// Re-export types from the foundry SDK (mirrors Anthropic SDK structure)
type MessageParam = Parameters<Anthropic['messages']['create']>[0]['messages'][number];
type ContentBlockParam = Exclude<MessageParam['content'], string>[number];
type ImageBlockParam = Extract<ContentBlockParam, { type: 'image' }>;
type DocumentBlockParam = Extract<ContentBlockParam, { type: 'document' }>;
type TextBlockParam = Extract<ContentBlockParam, { type: 'text' }>;

// ── Supported models ──────────────────────────────────────────────────────────

export const SUPPORTED_MODELS: ClaudeModel[] = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-opus-5-5',
];

export const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'claude-haiku-4-5': 8192,
  'claude-sonnet-5': 16384,
  'claude-opus-5-5': 16384,
  'claude-sonnet-4-6': 16384,
};

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_FOUNDRY_API_KEY;
  const baseURL = process.env.ANTHROPIC_FOUNDRY_BASE_URL;

  if (!apiKey) throw new Error('ANTHROPIC_FOUNDRY_API_KEY is not set');
  if (!baseURL) throw new Error('ANTHROPIC_FOUNDRY_BASE_URL is not set');

  _client = new Anthropic({
    apiKey,
    baseURL,
    defaultHeaders: { 'api-key': apiKey },
  });

  return _client;
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isSupportedModel(model: string): model is ClaudeModel {
  return SUPPORTED_MODELS.includes(model as ClaudeModel);
}

// ── Message formatting ────────────────────────────────────────────────────────

interface InboundMessage {
  role: string;
  content: string;
}

function buildImageBlock(file: UploadedFile): ImageBlockParam {
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validImageTypes.includes(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }
  return {
    type: 'image',
    source: {
      type: 'base64' as const,
      media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: file.data,
    },
  };
}

function buildDocumentBlock(file: UploadedFile): DocumentBlockParam {
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: file.data,
    },
    title: file.name,
  };
}

/**
 * Convert incoming messages + optional file attachments to Anthropic's
 * MessageParam format. Files are appended to the LAST user message.
 */
function formatMessages(
  messages: InboundMessage[],
  files?: UploadedFile[],
): MessageParam[] {
  const formatted: MessageParam[] = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Attach files to the last user message
  if (files && files.length > 0) {
    const lastUserIdx = [...formatted].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx !== -1) {
      const idx = formatted.length - 1 - lastUserIdx;
      const existing = formatted[idx];
      const textContent: TextBlockParam = {
        type: 'text',
        text: typeof existing.content === 'string' ? existing.content : '',
      };

      const fileBlocks = files.map((f) =>
        f.type === 'application/pdf' ? buildDocumentBlock(f) : buildImageBlock(f),
      );

      formatted[idx] = {
        role: 'user',
        content: [...fileBlocks, textContent],
      };
    }
  }

  return formatted;
}

// ── Stream params ─────────────────────────────────────────────────────────────

export interface StreamChatParams {
  messages: InboundMessage[];
  model: string;
  systemPrompt: string;
  userId: string;
  conversationId: string;
  files?: UploadedFile[];
  abortSignal?: AbortSignal;
}

export type AnthropicStream = ReturnType<typeof Anthropic.prototype.messages.stream>;

/**
 * Start a streaming Claude completion via Azure Foundry.
 * Returns the raw Anthropic stream — callers consume it with async iteration.
 */
export function streamChat(params: StreamChatParams): AnthropicStream {
  const client = getClient();

  const model = isSupportedModel(params.model)
    ? params.model
    : ('claude-sonnet-5' as ClaudeModel);

  const formattedMessages = formatMessages(params.messages, params.files);
  const maxTokens = DEFAULT_MAX_TOKENS[model];

  return client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: params.systemPrompt,
      messages: formattedMessages,
    },
    { signal: params.abortSignal },
  );
}

/**
 * One-shot (non-streaming) completion — used for auto-title generation.
 */
export async function completeOnce(opts: {
  model: ClaudeModel;
  system: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content: opts.userMessage }],
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}
