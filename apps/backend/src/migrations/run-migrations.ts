/**
 * Migration Runner
 * Runs database migrations for PostgreSQL and SQLite
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connections
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://tradebaas:tradebaas_secure_2025@localhost:5432/tradebaas'
});

const sqliteDbPath = path.join(__dirname, '../../state/trades.db');

// ============================================================================
// Schema Version Tracking
// ============================================================================

interface Migration {
  version: number;
  name: string;
  type: 'postgres' | 'sqlite';
  file: string;
}

const migrations: Migration[] = [
  { version: 1, name: 'create_user_strategies', type: 'postgres', file: '001_create_user_strategies.sql' },
  { version: 2, name: 'add_user_id_to_trades', type: 'sqlite', file: '002_add_user_id_to_trades.sql' },
];

/**
 * Get current PostgreSQL schema version
 */
async function getPostgresVersion(): Promise<number> {
  try {
    const result = await pgPool.query('SELECT MAX(version) as version FROM schema_migrations');
    return result.rows[0]?.version || 0;
  } catch (error) {
    // Table doesn't exist yet - create it
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
    return 0;
  }
}

/**
 * Get current SQLite schema version
 */
function getSqliteVersion(): number {
  try {
    if (!fs.existsSync(sqliteDbPath)) {
      console.log('[SQLite] Database not found - will be created on first trade');
      return 0;
    }
    
    const db = new Database(sqliteDbPath);
    
    // Check if schema_migrations table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).get();
    
    if (!tableExists) {
      db.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      db.close();
      return 0;
    }
    
    const result = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number | null };
    db.close();
    return result?.version || 0;
  } catch (error) {
    console.error('[SQLite] Error getting version:', error);
    return 0;
  }
}

/**
 * Run PostgreSQL migration
 */
async function runPostgresMigration(migration: Migration): Promise<void> {
  const filePath = path.join(__dirname, '../../migrations', migration.file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`[PostgreSQL] Running migration ${migration.version}: ${migration.name}...`);
  
  try {
    await pgPool.query('BEGIN');
    
    // Run migration SQL
    await pgPool.query(sql);
    
    // Record migration
    await pgPool.query(
      'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
      [migration.version, migration.name]
    );
    
    await pgPool.query('COMMIT');
    
    console.log(`[PostgreSQL] ✅ Migration ${migration.version} completed`);
  } catch (error) {
    await pgPool.query('ROLLBACK');
    console.error(`[PostgreSQL] ❌ Migration ${migration.version} failed:`, error);
    throw error;
  }
}

/**
 * Run SQLite migration
 */
function runSqliteMigration(migration: Migration): void {
  const filePath = path.join(__dirname, '../../migrations', migration.file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`[SQLite] Running migration ${migration.version}: ${migration.name}...`);
  
  try {
    // Ensure state directory exists
    const stateDir = path.dirname(sqliteDbPath);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    
    // Create or open database
    const db = new Database(sqliteDbPath);
    
    // For migrations that modify trades table, check if it exists first
    if (migration.file.includes('add_user_id_to_trades')) {
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='trades'"
      ).get();
      
      if (!tableExists) {
        console.log(`[SQLite] ⚠️  Skipping migration ${migration.version}: trades table doesn't exist yet (will auto-create on first trade)`);
        // Still record the migration as completed (idempotent)
        db.prepare(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name);
        db.close();
        return;
      }
    }
    
    // Run migration SQL
    db.exec(sql);
    
    // Record migration
    db.prepare(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
    ).run(migration.version, migration.name);
    
    db.close();
    
    console.log(`[SQLite] ✅ Migration ${migration.version} completed`);
  } catch (error) {
    console.error(`[SQLite] ❌ Migration ${migration.version} failed:`, error);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE MIGRATIONS');
  console.log('='.repeat(80) + '\n');
  
  // Get current versions
  const pgVersion = await getPostgresVersion();
  const sqliteVersion = getSqliteVersion();
  
  console.log(`Current versions:`);
  console.log(`  PostgreSQL: ${pgVersion}`);
  console.log(`  SQLite:     ${sqliteVersion}\n`);
  
  // Filter pending migrations
  const pendingMigrations = migrations.filter(m => {
    if (m.type === 'postgres') {
      return m.version > pgVersion;
    } else {
      return m.version > sqliteVersion;
    }
  });
  
  if (pendingMigrations.length === 0) {
    console.log('✅ No pending migrations - schema is up to date\n');
    return;
  }
  
  console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);
  
  // Run migrations in order
  for (const migration of pendingMigrations) {
    if (migration.type === 'postgres') {
      await runPostgresMigration(migration);
    } else {
      runSqliteMigration(migration);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80) + '\n');
}

