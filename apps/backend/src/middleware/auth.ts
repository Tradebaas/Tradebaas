import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET_RAW = process.env.JWT_SECRET;

if (!JWT_SECRET_RAW) {
  throw new Error('JWT_SECRET is not set');
}

// TypeScript now knows this is always a string after the check
const JWT_SECRET: string = JWT_SECRET_RAW;

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
  // Accept token from Authorization header or cookie named 'tradebaas:auth-token' or 'tradebaas_auth'
  const authHeader = request.headers.authorization as string | undefined;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Try cookies
  if (!token) {
    // Fastify may parse cookies into request.cookies if cookie plugin is enabled
    const anyReq = request as any;
    if (anyReq.cookies) {
      token = anyReq.cookies['tradebaas:auth-token'] || anyReq.cookies['tradebaas_auth'] || null;
    }
  }

  // Fallback: parse Cookie header manually
  if (!token && request.headers.cookie) {
    const raw = request.headers.cookie || '';
    const cookies = raw.split(';').map((c: string) => c.trim());
    for (const c of cookies) {
      const parts = c.split('=');
      const k = parts[0];
      const v = parts.slice(1).join('=');
      if (k === 'tradebaas:auth-token' || k === 'tradebaas_auth' || k === 'tradebaas_auth_token') {
        token = decodeURIComponent(v || '');
        break;
      }
    }
  }

  if (!token) {
    return reply.code(401).send({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const payload = decoded as JWTPayload;

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
