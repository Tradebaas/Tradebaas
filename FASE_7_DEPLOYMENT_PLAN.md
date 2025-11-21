# FASE 7: PRODUCTION DEPLOYMENT & OPERATIONAL READINESS

**Date:** 21 November 2025  
**Status:** 🚧 IN PROGRESS  
**Phase:** Multi-User SaaS - Production Deployment

---

## Executive Summary

FASE 7 focuses on **production-ready deployment** without breaking existing functionality. All FASE 1-6 implementations are complete and tested. This phase prepares the system for **real-world multi-user production use**.

**Core Principles:**
- ✅ **Zero Downtime:** Graceful updates, no service interruption
- ✅ **Zero Breaking Changes:** Existing users unaffected
- ✅ **Monitoring First:** Visibility before scaling
- ✅ **Security Hardened:** Production-grade SSL, secrets management
- ✅ **Rollback Ready:** Every change reversible

---

## Current System Status (Pre-FASE 7)

### ✅ What's Working

**Backend (PM2):**
- Process: `tradebaas-backend` (PID: varies)
- Mode: Fork (single instance)
- Memory: ~55MB (healthy)
- CPU: 0% (idle, healthy)
- Restarts: 2 (auto-resume tested)
- Port: 3000 (HTTP), 3001 (WebSocket)
- Logs: `/root/Tradebaas-1/backend/logs/`

**Frontend (PM2):**
- Process: `tradebaas-frontend` (PID: varies)
- Mode: Fork (single instance)
- Memory: ~14MB (healthy)
- CPU: 0% (idle)
- Restarts: 0 (stable)
- Port: 5173 (Vite dev server)
- Logs: `/root/Tradebaas-1/logs/`

**Database:**
- PostgreSQL: Running, 4 tables (users, user_strategies, user_credentials, schema_migrations)
- SQLite: `/root/Tradebaas-1/state/trades.db` (user_id column migrated)
- Connection pool: Healthy (<20 connections)

**Multi-User Features (FASE 1-6):**
- ✅ User authentication (JWT)
- ✅ Per-user strategy management
- ✅ Per-user broker connections
- ✅ Per-user trade history
- ✅ Frontend multi-user support
- ✅ Auto-resume on restart

### ⚠️ Production Gaps Identified

**Environment Configuration:**
- [ ] `.env` file not production-ready (hardcoded secrets visible)
- [ ] No `.env.production` for production-specific config
- [ ] Database credentials in plaintext
- [ ] No secrets rotation strategy

**SSL/HTTPS:**
- [ ] Frontend uses HTTP (port 5173, not HTTPS)
- [ ] No SSL certificates configured
- [ ] No HTTPS redirect
- [ ] No HSTS headers

**Process Management:**
- [x] PM2 configured (ecosystem.config.cjs exists)
- [ ] No PM2 startup script (survives server reboot?)
- [ ] No health check monitoring
- [ ] No automatic restart on failure

**Monitoring & Logging:**
- [x] PM2 logs exist (`pm2 logs`)
- [ ] No log rotation (disk space risk)
- [ ] No centralized logging (hard to debug)
- [ ] No performance metrics (Prometheus/Grafana)
- [ ] No error alerting (email/Telegram)

**Backups:**
- [ ] No automated PostgreSQL backups
- [ ] No SQLite backups
- [ ] No backup restoration testing

**Security:**
- [ ] No rate limiting (API abuse risk)
- [ ] No CORS configuration review
- [ ] No security headers (CSP, X-Frame-Options, etc.)
- [ ] No dependency vulnerability scanning

**Performance:**
- [ ] Frontend in dev mode (Vite dev server, not production build)
- [ ] No CDN for static assets
- [ ] No compression (gzip/brotli)
- [ ] No caching strategy

---

## FASE 7 Implementation Plan

### Phase 7.1: Environment Configuration (Priority: HIGH)

**Objective:** Separate development, staging, production configurations.

**Tasks:**

