import { pool } from '../db';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
  is_admin: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
  disclaimerAccepted?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
}

const JWT_SECRET_RAW = process.env.JWT_SECRET;

if (!JWT_SECRET_RAW) {
  throw new Error('JWT_SECRET is not set');
}

// TypeScript now knows this is always a string after the check
const JWT_SECRET: string = JWT_SECRET_RAW;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function registerUser(input: RegisterRequest): Promise<User> {
  const { email, password, fullName, disclaimerAccepted } = input;

  const passwordHash = await hashPassword(password);

  // Auto-admin for configured email or domain
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminDomain = process.env.ADMIN_DOMAIN?.toLowerCase();
  const emailLower = email.toLowerCase();
  const isAdmin = emailLower === adminEmail || (adminDomain && emailLower.endsWith(`@${adminDomain}`));

  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, full_name, is_admin, disclaimer_accepted, disclaimer_accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [emailLower, passwordHash, fullName || null, isAdmin, disclaimerAccepted || false, disclaimerAccepted ? new Date() : null]
  );

  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export async function loginUser(input: LoginRequest): Promise<{ user: User; tokens: AuthTokens }> {
  const { email, password } = input;

  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new Error('Invalid credentials');
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { user, tokens: { accessToken } };
}
