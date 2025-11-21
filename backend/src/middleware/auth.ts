import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

export interface JWTPayload {
  userId: string;
  email: string;
  isAdmin?: boolean;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      isAdmin?: boolean;
    };
  }
}

export async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

    request.user = {
      userId: payload.userId,
      email: payload.email,
      isAdmin: payload.isAdmin || false,
    };
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  // First authenticate
  await authenticateRequest(request, reply);
  
  // Then check if admin
  if (!request.user?.isAdmin) {
    return reply.code(403).send({ error: 'Admin access required' });
  }
}