1. **Create `.env.production` Template**
   ```bash
   # File: /root/Tradebaas-1/.env.production
   NODE_ENV=production
   
   # Database
   DATABASE_URL=postgresql://tradebaas:CHANGE_ME@localhost:5432/tradebaas
   SQLITE_DB_PATH=../state/trades.db
   
   # Backend
   BACKEND_PORT=3000
   BACKEND_HOST=0.0.0.0
   WS_PORT=3001
   
   # JWT
   JWT_SECRET=CHANGE_ME_64_CHARS_RANDOM_STRING
   JWT_EXPIRY=7d
   
   # Encryption (for user_credentials)
   ENCRYPTION_KEY=CHANGE_ME_32_BYTES_HEX
   
   # Deribit (optional, per-user credentials stored in DB)
   # Leave empty for multi-user mode
   DERIBIT_CLIENT_ID=
   DERIBIT_CLIENT_SECRET=
   
   # Admin
   ADMIN_EMAIL_DOMAIN=tradebazen.nl
   
   # Monitoring (optional)
   SENTRY_DSN=
   LOG_LEVEL=info
   ```

2. **Generate Secure Secrets**
   ```bash
   # JWT secret (64 chars)
   openssl rand -hex 32
   
   # Encryption key (32 bytes = 64 hex chars)
   openssl rand -hex 32
   
   # PostgreSQL password
   openssl rand -base64 24
   ```

3. **Update `backend/src/config/config.ts`**
   - Load from `.env.production` when `NODE_ENV=production`
   - Validate required secrets exist (fail fast if missing)
   - Add secret rotation support (multiple valid keys)

4. **Secure Secret Storage**
   ```bash
   # Restrict file permissions
   chmod 600 /root/Tradebaas-1/.env.production
   chown root:root /root/Tradebaas-1/.env.production
   
   # Add to .gitignore (if not already)
   echo ".env.production" >> .gitignore
   ```

**Validation:**
```bash
# Test production config load
NODE_ENV=production node backend/dist/server.js --test-config

# Expected: No errors, all secrets loaded
```

---

### Phase 7.2: Frontend Production Build (Priority: HIGH)

**Objective:** Replace Vite dev server with optimized production build + Nginx.

**Current Setup:**
- PM2 runs: `vite --host 0.0.0.0 --port 5173`
- Dev mode: HMR, sourcemaps, no minification
- Performance: Slower, larger bundles

**Target Setup:**
- Build once: `npm run build` → `dist/` folder
- Serve via Nginx: Static files, gzip, caching
- PM2 removed for frontend (Nginx handles)

**Tasks:**

1. **Build Frontend for Production**
   ```bash
   cd /root/Tradebaas-1/frontend
   npm run build
   
   # Output: frontend/dist/ folder with optimized assets
   ```

2. **Install Nginx (if not installed)**
   ```bash
   sudo apt update
   sudo apt install nginx -y
   sudo systemctl enable nginx
   sudo systemctl start nginx
   ```

3. **Create Nginx Configuration**
   ```nginx
   # File: /etc/nginx/sites-available/tradebaas
   
   server {
       listen 80;
       listen [::]:80;
       server_name app.tradebazen.nl;
   
       # Redirect HTTP to HTTPS (after SSL setup)
       # return 301 https://$server_name$request_uri;
   
       root /root/Tradebaas-1/frontend/dist;
       index index.html;
   
       # Frontend (SPA - all routes to index.html)
       location / {
           try_files $uri $uri/ /index.html;
       }
   
       # Backend API proxy
       location /api/ {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   
       # WebSocket proxy
       location /ws/ {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   
       # Static asset caching
       location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
           expires 1y;
           add_header Cache-Control "public, immutable";
       }
   
       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   
       # Gzip compression
       gzip on;
       gzip_vary on;
       gzip_min_length 1024;
       gzip_types text/plain text/css text/xml text/javascript 
                  application/x-javascript application/javascript 
                  application/xml+rss application/json;
   }
   ```

4. **Enable Nginx Site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/tradebaas /etc/nginx/sites-enabled/
   sudo nginx -t  # Test configuration
   sudo systemctl reload nginx
   ```

5. **Update PM2 Ecosystem (Remove Frontend Process)**
   ```javascript
   // File: config/ecosystem.config.cjs
   module.exports = {
     apps: [
       {
         name: 'tradebaas-backend',
         script: '/root/Tradebaas-1/backend/dist/server.js',
         cwd: '/root/Tradebaas-1/backend',
         // ... (keep existing backend config)
       },
       // Remove tradebaas-frontend (Nginx handles now)
     ],
   };
   ```

6. **Restart Services**
   ```bash
   pm2 delete tradebaas-frontend  # Remove old process
   pm2 reload ecosystem.config.cjs  # Reload backend only
   pm2 save  # Save new process list
   ```

**Validation:**
```bash
# Test Nginx serving frontend
curl -I http://app.tradebazen.nl
# Expected: 200 OK, HTML content

