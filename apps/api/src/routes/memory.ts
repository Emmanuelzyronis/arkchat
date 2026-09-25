/**
 * Memory CRUD routes (all authenticated)
 *
 * GET    /api/memory        — list user's memories
 * POST   /api/memory        — manually add a memory
 * DELETE /api/memory/:id    — delete a memory
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import {
  getUserMemories,
  deleteMemory,
  addManualMemory,
} from '../services/memory.service.js';

export default async function memoryRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET / ───────────────────────────────────────────────────────────────────

  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const memories = await getUserMemories(request.user.id);
      return reply.send({ memories });
    },
  );

  // ── POST / ──────────────────────────────────────────────────────────────────

  fastify.post<{ Body: { content: string; category?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 4096 },
            category: { type: 'string', default: 'manual' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { content, category = 'manual' } = request.body;

      const memory = await addManualMemory(request.user.id, content, category);
      return reply.status(201).send({ memory });
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
      await deleteMemory(request.params.id, request.user.id);
      return reply.status(204).send();
    },
  );
}
