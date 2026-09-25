/**
 * Supabase JWT authentication middleware for Fastify v5.
 *
 * Usage in routes:
 *   fastify.addHook('preHandler', authenticate);
 *   // or per-route:
 *   { preHandler: [authenticate] }
 *
 * Validates the Bearer token using SUPABASE_JWT_SECRET (HS256).
 * Sets request.user = { id, email } on success, 401 on failure.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';

export interface AuthUser {
  sub: string;
  id: string;   // alias for sub — set explicitly in authenticate() for route convenience
  email: string;
}

// Augment @fastify/jwt so req.user resolves to our payload shape.
// This avoids conflicting with Fastify's own req.user declaration.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

// ── JWT payload shape (Supabase HS256) ────────────────────────────────────────

interface SupabaseJWTPayload {
  sub: string;
  email: string;
  role?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

// ── Standalone authenticate hook ──────────────────────────────────────────────
// Can be used directly as a preHandler in any route without registering as a plugin.

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header',
    });
  }

  try {
    // request.jwtVerify() reads from the Authorization: Bearer <token> header automatically
    const payload = await request.jwtVerify<SupabaseJWTPayload>();

    if (!payload.sub) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token subject' });
    }

    request.user = { sub: payload.sub, id: payload.sub, email: payload.email ?? '' };
  } catch (err: unknown) {
    request.log.debug({ err }, 'JWT verification failed');

    const message = err instanceof Error ? err.message : 'Invalid token';
    const isExpired =
      typeof message === 'string' &&
      (message.includes('expired') || message.includes('TokenExpiredError'));

    return reply.status(401).send({
      error: 'Unauthorized',
      message: isExpired ? 'Token expired' : 'Invalid token',
    });
  }
}

// ── Fastify plugin (registers @fastify/jwt + decorates instance) ──────────────

async function authPluginImpl(fastify: FastifyInstance): Promise<void> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    fastify.log.warn('JWT_SECRET is not set — JWT verification will fail at runtime');
  }

  await fastify.register(fastifyJwt, {
    secret: secret ?? 'MISSING_SECRET_REPLACE_ME',
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // Decorate instance with the authenticate hook so plugins can reference it
  fastify.decorate('authenticate', authenticate);
}

export const authPlugin = fp(authPluginImpl, {
  name: 'arkchat-auth',
  fastify: '5.x',
});

// Extend FastifyInstance type to expose the decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}