# Test API proxy
curl http://app.tradebazen.nl/api/health
# Expected: {"status":"ok",...}

# Test WebSocket proxy (optional)
wscat -c ws://app.tradebazen.nl/ws/
# Expected: Connection established
```

---

### Phase 7.3: SSL/HTTPS Setup (Priority: HIGH)

**Objective:** Secure all traffic with Let's Encrypt SSL certificates.

**Tasks:**

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   ```

2. **Generate SSL Certificate**
   ```bash
   sudo certbot --nginx -d app.tradebazen.nl
   
   # Follow prompts:
   # - Email: your-email@tradebazen.nl
   # - Agree to TOS: Yes
   # - Redirect HTTP to HTTPS: Yes (recommended)
   ```

3. **Verify Auto-Renewal**
   ```bash
   sudo certbot renew --dry-run
   # Expected: No errors
   ```

4. **Update Nginx Config (Auto-Modified by Certbot)**
   ```nginx
   # Certbot adds these blocks automatically:
   
   server {
       listen 443 ssl http2;
       listen [::]:443 ssl http2;
       server_name app.tradebazen.nl;
   
       ssl_certificate /etc/letsencrypt/live/app.tradebazen.nl/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/app.tradebazen.nl/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
   
       # ... (rest of config)
   }
   
   server {
       listen 80;
       server_name app.tradebazen.nl;
       return 301 https://$server_name$request_uri;
   }
   ```

5. **Update Frontend Environment**
   ```bash
   # File: frontend/.env.production
   VITE_API_URL=https://app.tradebazen.nl/api
   VITE_WS_URL=wss://app.tradebazen.nl/ws
   ```

6. **Rebuild Frontend with HTTPS URLs**
   ```bash
   cd /root/Tradebaas-1/frontend
   NODE_ENV=production npm run build
   ```

**Validation:**
```bash
# Test HTTPS redirect
curl -I http://app.tradebazen.nl
# Expected: 301 Moved Permanently → https://

# Test HTTPS connection
curl -I https://app.tradebazen.nl
# Expected: 200 OK

# Check SSL grade
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=app.tradebazen.nl
# Expected: A or A+ rating
```

---

### Phase 7.4: PM2 Production Setup (Priority: MEDIUM)

**Objective:** Ensure backend survives server reboots and auto-restarts on crashes.

**Tasks:**

1. **Configure PM2 Startup Script**
   ```bash
   pm2 startup systemd -u root --hp /root
   # Copy and run the generated command
   
   # Example output:
   # sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
   ```

2. **Save Current PM2 Process List**
   ```bash
   pm2 save
   # Saves to: /root/.pm2/dump.pm2
   ```

3. **Update Ecosystem Config for Production**
   ```javascript
   // File: config/ecosystem.config.cjs
   module.exports = {
     apps: [
       {
         name: 'tradebaas-backend',
         script: '/root/Tradebaas-1/backend/dist/server.js',
         cwd: '/root/Tradebaas-1/backend',
         interpreter: 'node',
         instances: 1,
         exec_mode: 'fork',
         
         // Production environment
         env: {
           NODE_ENV: 'production',
           PORT: 3000,
           WS_PORT: 3001,
         },
         
         // Auto-restart on crash
         autorestart: true,
         max_restarts: 10,
         min_uptime: '10s',
         
         // Restart on file changes (disabled for production)
         watch: false,
         
         // Logging
         error_file: '/root/Tradebaas-1/backend/logs/error.log',
         out_file: '/root/Tradebaas-1/backend/logs/out.log',
         log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
         merge_logs: true,
         
         // Time between restarts
         restart_delay: 4000,
         
         // Kill timeout
         kill_timeout: 5000,
       },
     ],
   };
   ```

4. **Test Reboot Survival**
   ```bash
   # Simulate reboot
   sudo systemctl restart pm2-root
   
   # Wait 10 seconds
   sleep 10
   
   # Check PM2 status
   pm2 status
   # Expected: tradebaas-backend online
   ```

**Validation:**
```bash
# Check systemd service
systemctl status pm2-root
# Expected: active (running)

# Check PM2 logs
pm2 logs tradebaas-backend --lines 50
# Expected: No errors, backend started
```

---

