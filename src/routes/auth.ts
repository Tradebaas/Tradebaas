import { FastifyInstance } from 'fastify';
import prisma from '../db/client';
import bcrypt from 'bcrypt';
import { sign } from '../utils/jwt';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (req, reply) => {
    const body = req.body as any;
    if (!body.email || !body.password) return reply.code(400).send({ error: 'email+password required' });

    const hashed = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({ data: { email: body.email, password: hashed } });
    const token = sign({ userId: user.id });
    return { token, user: { id: user.id, email: user.email } };
  });

  fastify.post('/login', async (req, reply) => {
    const body = req.body as any;
    if (!body.email || !body.password) return reply.code(400).send({ error: 'email+password required' });

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: 'invalid' });

    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) return reply.code(401).send({ error: 'invalid' });

    const token = sign({ userId: user.id });
    return { token, user: { id: user.id, email: user.email } };
  });
}
