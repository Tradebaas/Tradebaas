#!/usr/bin/env node

/**
 * Clear all user credentials from database
 * Use this when encryption keys change or credentials are corrupted
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tradebaas:tradebaas_secure_2025@localhost:5432/tradebaas'
});

async function clearCredentials() {
  const userEmail = process.argv[2];
  
  if (!userEmail) {
    console.error('❌ Usage: node clear-credentials.js <user-email>');
    console.error('Example: node clear-credentials.js your@email.com');
    process.exit(1);
  }
  
  console.log(`[Clear Credentials] Clearing credentials for: ${userEmail}`);
  
  try {
    // Find user ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [userEmail]
    );
    
    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }
    
    const userId = userResult.rows[0].id;
    console.log(`[Clear Credentials] User ID: ${userId}`);
    
    // Count before
    const countBefore = await pool.query(
      'SELECT COUNT(*) FROM user_credentials WHERE user_id = $1',
      [userId]
    );
    console.log(`[Clear Credentials] Found ${countBefore.rows[0].count} credential entries for this user`);
    
    // Delete only this user's credentials
    const result = await pool.query(
      'DELETE FROM user_credentials WHERE user_id = $1',
      [userId]
    );
    console.log(`[Clear Credentials] Deleted ${result.rowCount} entries`);
    
    console.log('[Clear Credentials] ✅ Done! You can now save new credentials.');
    
  } catch (error) {
    console.error('[Clear Credentials] ❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearCredentials();