### Phase 7.5: Log Rotation (Priority: MEDIUM)

**Objective:** Prevent log files from filling disk space.

**Tasks:**

1. **Install PM2 Log Rotation Module**
   ```bash
   pm2 install pm2-logrotate
   ```

2. **Configure Log Rotation**
   ```bash
   # Max log file size: 50MB
   pm2 set pm2-logrotate:max_size 50M
   
   # Keep last 10 rotated files
   pm2 set pm2-logrotate:retain 10
   
   # Compress rotated logs
   pm2 set pm2-logrotate:compress true
   
   # Rotation interval: daily
   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
   ```

3. **Configure Nginx Log Rotation**
   ```bash
   # File: /etc/logrotate.d/nginx (already exists)
   # Verify settings:
   cat /etc/logrotate.d/nginx
   
   # Expected:
   # /var/log/nginx/*.log {
   #     daily
   #     missingok
   #     rotate 14
   #     compress
   #     delaycompress
   #     notifempty
   #     create 0640 www-data adm
   #     sharedscripts
   #     postrotate
   #         [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
   #     endscript
   # }
   ```

**Validation:**
```bash
# Check PM2 log rotation config
pm2 conf pm2-logrotate

# Test logrotate manually
sudo logrotate -f /etc/logrotate.d/nginx

# Check log files
ls -lh /root/Tradebaas-1/backend/logs/
ls -lh /var/log/nginx/
```

---

### Phase 7.6: Database Backups (Priority: HIGH)

**Objective:** Automated daily backups with 30-day retention.

**Tasks:**

1. **Create Backup Script**
   ```bash
   # File: /root/Tradebaas-1/scripts/backup-databases.sh
   
   #!/bin/bash
   
   BACKUP_DIR="/root/Tradebaas-1/backups"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   # Create backup directory if not exists
   mkdir -p "$BACKUP_DIR"
   
   # Backup PostgreSQL
   echo "[$(date)] Starting PostgreSQL backup..."
   PGPASSWORD=tradebaas_secure_2025 pg_dump -h localhost -U tradebaas -d tradebaas \
     -F c -f "$BACKUP_DIR/postgres_$DATE.dump"
   
   if [ $? -eq 0 ]; then
     echo "[$(date)] PostgreSQL backup successful: postgres_$DATE.dump"
   else
     echo "[$(date)] PostgreSQL backup FAILED" >&2
     exit 1
   fi
   
   # Backup SQLite
   echo "[$(date)] Starting SQLite backup..."
   sqlite3 /root/Tradebaas-1/state/trades.db ".backup $BACKUP_DIR/sqlite_$DATE.db"
   
   if [ $? -eq 0 ]; then
     echo "[$(date)] SQLite backup successful: sqlite_$DATE.db"
   else
     echo "[$(date)] SQLite backup FAILED" >&2
     exit 1
   fi
   
   # Compress backups
   echo "[$(date)] Compressing backups..."
   gzip "$BACKUP_DIR/postgres_$DATE.dump"
   gzip "$BACKUP_DIR/sqlite_$DATE.db"
   
   # Delete backups older than 30 days
   echo "[$(date)] Cleaning old backups (30+ days)..."
   find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
   
   echo "[$(date)] Backup complete!"
   ```

2. **Make Script Executable**
   ```bash
   chmod +x /root/Tradebaas-1/scripts/backup-databases.sh
   ```

3. **Schedule Daily Backups (Cron)**
   ```bash
   # Add to root crontab
   sudo crontab -e
   
   # Add this line (runs daily at 2 AM):
   0 2 * * * /root/Tradebaas-1/scripts/backup-databases.sh >> /root/Tradebaas-1/logs/backup.log 2>&1
   ```

4. **Test Backup Script**
   ```bash
   /root/Tradebaas-1/scripts/backup-databases.sh
   
   # Check backups created
   ls -lh /root/Tradebaas-1/backups/
   # Expected: postgres_YYYYMMDD_HHMMSS.dump.gz, sqlite_YYYYMMDD_HHMMSS.db.gz
   ```

5. **Create Restore Documentation**
   ```bash
   # File: /root/Tradebaas-1/DOCS/RESTORE_BACKUP.md
   
   # Restore PostgreSQL
   gunzip -c /root/Tradebaas-1/backups/postgres_YYYYMMDD_HHMMSS.dump.gz | \
     PGPASSWORD=tradebaas_secure_2025 pg_restore -h localhost -U tradebaas -d tradebaas -c
   
   # Restore SQLite
   gunzip -c /root/Tradebaas-1/backups/sqlite_YYYYMMDD_HHMMSS.db.gz > \
     /root/Tradebaas-1/state/trades.db
   ```

