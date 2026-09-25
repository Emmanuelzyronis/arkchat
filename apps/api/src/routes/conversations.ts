/**
 * Conversation management routes (all authenticated)
 *
 * GET    /api/conversations          — list conversations (sorted by last_message_at DESC)
 * POST   /api/conversations          — create a new conversation
 * GET    /api/conversations/:id      — get conversation with messages
 * PATCH  /api/conversations/:id      — update title
 * DELETE /api/conversations/:id      — delete conversation + messages (cascade via FK)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { SUPPORTED_MODELS } from '../services/ai.service.js';
import {
  listConversations,
  createConversation,
  getConversation,
  getMessages,
  updateConversationTitle,
  deleteConversation,
} from '../services/db.service.js';

export default async function conversationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET / ───────────────────────────────────────────────────────────────────

  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conversations = await listConversations(request.user.id);
      return reply.send({ conversations });
    },
  );

  // ── POST / ──────────────────────────────────────────────────────────────────

  fastify.post<{ Body: { model?: string; title?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            title: { type: 'string', maxLength: 255 },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { model = 'claude-sonnet-5', title } = request.body;

      if (!SUPPORTED_MODELS.includes(model as (typeof SUPPORTED_MODELS)[number])) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Unsupported model "${model}". Supported: ${SUPPORTED_MODELS.join(', ')}`,
        });
      }

      const conversation = await createConversation(request.user.id, model, title);
      return reply.status(201).send({ conversation });
    },
  );

  // ── GET /:id ────────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user.id;

      const conversation = await getConversation(id, userId);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const messages = await getMessages(id, userId);
      return reply.send({ conversation, messages });
    },
  );

  // ── PATCH /:id ──────────────────────────────────────────────────────────────

  fastify.patch<{ Params: { id: string }; Body: { title: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['title'],
          properties: { title: { type: 'string', minLength: 1, maxLength: 255 } },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { title } = request.body;
      const userId = request.user.id;

      const conversation = await getConversation(id, userId);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      await updateConversationTitle(id, userId, title);
      return reply.send({ updated: true, title });
    },
  );

  // ── DELETE /:id ─────────────────────────────────────────────────────────────

  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user.id;

      const conversation = await getConversation(id, userId);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // Messages cascade-delete via the FK constraint in the Supabase schema.
      await deleteConversation(id, userId);
      return reply.status(204).send();
    },
  );
}
