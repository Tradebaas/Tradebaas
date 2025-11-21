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
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

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
  const { email, password, fullName } = input;

  const passwordHash = await hashPassword(password);

  const result = await pool.query<User>(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email.toLowerCase(), passwordHash, fullName || null]
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
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { user, tokens: { accessToken } };
}