**Validation:**
```bash
# Verify cron job scheduled
sudo crontab -l | grep backup-databases

# Check backup log
tail -f /root/Tradebaas-1/logs/backup.log
```

---

### Phase 7.7: Monitoring & Alerting (Priority: LOW)

**Objective:** Get notified when backend crashes or errors occur.

**Tasks (Optional):**

1. **Simple Email Alerts (via PM2 ecosystem)**
   ```javascript
   // Add to ecosystem.config.cjs
   module.exports = {
     apps: [{
       // ... existing config
       
       // Email on crash (requires PM2 Plus or custom script)
       error_file: '/root/Tradebaas-1/backend/logs/error.log',
       
       // Custom watch script
       watch: false,  // Disabled for production
     }],
   };
   ```

2. **Health Check Endpoint Monitoring**
   ```bash
   # File: /root/Tradebaas-1/scripts/health-check.sh
   
   #!/bin/bash
   
   HEALTH_URL="https://app.tradebazen.nl/api/health"
   
   # Check health endpoint
   HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")
   
   if [ "$HTTP_CODE" != "200" ]; then
     echo "[$(date)] ALERT: Backend health check failed (HTTP $HTTP_CODE)" >&2
     # Send email alert (requires mail command)
     # echo "Backend down!" | mail -s "Tradebaas Alert" admin@tradebazen.nl
     exit 1
   fi
   
   echo "[$(date)] Health check OK"
   ```

3. **Schedule Health Checks (Every 5 Minutes)**
   ```bash
   # Add to crontab
   */5 * * * * /root/Tradebaas-1/scripts/health-check.sh >> /root/Tradebaas-1/logs/health-check.log 2>&1
   ```

**Validation:**
```bash
# Test health check script
/root/Tradebaas-1/scripts/health-check.sh

# Verify cron job
sudo crontab -l | grep health-check
```

---

## Implementation Checklist

### ✅ Phase 7.1: Environment Configuration
- [ ] Create `.env.production` with secure secrets
- [ ] Generate JWT secret, encryption key, DB password
- [ ] Update `backend/src/config/config.ts` to load production env
- [ ] Restrict `.env.production` file permissions (chmod 600)
- [ ] Add `.env.production` to `.gitignore`
- [ ] Test production config load

### ✅ Phase 7.2: Frontend Production Build
- [ ] Run `npm run build` in frontend/
- [ ] Install Nginx
- [ ] Create `/etc/nginx/sites-available/tradebaas` config
- [ ] Enable Nginx site (symlink to sites-enabled)
- [ ] Test Nginx configuration (`nginx -t`)
- [ ] Update PM2 ecosystem (remove frontend process)
- [ ] Delete old PM2 frontend process
- [ ] Test frontend serving via Nginx
- [ ] Test API proxy via Nginx
- [ ] Test WebSocket proxy via Nginx

### ✅ Phase 7.3: SSL/HTTPS Setup
- [ ] Install Certbot
- [ ] Generate Let's Encrypt certificate
- [ ] Verify auto-renewal (`certbot renew --dry-run`)
- [ ] Update frontend `.env.production` (HTTPS URLs)
- [ ] Rebuild frontend with HTTPS URLs
- [ ] Test HTTPS redirect
- [ ] Test HTTPS connection
- [ ] Check SSL grade (SSL Labs)

### ✅ Phase 7.4: PM2 Production Setup
- [ ] Configure PM2 startup script (`pm2 startup`)
- [ ] Save PM2 process list (`pm2 save`)
- [ ] Update ecosystem.config.cjs (production settings)
- [ ] Test reboot survival
- [ ] Verify systemd service (`systemctl status pm2-root`)

### ✅ Phase 7.5: Log Rotation
- [ ] Install `pm2-logrotate` module
- [ ] Configure PM2 log rotation (50MB, 10 files, compress)
- [ ] Verify Nginx log rotation config
- [ ] Test log rotation manually

### ✅ Phase 7.6: Database Backups
- [ ] Create `scripts/backup-databases.sh`
- [ ] Make script executable
- [ ] Schedule daily backups (cron at 2 AM)
- [ ] Test backup script
- [ ] Create restore documentation
- [ ] Verify cron job scheduled

