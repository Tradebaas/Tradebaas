/**
 * Structured Logging Service
 * 
 * Provides application-wide logging with:
 * - JSON format for structured logs
 * - Multiple log levels (error, warn, info, debug)
 * - Daily rotation with 7-day retention
 * - Sensitive data filtering
 * - Context enrichment
 */

import * as winston from 'winston';
import 'winston-daily-rotate-file'; // Side-effect import to register transport
import * as path from 'path';

// Sensitive fields to redact in logs
const SENSITIVE_FIELDS = [
  'apiKey',
  'apiSecret',
  'password',
  'token',
  'authorization',
  'api_key',
  'api_secret',
  'clientId',
  'clientSecret',
  'client_secret',
];

/**
 * Recursively redact sensitive fields from objects
 */
function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  if (typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Custom format that redacts sensitive data
 */
const redactFormat = winston.format((info) => {
  // Redact sensitive data from the info object
  const redacted = redactSensitiveData({ ...info });
  return redacted;
});

/**
 * JSON format for structured logs
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  redactFormat(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Console format for development (human-readable)
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(redactSensitiveData(meta))}`;
    }
    return msg;
  })
);

// Determine log directory
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: jsonFormat,
  defaultMeta: {
    service: 'tradebaas-backend',
    environment: NODE_ENV,
  },
  transports: [
    // Error log file (errors only)
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '7d',
      maxSize: '20m',
      format: jsonFormat,
    }),

    // Combined log file (all levels)
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      maxSize: '20m',
      format: jsonFormat,
    }),

    // Console output (development)
    new winston.transports.Console({
      format: NODE_ENV === 'production' ? jsonFormat : consoleFormat,
    }),
  ],
  exitOnError: false,
});

/**
 * Create child logger with additional context
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log levels wrapper for convenience
 */
export const log = {
  error: (message: string, meta?: Record<string, any>) => {
    logger.error(message, meta);
  },
  
  warn: (message: string, meta?: Record<string, any>) => {
    logger.warn(message, meta);
  },
  
  info: (message: string, meta?: Record<string, any>) => {
    logger.info(message, meta);
  },
  
  debug: (message: string, meta?: Record<string, any>) => {
    logger.debug(message, meta);
  },
};

/**
 * Log module initialization
 */
log.info('Logger initialized', {
  logLevel: LOG_LEVEL,
  logDir: LOG_DIR,
  environment: NODE_ENV,
});

export default logger;