/**
 * Rollback last migration
 */
async function rollback(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('ROLLBACK LAST MIGRATION');
  console.log('='.repeat(80) + '\n');
  
  const pgVersion = await getPostgresVersion();
  const sqliteVersion = getSqliteVersion();
  
  console.log(`Current versions:`);
  console.log(`  PostgreSQL: ${pgVersion}`);
  console.log(`  SQLite:     ${sqliteVersion}\n`);
  
  // Find latest migration to rollback
  const latestPg = migrations.filter(m => m.type === 'postgres' && m.version === pgVersion)[0];
  const latestSqlite = migrations.filter(m => m.type === 'sqlite' && m.version === sqliteVersion)[0];
  
  if (!latestPg && !latestSqlite) {
    console.log('❌ No migrations to rollback\n');
    return;
  }
  
  // Rollback PostgreSQL
  if (latestPg) {
    const rollbackFile = path.join(__dirname, '../../migrations', latestPg.file.replace('.sql', '_rollback.sql'));
    if (fs.existsSync(rollbackFile)) {
      const sql = fs.readFileSync(rollbackFile, 'utf-8');
      console.log(`[PostgreSQL] Rolling back migration ${latestPg.version}: ${latestPg.name}...`);
      
      try {
        await pgPool.query('BEGIN');
        await pgPool.query(sql);
        await pgPool.query('DELETE FROM schema_migrations WHERE version = $1', [latestPg.version]);
        await pgPool.query('COMMIT');
        console.log(`[PostgreSQL] ✅ Rollback completed`);
      } catch (error) {
        await pgPool.query('ROLLBACK');
        console.error(`[PostgreSQL] ❌ Rollback failed:`, error);
        throw error;
      }
    }
  }
  
  // Rollback SQLite
  if (latestSqlite) {
    const rollbackFile = path.join(__dirname, '../../migrations', latestSqlite.file.replace('.sql', '_rollback.sql'));
    if (fs.existsSync(rollbackFile)) {
      const sql = fs.readFileSync(rollbackFile, 'utf-8');
      console.log(`[SQLite] Rolling back migration ${latestSqlite.version}: ${latestSqlite.name}...`);
      
      try {
        const db = new Database(sqliteDbPath);
        
        // For migrations that modify trades table, check if it exists first
        if (latestSqlite.file.includes('add_user_id_to_trades')) {
          const tableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='trades'"
          ).get();
          
          if (!tableExists) {
            console.log(`[SQLite] ⚠️  Skipping rollback: trades table doesn't exist (migration was skipped)`);
            db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(latestSqlite.version);
            db.close();
            return;
          }
        }
        
        db.exec(sql);
        db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(latestSqlite.version);
        db.close();
        console.log(`[SQLite] ✅ Rollback completed`);
      } catch (error) {
        console.error(`[SQLite] ❌ Rollback failed:`, error);
        throw error;
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ ROLLBACK COMPLETED');
  console.log('='.repeat(80) + '\n');
}

/**
 * Show current schema version
 */
async function showVersion(): Promise<void> {
  const pgVersion = await getPostgresVersion();
  const sqliteVersion = getSqliteVersion();
  
  console.log('\n' + '='.repeat(80));
  console.log('CURRENT SCHEMA VERSIONS');
  console.log('='.repeat(80));
  console.log(`PostgreSQL: ${pgVersion}`);
  console.log(`SQLite:     ${sqliteVersion}`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2] || 'migrate';

(async () => {
  try {
    switch (command) {
      case 'migrate':
        await runMigrations();
        break;
      case 'rollback':
        await rollback();
        break;
      case 'version':
        await showVersion();
        break;
      default:
        console.log('Usage: npm run migrate [migrate|rollback|version]');
    }
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    await pgPool.end();
    process.exit(1);
  }
})();
