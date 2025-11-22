import { pool } from '../db';
import { encryptData, decryptData } from './encryption-service';

export interface UserCredentials {
  id: string;
  user_id: string;
  broker: string;
  environment: string;
  created_at: string;
  last_used: string | null;
  is_active: boolean;
}

export interface SaveCredentialsInput {
  userId: string;
  broker: string;
  environment: 'live' | 'testnet';
  apiKey: string;
  apiSecret: string;
}

export interface LoadedCredentials {
  apiKey: string;
  apiSecret: string;
}

export class UserCredentialsService {
  /**
   * Save or update user credentials (encrypted)
   */
  async saveCredentials(input: SaveCredentialsInput): Promise<void> {
    const { userId, broker, environment, apiKey, apiSecret } = input;

    // Encrypt API key and secret separately
  // Generate a single salt/iv and reuse for both fields to ensure consistent derivation
  const salt = undefined; // let encryptData generate a salt unless we want deterministic
  const iv = undefined;
  const encryptedKey = encryptData(apiKey, userId, { salt, iv });
  const encryptedSecret = encryptData(apiSecret, userId, { salt: encryptedKey.salt, iv: encryptedKey.iv });

    // Upsert credentials (insert or update if exists)
    await pool.query(
      `INSERT INTO user_credentials (
        user_id, broker, environment,
        api_key_encrypted, api_secret_encrypted,
        encryption_iv, encryption_salt,
        last_used
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id, broker, environment)
      DO UPDATE SET
        api_key_encrypted = $4,
        api_secret_encrypted = $5,
        encryption_iv = $6,
        encryption_salt = $7,
        last_used = NOW(),
        is_active = true`,
      [
        userId,
        broker,
        environment,
        encryptedKey.encrypted,
        encryptedSecret.encrypted,
        encryptedKey.iv, // Both use same IV/salt for this user/broker combo
        encryptedKey.salt,
      ]
    );
  }

  /**
   * Load decrypted credentials for user
   */
  async loadCredentials(
    userId: string,
    broker: string,
    environment: string
  ): Promise<LoadedCredentials | null> {
    const result = await pool.query<{
      api_key_encrypted: string;
      api_secret_encrypted: string;
      encryption_iv: string;
      encryption_salt: string;
    }>(
      `SELECT api_key_encrypted, api_secret_encrypted, encryption_iv, encryption_salt
       FROM user_credentials
       WHERE user_id = $1 AND broker = $2 AND environment = $3 AND is_active = true`,
      [userId, broker, environment]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    try {
      // Decrypt both credentials
      const apiKey = decryptData(
        row.api_key_encrypted,
        row.encryption_iv,
        row.encryption_salt,
        userId
      );

      const apiSecret = decryptData(
        row.api_secret_encrypted,
        row.encryption_iv,
        row.encryption_salt,
        userId
      );

      // Update last_used timestamp
      await pool.query(
        'UPDATE user_credentials SET last_used = NOW() WHERE user_id = $1 AND broker = $2 AND environment = $3',
        [userId, broker, environment]
      );

      return { apiKey, apiSecret };
    } catch (error) {
        console.error('[UserCredentialsService] Decryption failed:', error);
        try {
          const fs = require('fs');
    const fingerprint = (row.api_key_encrypted || '').slice(0,8);
    const logLine = `[${new Date().toISOString()}] DECRYPTION_FAILED userId=${userId} broker=${broker} environment=${environment} fingerprint=${fingerprint} error=${error instanceof Error?error.message:String(error)}\n`;
          fs.appendFileSync('/root/Tradebaas-1/apps/backend/logs/debug-decrypt.log', logLine);
        } catch (e) {
          // ignore logging failures
        }
        // Deactivate this credential row to avoid future attempts
        try {
          await pool.query(
            `UPDATE user_credentials SET is_active = false WHERE user_id = $1 AND broker = $2 AND environment = $3`,
            [userId, broker, environment]
          );
        } catch (e) {
          // ignore update errors
        }

        // Signal a specific error so frontend can prompt re-entry
        throw new Error('Credentials corrupted or encryption mismatch - please re-enter credentials.');
    }
  }

  /**
   * Check if user has credentials for broker/environment
   */
  async hasCredentials(
    userId: string,
    broker: string,
    environment: string
  ): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM user_credentials
       WHERE user_id = $1 AND broker = $2 AND environment = $3 AND is_active = true
       LIMIT 1`,
      [userId, broker, environment]
    );

    return result.rows.length > 0;
  }

  /**
   * Delete credentials
   */
  async deleteCredentials(
    userId: string,
    broker: string,
    environment: string
  ): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM user_credentials
       WHERE user_id = $1 AND broker = $2 AND environment = $3`,
      [userId, broker, environment]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * List all credentials metadata for user (no secrets)
   */
  async listCredentials(userId: string): Promise<UserCredentials[]> {
    const result = await pool.query<UserCredentials>(
      `SELECT id, user_id, broker, environment, created_at, last_used, is_active
       FROM user_credentials
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }
}

// Singleton instance
export const userCredentialsService = new UserCredentialsService();
