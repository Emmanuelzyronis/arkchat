/**
 * ArkChat API Gateway — Fastify v5 entry point
 *
 * Registers:
 *   @fastify/cors      — permissive in dev, tighten via CORS_ORIGIN in prod
 *   @fastify/multipart — file upload support
 *   authPlugin         — registers @fastify/jwt + authenticate decorator
 *   routes             — /api/chat/*, /api/memory/*, /api/conversations/*, /health
 */

import 'dotenv/config';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { authPlugin } from './middleware/auth.js';
import chatRoutes from './routes/chat.js';
import memoryRoutes from './routes/memory.js';
import conversationRoutes from './routes/conversations.js';
import authRoutes from './routes/auth.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const IS_DEV = process.env.NODE_ENV !== 'production';

// ── Build Fastify instance ────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: IS_DEV ? 'debug' : 'info',
    ...(IS_DEV
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  },
  // Increase body limit to allow base64-encoded file payloads (10 MB)
  bodyLimit: 10 * 1024 * 1024,
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  // CORS — allow all origins in dev; set CORS_ORIGIN in production
  await fastify.register(cors, {
    origin: IS_DEV ? true : (process.env.CORS_ORIGIN ?? false),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Multipart (file uploads — 50 MB per file)
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 10,
    },
  });

  // Auth (registers @fastify/jwt, adds request.jwtVerify() + instance.authenticate)
  await fastify.register(authPlugin);

  // Routes
  await fastify.register(authRoutes);
  await fastify.register(chatRoutes, { prefix: '/api/chat' });
  await fastify.register(memoryRoutes, { prefix: '/api/memory' });
  await fastify.register(conversationRoutes, { prefix: '/api/conversations' });

  // Health check — unauthenticated, used by load balancers / Railway
  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'arkchat-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Global error handler — avoids leaking stack traces in prod
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    request.log.error({ err: error, path: request.url }, 'Unhandled error');

    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      ...(IS_DEV && statusCode >= 500 ? { stack: error.stack } : {}),
    });
  });

  // Not-found handler
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ error: 'Not Found' });
  });

  // Start listening
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`ArkChat API listening on ${HOST}:${PORT} (${IS_DEV ? 'development' : 'production'})`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  fastify.log.info(`${signal} received — shutting down gracefully`);
  try {
    await fastify.close();
    fastify.log.info('Server closed');
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  fastify.log.error({ reason }, 'Unhandled promise rejection');
});

// ── Run ───────────────────────────────────────────────────────────────────────

start().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
