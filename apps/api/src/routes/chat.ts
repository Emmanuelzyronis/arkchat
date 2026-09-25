/**
 * Chat streaming route
 *
 * POST /api/chat/stream  — authenticated SSE stream
 * POST /api/chat/stop    — abort an in-flight stream by conversationId
 *
 * SSE event format (one JSON object per `data:` line):
 *   data: {"type":"text_delta","text":"token"}\n\n
 *   data: {"type":"message_stop","usage":{"input_tokens":N,"output_tokens":M}}\n\n
 *   data: [DONE]\n\n
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatStreamRequest, UploadedFile } from '@arkchat/types';
import { authenticate } from '../middleware/auth.js';
import { streamChat, completeOnce, SUPPORTED_MODELS } from '../services/ai.service.js';
import { searchMemories, addMemories } from '../services/memory.service.js';
import { getUserProfile, getConversation, saveMessage, updateConversationTitle } from '../services/db.service.js';
import { buildSystemPrompt } from '../prompts/system.js';

// ── In-flight stream registry (conversationId → AbortController) ──────────────

const activeStreams = new Map<string, AbortController>();

// ── Route schemas ─────────────────────────────────────────────────────────────

const streamBodySchema = {
  type: 'object',
  required: ['conversationId', 'messages', 'model'],
  properties: {
    conversationId: { type: 'string' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['role', 'content'],
        properties: {
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          content: { type: 'string' },
        },
      },
    },
    model: { type: 'string' },
    systemPrompt: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type', 'data'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          data: { type: 'string' },
        },
      },
    },
    memoryEnabled: { type: 'boolean' },
  },
} as const;

const stopBodySchema = {
  type: 'object',
  required: ['conversationId'],
  properties: {
    conversationId: { type: 'string' },
  },
} as const;

// ── Helper: write SSE ─────────────────────────────────────────────────────────

function sseWrite(reply: FastifyReply, data: unknown): void {
  const line = typeof data === 'string' ? data : JSON.stringify(data);
  reply.raw.write(`data: ${line}\n\n`);
}

// ── Helper: auto-generate a conversation title ────────────────────────────────

async function autoTitle(
  conversationId: string,
  userId: string,
  firstUserMessage: string,
): Promise<void> {
  try {
    const title = await completeOnce({
      model: 'claude-haiku-4-5',
      system:
        'You are a title generator. Given the user\'s first message in a conversation, produce a concise 4-6 word title that captures the topic. Output the title only — no punctuation, no quotes, no explanation.',
      userMessage: firstUserMessage.slice(0, 500),
      maxTokens: 30,
    });
    if (title) {
      await updateConversationTitle(conversationId, userId, title.trim());
    }
  } catch {
    // Non-critical — swallow errors
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /stream ────────────────────────────────────────────────────────────

  fastify.post<{ Body: ChatStreamRequest }>(
    '/stream',
    {
      schema: { body: streamBodySchema },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest<{ Body: ChatStreamRequest }>, reply: FastifyReply) => {
      const { conversationId, messages, model, files, memoryEnabled = true } = request.body;
      const userId = request.user.id;

      // ── Validate model ───────────────────────────────────────────────────
      if (!SUPPORTED_MODELS.includes(model as (typeof SUPPORTED_MODELS)[number])) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Unsupported model "${model}". Supported: ${SUPPORTED_MODELS.join(', ')}`,
        });
      }

      // ── Ownership check ──────────────────────────────────────────────────
      const conversation = await getConversation(conversationId, userId);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // ── Fetch user profile + memories ────────────────────────────────────
      const [profile, memories] = await Promise.all([
        getUserProfile(userId),
        memoryEnabled
          ? searchMemories(userId, messages.at(-1)?.content ?? '', 10)
          : Promise.resolve([]),
      ]);

      // ── Build system prompt ──────────────────────────────────────────────
      const systemPrompt = buildSystemPrompt(
        memories,
        profile?.custom_instructions ?? undefined,
      );

      // ── SSE headers ──────────────────────────────────────────────────────
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
      reply.raw.flushHeaders();

      // ── Set up abort controller ──────────────────────────────────────────
      const controller = new AbortController();
      activeStreams.set(conversationId, controller);

      let fullAssistantText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const stream = streamChat({
          messages,
          model,
          systemPrompt,
          userId,
          conversationId,
          files: files as UploadedFile[] | undefined,
          abortSignal: controller.signal,
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullAssistantText += text;
            sseWrite(reply, { type: 'text_delta', text });
          } else if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          } else if (event.type === 'message_start' && event.message.usage) {
            inputTokens = event.message.usage.input_tokens;
          }
        }

        sseWrite(reply, {
          type: 'message_stop',
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        });
        sseWrite(reply, '[DONE]');
      } catch (err: unknown) {
        activeStreams.delete(conversationId);

        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || err.message.includes('aborted'));

        if (isAbort) {
          sseWrite(reply, { type: 'stream_cancelled' });
          sseWrite(reply, '[DONE]');
          reply.raw.end();
          return;
        }

        // Rate limit
        const statusCode = (err as { status?: number })?.status;
        if (statusCode === 429) {
          sseWrite(reply, { type: 'error', error: 'rate_limit', message: 'Rate limit exceeded. Please wait before retrying.' });
          sseWrite(reply, '[DONE]');
          reply.raw.end();
          return;
        }

        // Context window
        if (statusCode === 413 || (err instanceof Error && err.message.includes('context'))) {
          sseWrite(reply, { type: 'error', error: 'context_too_long', message: 'Conversation is too long. Start a new conversation or remove earlier messages.' });
          sseWrite(reply, '[DONE]');
          reply.raw.end();
          return;
        }

        request.log.error({ err }, 'Stream error');
        sseWrite(reply, { type: 'error', error: 'stream_error', message: 'An unexpected error occurred.' });
        sseWrite(reply, '[DONE]');
        reply.raw.end();
        return;
      }

      activeStreams.delete(conversationId);
      reply.raw.end();

      // ── Background: persist messages + extract memories ──────────────────
      if (fullAssistantText) {
        const lastUserMsg = messages.at(-1);

        setImmediate(async () => {
          try {
            // Save user message
            if (lastUserMsg) {
              await saveMessage({
                conversation_id: conversationId,
                role: 'user',
                content: [{ type: 'text', text: lastUserMsg.content }],
                model: null,
              });
            }

            // Save assistant message
            await saveMessage({
              conversation_id: conversationId,
              role: 'assistant',
              content: [{ type: 'text', text: fullAssistantText }],
              model,
            });

            // Auto-title (only if conversation has no title and this is the first message)
            if (!conversation.title && lastUserMsg) {
              await autoTitle(conversationId, userId, lastUserMsg.content);
            }

            // Extract + store memories
            const memoryMessages = [
              ...(lastUserMsg ? [{ role: 'user', content: lastUserMsg.content }] : []),
              { role: 'assistant', content: fullAssistantText },
            ];
            await addMemories(userId, memoryMessages, conversationId);
          } catch (bgErr) {
            fastify.log.error({ bgErr }, 'Background post-stream tasks failed');
          }
        });
      }
    },
  );

  // ── POST /stop ──────────────────────────────────────────────────────────────

  fastify.post<{ Body: { conversationId: string } }>(
    '/stop',
    {
      schema: { body: stopBodySchema },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { conversationId } = request.body;
      const controller = activeStreams.get(conversationId);

      if (controller) {
        controller.abort();
        activeStreams.delete(conversationId);
        return reply.send({ stopped: true });
      }

      return reply.send({ stopped: false, message: 'No active stream for this conversation' });
    },
  );
}
