import crypto from 'crypto';

const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY;

if (!MASTER_KEY || MASTER_KEY.length < 32) {
  throw new Error('ENCRYPTION_MASTER_KEY must be set and at least 32 characters');
}

// Type-safe master key (guaranteed non-null after check above)
const MASTER_KEY_SAFE: string = MASTER_KEY;

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
}

/**
 * Derive a user-specific encryption key from master key + user ID + salt
 * Uses PBKDF2 with 100,000 iterations for strong key derivation
 */
export function deriveUserKey(userId: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(
    MASTER_KEY_SAFE,
    `${userId}:${salt}`,
    100000, // iterations
    32,     // key length (256 bits for AES-256)
    'sha256'
  );
}

/**
 * Encrypt data using AES-256-GCM
 * Returns encrypted data, IV, and salt
 */
export function encryptData(plaintext: string, userId: string): EncryptedData {
  // Generate random salt and IV
  const salt = crypto.randomBytes(32).toString('hex');
  const iv = crypto.randomBytes(16); // 16 bytes for GCM
  
  // Derive user-specific key
  const key = deriveUserKey(userId, salt);
  
  // Encrypt using AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get auth tag for GCM (provides authentication)
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Combine encrypted data and auth tag
  const encryptedWithTag = encrypted + ':' + authTag;
  
  return {
    encrypted: encryptedWithTag,
    iv: iv.toString('hex'),
    salt,
  };
}

/**
 * Decrypt data using AES-256-GCM
 * Throws error if decryption fails (wrong key, tampered data, etc.)
 */
export function decryptData(
  encryptedData: string,
  iv: string,
  salt: string,
  userId: string
): string {
  // Split encrypted data and auth tag
  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [encrypted, authTag] = parts;
  
  // Derive the same key
  const key = deriveUserKey(userId, salt);
  
  // Decrypt using AES-256-GCM
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
