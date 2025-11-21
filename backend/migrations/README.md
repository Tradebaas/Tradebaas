# Database Migrations

## Overview

This folder contains **database migrations** for the multi-user SaaS transformation.

**Databases:**
- **PostgreSQL** - User data, strategies, credentials (server-side)
- **SQLite** - Trade history (local file-based)

---

## Migration Files

### Naming Convention

```
NNN_descriptive_name.sql
```

- `NNN` = Sequential number (001, 002, 003, ...)
- `descriptive_name` = What the migration does
- `.sql` = SQL file (PostgreSQL or SQLite syntax)

### Current Migrations

| File | Database | Description | Status |
|------|----------|-------------|--------|
| `001_create_user_strategies.sql` | PostgreSQL | Create user_strategies table | Pending |
| `002_extend_trades_table.sql` | SQLite | Add user_id column to trades | Pending |

---

## Running Migrations

### Automatic (Recommended)

```bash
cd /root/Tradebaas-1/backend
npm run migrate
```

This will:
1. Check current schema version
2. Run pending migrations in order
3. Update schema version
4. Log all changes

### Manual (For Testing)

**PostgreSQL:**
```bash
PGPASSWORD=tradebaas_secure_2025 psql -U tradebaas -h localhost -d tradebaas -f migrations/001_create_user_strategies.sql
```

**SQLite:**
```bash
sqlite3 /root/Tradebaas-1/state/trades.db < migrations/002_extend_trades_table.sql
```

---

## Rollback

Each migration has a corresponding rollback script:

```bash
npm run migrate:rollback
```

This runs `NNN_descriptive_name_rollback.sql` files.

---

## Migration Design Principles

### 1. **Agnostic Design**

✅ **Strategy-Agnostic:**
```sql
-- DON'T: Hardcoded strategy fields
ALTER TABLE user_strategies ADD COLUMN razor_config JSONB;
ALTER TABLE user_strategies ADD COLUMN thor_config JSONB;

-- DO: Generic config field
config JSONB NOT NULL  -- Works for Razor, Thor, ANY future strategy
```

✅ **Broker-Agnostic:**
```sql
-- DON'T: Deribit-specific
ALTER TABLE user_credentials ADD COLUMN deribit_key TEXT;

-- DO: Generic broker field
broker VARCHAR(50) NOT NULL  -- Works for Deribit, Binance, ANY future broker
```

✅ **Environment-Agnostic:**
```sql
-- DON'T: Boolean testnet flag
testnet BOOLEAN DEFAULT false;

-- DO: String environment
environment VARCHAR(20) NOT NULL  -- 'testnet', 'live', 'sandbox', etc.
```

### 2. **Backward Compatible**

✅ **Add columns as NULLABLE first:**
```sql
-- Safe: Won't break existing rows
ALTER TABLE trades ADD COLUMN user_id UUID;

-- Later, after data migration:
ALTER TABLE trades ALTER COLUMN user_id SET NOT NULL;
```

❌ **DON'T add NOT NULL immediately:**
```sql
-- BREAKS: Existing rows have NULL user_id
ALTER TABLE trades ADD COLUMN user_id UUID NOT NULL;  -- ❌ FAILS
```

### 3. **Indexed for Performance**

```sql
-- Always add indexes for:
-- - Foreign keys (user_id)
-- - Filter columns (status, broker, environment)
-- - Sort columns (created_at, updated_at)

CREATE INDEX idx_user_strategies_user ON user_strategies(user_id);
CREATE INDEX idx_user_strategies_status ON user_strategies(status);
CREATE INDEX idx_trades_user ON trades(user_id);
```

### 4. **Constraints for Data Integrity**

```sql
-- Foreign keys (enforce referential integrity)
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

-- Unique constraints (prevent duplicates)
UNIQUE (user_id, strategy_name, instrument, environment),

-- Check constraints (enforce valid values)
CHECK (status IN ('active', 'stopped', 'paused', 'error')),
CHECK (environment IN ('live', 'testnet')),
```

---

## Testing Migrations

### Pre-Migration Checklist

- [ ] Backup production database
- [ ] Test on development database first
- [ ] Verify schema version tracking
- [ ] Test rollback script
- [ ] Document breaking changes

### Post-Migration Verification

```bash
# PostgreSQL: Verify user_strategies table
npm run verify:schema

# SQLite: Verify trades.user_id column
npm run verify:trades

# Integration test
npm run test:multi-user
```

---

## Troubleshooting

### Migration Failed Midway

```bash
# 1. Check error logs
tail -n 100 logs/migration.log

# 2. Rollback to previous state
npm run migrate:rollback

# 3. Fix migration script

# 4. Re-run migration
npm run migrate
```

### Schema Version Mismatch

```bash
# Check current version
npm run migrate:version

# Force set version (dangerous!)
npm run migrate:force-version 3
```

---

## Schema Version Tracking

Migrations are tracked in a `schema_version` table:

```sql
CREATE TABLE schema_version (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL,
  migration_name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW()
);
```

Current version is stored in environment variable:

```bash
SCHEMA_VERSION=2  # In .env
```

---

## Production Deployment

### Pre-Deployment

1. **Backup databases:**
   ```bash
   # PostgreSQL
   pg_dump -U tradebaas -h localhost tradebaas > backup-$(date +%Y%m%d).sql
   
   # SQLite
   cp state/trades.db state/trades-backup-$(date +%Y%m%d).db
   ```

2. **Test migrations on staging:**
   ```bash
   NODE_ENV=staging npm run migrate
   ```

3. **Verify no errors:**
   ```bash
   npm run test:migrations
   ```

### Deployment

1. **Stop backend (zero downtime alternative: use read replica):**
   ```bash
   pm2 stop backend
   ```

2. **Run migrations:**
   ```bash
   npm run migrate
   ```

3. **Verify schema:**
   ```bash
   npm run verify:schema
   ```

4. **Restart backend:**
   ```bash
   pm2 restart backend
   ```

5. **Monitor logs:**
   ```bash
   pm2 logs backend --lines 100
   ```

### Rollback Plan

If deployment fails:

```bash
# 1. Stop backend
pm2 stop backend

# 2. Restore database
pg_restore backup-YYYYMMDD.sql
cp state/trades-backup-YYYYMMDD.db state/trades.db

# 3. Revert code
git reset --hard <previous-commit>

# 4. Restart backend
pm2 restart backend
```

---

## Future Migrations

When adding new migrations:

1. Create migration file: `NNN_description.sql`
2. Create rollback file: `NNN_description_rollback.sql`
3. Test on dev database
4. Update this README
5. Add to `package.json` scripts if needed
6. Document in MASTER.md

---

## Questions?

See: `/root/Tradebaas-1/DOCS/architecture/MULTI_USER_IMPLEMENTATION_ROADMAP.md`