### ✅ Phase 7.7: Monitoring & Alerting (Optional)
- [ ] Create `scripts/health-check.sh`
- [ ] Schedule health checks (cron every 5 minutes)
- [ ] Test health check script
- [ ] Configure email alerts (optional)

---

## Rollback Plan

### If Production Deployment Fails

**Rollback to Current Setup:**
```bash
# 1. Revert Nginx changes
sudo rm /etc/nginx/sites-enabled/tradebaas
sudo systemctl reload nginx

# 2. Restore PM2 frontend process
pm2 start ecosystem.config.cjs --only tradebaas-frontend
pm2 save

# 3. Restore old .env file (if backed up)
cp .env.backup .env

# 4. Restart backend
pm2 restart tradebaas-backend
```

**Verify Rollback:**
```bash
# Check PM2 status
pm2 status
# Expected: Both backend and frontend online

# Test frontend
curl http://localhost:5173
# Expected: HTML content

# Test backend
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

---

## Post-Deployment Validation

### Smoke Tests

```bash
# 1. Backend health
curl https://app.tradebazen.nl/api/health
# Expected: {"status":"ok","uptime":...}

# 2. User registration
curl -X POST https://app.tradebazen.nl/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","disclaimerAccepted":true}'
# Expected: {"success":true}

# 3. User login
curl -X POST https://app.tradebazen.nl/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
# Expected: {"success":true,"accessToken":"..."}

# 4. Strategy status (requires JWT)
curl "https://app.tradebazen.nl/api/user/strategy/status?broker=deribit&environment=testnet" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
# Expected: {"success":true,"strategies":[]}

# 5. Frontend loads
curl -I https://app.tradebazen.nl
# Expected: 200 OK, HTML content

# 6. WebSocket connection (optional)
wscat -c wss://app.tradebazen.nl/ws/
# Expected: Connection established
```

### Performance Tests

```bash
# 1. API response time (avg of 10 requests)
for i in {1..10}; do
  time curl -s https://app.tradebazen.nl/api/health > /dev/null
done
# Expected: <200ms average

# 2. Database connection pool
PGPASSWORD=tradebaas_secure_2025 psql -h localhost -U tradebaas -d tradebaas \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname='tradebaas';"
# Expected: <20 connections

# 3. Backend memory usage
pm2 status
# Expected: <200MB memory (healthy under load)

# 4. Disk space
df -h /root/Tradebaas-1
# Expected: >10GB free space
```

---

## Timeline Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 7.1 Environment Config | 5 tasks | 30 minutes |
| 7.2 Frontend Build | 6 tasks | 1 hour |
| 7.3 SSL Setup | 6 tasks | 30 minutes |
| 7.4 PM2 Setup | 4 tasks | 20 minutes |
| 7.5 Log Rotation | 3 tasks | 15 minutes |
| 7.6 Backups | 5 tasks | 30 minutes |
| 7.7 Monitoring | 3 tasks | 20 minutes |
| **Total** | **32 tasks** | **~3.5 hours** |

**Plus:**
- Testing & validation: 1 hour
- Documentation: 30 minutes
- **Total time: ~5 hours**

---

## Success Criteria

### Functional Requirements
- ✅ Frontend accessible via HTTPS (https://app.tradebazen.nl)
- ✅ API accessible via HTTPS (https://app.tradebazen.nl/api/*)
- ✅ WebSocket accessible via WSS (wss://app.tradebazen.nl/ws/)
- ✅ User registration working
- ✅ User login working
- ✅ Strategy management working
- ✅ Auto-resume after backend restart

### Non-Functional Requirements
- ✅ SSL certificate valid (A+ grade)
- ✅ Backend survives server reboot
- ✅ Logs rotate automatically (no disk space issues)
- ✅ Daily backups scheduled
- ✅ API response time <200ms
- ✅ Backend memory usage <200MB
- ✅ Zero downtime during deployment

---

## Next Steps

1. **Start with Phase 7.1** (Environment Configuration)
2. **Progress sequentially** through phases 7.2-7.7
3. **Test after each phase** (validate before continuing)
4. **Document any issues** encountered
5. **Create FASE_7_COMPLETION_REPORT.md** when done

---

**Let's begin with Phase 7.1: Environment Configuration!** 🚀
