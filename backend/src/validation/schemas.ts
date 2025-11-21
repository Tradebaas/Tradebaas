/**
 * Input Validation Schemas (SEC-001)
 * 
 * Zod schemas for validating API request inputs
 * Ensures data integrity and prevents invalid/malicious inputs
 */

import { z } from 'zod';

/**
 * Strategy name validation
 * - Alphanumeric characters, hyphens, and underscores
 * - 1-50 characters long
 */
export const strategyNameSchema = z.string()
  .min(1, 'Strategy name is required')
  .max(50, 'Strategy name must be 50 characters or less')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Strategy name must contain only alphanumeric characters, hyphens, and underscores');

/**
 * Instrument validation
 * - Format: BASE-CURRENCY (e.g., BTC-USD, ETH-USDC)
 * - Uppercase letters only
 */
export const instrumentSchema = z.string()
  .min(1, 'Instrument is required')
  .regex(/^[A-Z]+-[A-Z]+$/, 'Instrument must be in format BASE-CURRENCY (e.g., BTC-USD)');

/**
 * Broker type validation
 */
export const brokerTypeSchema = z.enum(['deribit', 'bybit', 'binance'], {
  message: 'Broker must be one of: deribit, bybit, binance',
});

/**
 * Credentials validation
 */
export const credentialsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
  testnet: z.boolean().optional().default(false),
}).strict();

/**
 * Strategy start request validation
 */
export const strategyStartRequestSchema = z.object({
  strategyName: strategyNameSchema,
  instrument: instrumentSchema,
  broker: brokerTypeSchema.optional().default('deribit'),
  credentials: credentialsSchema.optional(),
  params: z.record(z.string(), z.any()).optional(),
}).strict();

/**
 * Strategy stop request validation
 */
export const strategyStopRequestSchema = z.object({
  strategyId: z.string().optional(),
  force: z.boolean().optional().default(false),
}).strict();

/**
 * Credentials save request validation
 */
export const saveCredentialsRequestSchema = z.object({
  service: brokerTypeSchema,
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
  testnet: z.boolean().optional().default(false),
}).strict();

/**
 * Helper function to validate data against a schema
 * Returns either the parsed data or validation errors
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: z.ZodIssue) => {
        const path = err.path.join('.');
        return `${path ? path + ': ' : ''}${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: ['Validation failed'] };
  }
}

/**
 * Fastify plugin helper to add validation to routes
 */
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (data: unknown) => {
    const result = validateInput(schema, data);
    if (!result.success) {
      throw new Error(result.errors.join(', '));
    }
    return result.data;
  };
}
