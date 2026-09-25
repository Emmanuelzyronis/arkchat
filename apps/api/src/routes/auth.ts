import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { getUserByEmail, createUser, getUserById, getUserProfile, updateUserProfile } from '../services/db.service.js';

const BCRYPT_ROUNDS = 12;

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };

    const existing = await getUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await createUser(email, password_hash);

    const token = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: process.env.JWT_EXPIRY ?? '7d' },
    );

    return reply.status(201).send({
      token,
      user: { id: user.id, email: user.email },
    });
  });

  // POST /api/auth/login
  app.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await getUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: process.env.JWT_EXPIRY ?? '7d' },
    );

    return reply.send({
      token,
      user: { id: user.id, email: user.email },
    });
  });

  // GET /api/auth/me — verify token and return user info
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const user = await getUserById(userId);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const profile = await getUserProfile(userId);
    return { id: user.id, email: user.email, profile };
  });

  // PATCH /api/auth/profile — update display name and/or custom instructions
  app.patch('/api/auth/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          display_name: { type: 'string', maxLength: 100 },
          custom_instructions: { type: 'string', maxLength: 4096 },
        },
      },
    },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const userId = req.user.sub;
    const body = req.body as { display_name?: string; custom_instructions?: string };

    const patch: Record<string, string> = {};
    if (body.display_name !== undefined) patch.display_name = body.display_name;
    if (body.custom_instructions !== undefined) patch.custom_instructions = body.custom_instructions;

    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    await updateUserProfile(userId, patch);
    return reply.send({ updated: true });
  });

  // POST /api/auth/refresh — issue a fresh token for a still-valid one
  app.post('/api/auth/refresh', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub: userId, email } = req.user;
    const user = await getUserById(userId);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const token = app.jwt.sign(
      { sub: user.id, email: user.email ?? email },
      { expiresIn: process.env.JWT_EXPIRY ?? '7d' },
    );
    return reply.send({ token });
  });
}
