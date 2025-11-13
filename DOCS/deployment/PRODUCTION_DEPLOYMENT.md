# Production Deployment Guide

**Tradebaas 24/7 Automated Trading Platform**

This guide documents the **current production deployment** at `app.tradebazen.nl`.

## 🏗️ Production Architecture

```
Internet (HTTPS)
      │
      ▼
[DigitalOcean Load Balancer]
      │
      ▼
[Nginx (SSL + Reverse Proxy)]
   Port 443 → Port 80
      │
      ├─→ Frontend (React) - /var/www/tradebaas/
      │
      └─→ Backend (Node.js) - http://127.0.0.1:3000
             │
             ├─→ Strategy Service (24/7)
             │
             └─→ WebSocket → Deribit Live API
```

## 📁 File Structure (Production)

```
/root/tradebaas/             # Source code
├── backend/
│   ├── src/                 # TypeScript source
│   ├── dist/                # Compiled JavaScript
│   └── package.json
├── src/                     # Frontend source
├── dist/                    # Frontend build output
└── backend-state.json       # Strategy persistence

/var/www/tradebaas/          # Nginx web root
└── [frontend build files]   # HTML, JS, CSS, assets

/etc/systemd/system/
└── tradebaas-backend.service  # Backend service definition
```

## 🚀 Backend Service (systemd)

### Service Configuration

**File:** `/etc/systemd/system/tradebaas-backend.service`

```ini
[Unit]
Description=Tradebaas Backend 24/7 Trading Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/tradebaas/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/tsx watch --clear-screen=false src/server.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Service Management Commands

```bash
# Start backend
sudo systemctl start tradebaas-backend

# Stop backend
sudo systemctl stop tradebaas-backend

# Restart backend
sudo systemctl restart tradebaas-backend

# Check status
sudo systemctl status tradebaas-backend

# Enable auto-start on boot
sudo systemctl enable tradebaas-backend

# View logs (live)
sudo journalctl -u tradebaas-backend -f

# View last 100 lines
sudo journalctl -u tradebaas-backend -n 100
```

### Verify Backend Running

```bash
# Check process
ps aux | grep tsx

# Check port listening
sudo netstat -tlnp | grep 3000

# Health check
curl http://127.0.0.1:3000/health

# Strategy status
curl http://127.0.0.1:3000/api/strategy/status | jq .
```

## 🌐 Frontend Deployment (Nginx)

### Nginx Configuration

**File:** `/etc/nginx/sites-available/app.tradebazen.nl`

```nginx
server {
    listen 80;
    server_name app.tradebazen.nl;
    root /var/www/tradebaas;
    index index.html;

    # Frontend SPA routing
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
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log

# View access logs
sudo tail -f /var/log/nginx/access.log
```

## 📦 Deployment Procedures

### Backend Deployment

```bash
# Navigate to project
cd /root/tradebaas/backend

# Pull latest code (if using git)
git pull origin main

# Install dependencies
npm install

# Rebuild (if needed)
npm run build

# Restart service
sudo systemctl restart tradebaas-backend

# Verify logs
sudo journalctl -u tradebaas-backend -f --since "1 minute ago"

# Verify running
curl http://127.0.0.1:3000/health
```

### Frontend Deployment

```bash
# Navigate to project
cd /root/tradebaas

# Install dependencies
npm install

# Build for production
npm run build

# Copy to web root
sudo cp -r dist/* /var/www/tradebaas/

# Verify deployment
curl -I https://app.tradebazen.nl

# Check timestamp
ls -lh /var/www/tradebaas/index.html
```

**Current Build Stats:**
- Bundle size: 703.12 KB
- Gzipped: 197.34 KB
- Build time: ~10 seconds

### Complete Deployment (Both)

```bash
#!/bin/bash
# Full deployment script

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Backend
cd /root/tradebaas/backend
echo "📦 Backend: Installing dependencies..."
npm install
echo "🔨 Backend: Restarting service..."
sudo systemctl restart tradebaas-backend
sleep 3
echo "✅ Backend: Status"
sudo systemctl status tradebaas-backend --no-pager

# Frontend
cd /root/tradebaas
echo "📦 Frontend: Installing dependencies..."
npm install
echo "🔨 Frontend: Building..."
npm run build
echo "📤 Frontend: Deploying to web root..."
sudo cp -r dist/* /var/www/tradebaas/

echo "✅ Deployment complete!"
echo "🌐 URL: https://app.tradebazen.nl"
curl -I https://app.tradebazen.nl | head -1
```

## 🔧 Environment Variables

### Backend (.env or systemd)

```bash
# Deribit API
DERIBIT_API_KEY=your_live_key
DERIBIT_API_SECRET=your_live_secret
DERIBIT_ENVIRONMENT=live

# Server
PORT=3000
NODE_ENV=production
```

**⚠️ Security Note:** Never commit credentials to git. Use systemd environment files or encrypted secrets management.

## 📊 Monitoring & Health Checks

### Backend Health Endpoint

```bash
curl http://127.0.0.1:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": 1730643123000,
  "uptime": 12345
}
```

### Strategy Status Monitoring

```bash
# Get current strategy
curl http://127.0.0.1:3000/api/strategy/status | jq .

# Get analysis state
curl http://127.0.0.1:3000/api/strategy/analysis/[ID] | jq .

# Watch logs
sudo journalctl -u tradebaas-backend -f | grep -E "(Razor|Ticker|Checkpoint)"
```

### Key Log Patterns

**Successful startup:**
```
[Razor] Fetching historical 1-min candles for BTC_USDC-PERPETUAL...
[Razor] ✅ Loaded 100 historical candles
[Razor] Price range: $107370.50 - $108274.00
[Razor] ✅ Ready to analyze with 100 candles
[Razor] Indicators: EMA Fast $107742.97, RSI 61.3, Volatility 0.12%
```

**Live data streaming:**
```
📊 Ticker received: $107868.5
[Razor] Building 1-min candle: $107868.5
```

**Strategy signals:**
```
[Razor] 🎯 Entry signal detected!
[Razor] Direction: LONG, Signal strength: 85
[Razor] Entry: $107900, Stop: $107360, Target: $108440
```

### System Resource Monitoring

```bash
# CPU and memory usage
top -b -n 1 | grep tsx

# Backend process details
ps aux | grep tsx | grep -v grep

# Port usage
sudo netstat -tlnp | grep 3000

# Disk space
df -h /root/tradebaas /var/www/tradebaas
```

## 🔄 State Persistence

### Backend State File

**Location:** `/root/tradebaas/backend-state.json`

Contains:
- Active strategy ID
- Current status
- Strategy configuration
- Last checkpoint time

```json
{
  "activeStrategy": {
    "id": "strategy-1762180359724",
    "name": "Razor",
    "status": "analyzing",
    "startTime": 1730642359724,
    "config": {
      "instrument": "BTC_USDC-PERPETUAL",
      "riskMode": "percent",
      "riskValue": 5,
      "stopLossPercent": 0.5,
      "takeProfitPercent": 1.0
    }
  }
}
```

**⚠️ Important:** This file ensures strategies auto-resume after backend restarts.

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check systemd service
sudo systemctl status tradebaas-backend

# View full logs
sudo journalctl -u tradebaas-backend -n 100

# Check for port conflicts
sudo netstat -tlnp | grep 3000

# Kill conflicting process
sudo pkill -f tsx

# Restart service
sudo systemctl restart tradebaas-backend
```

### Frontend 502 Bad Gateway

```bash
# Check backend is running
curl http://127.0.0.1:3000/health

# Check Nginx proxy config
sudo nginx -t

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### Strategy Not Trading

```bash
# Check strategy status
curl http://127.0.0.1:3000/api/strategy/status | jq .

# Check analysis state
curl http://127.0.0.1:3000/api/strategy/analysis/[ID] | jq '.analysis.checkpoints'

# Watch live logs
sudo journalctl -u tradebaas-backend -f | grep Razor

# Verify WebSocket connection
sudo journalctl -u tradebaas-backend -f | grep -E "(WebSocket|Ticker|subscription)"
```

### Empty JSON Errors (Frontend)

These are **expected and handled gracefully**:
- Backend restarting
- Temporary network hiccups
- Race conditions during state transitions

**Frontend behavior:**
- 5-second fetch timeout
- Text validation before JSON parsing
- Silent error logging
- Maintains last valid state

## 📈 Performance Metrics

### Current Production Stats

**Backend:**
- Startup time: <2 seconds (includes 100 candle load)
- Memory usage: ~60 MB
- CPU usage: <5% idle, <20% active
- WebSocket latency: <100ms
- Candle processing: ~1 second for 100 candles

**Frontend:**
- Bundle size: 703 KB (197 KB gzipped)
- First Contentful Paint: <1 second
- Time to Interactive: <2 seconds
- API polling: 3-second intervals
- Memory usage: ~40 MB

**Strategy Performance:**
- Historical data load: <1 second
- Indicator calculation: <100ms
- Checkpoint evaluation: <50ms
- Trade execution: <500ms

## 🔐 Security Checklist

- [x] API credentials stored in systemd environment (not in code)
- [x] Backend listens on 127.0.0.1 only (not public)
- [x] Nginx reverse proxy with SSL termination
- [x] CORS properly configured
- [x] Rate limiting on API endpoints
- [x] No sensitive data in frontend build
- [x] State file readable only by backend user
- [x] Git repository excludes credentials

## 📋 Maintenance Tasks

### Daily

```bash
# Check backend health
curl http://127.0.0.1:3000/health

# Review logs for errors
sudo journalctl -u tradebaas-backend --since today | grep -i error

# Monitor disk space
df -h
```

### Weekly

```bash
# Backup state file
cp /root/tradebaas/backend-state.json ~/backups/backend-state-$(date +%Y%m%d).json

# Review system resources
top -b -n 1 | grep tsx

# Check for updates
cd /root/tradebaas && git pull
```

### Monthly

```bash
# Rotate logs
sudo journalctl --vacuum-time=30d

# Update dependencies
cd /root/tradebaas && npm update
cd /root/tradebaas/backend && npm update

# Full system backup (see below)
```

## 💾 Backup & Recovery

### Create Complete Backup

```bash
# Navigate to parent directory
cd /root

# Create compressed backup
tar -czf tradebaas-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='*.log' \
  tradebaas

# Verify backup
tar -tzf tradebaas-backup-*.tar.gz | head

# Generate checksum
sha256sum tradebaas-backup-*.tar.gz > tradebaas-backup-*.tar.gz.sha256

# Copy to safe location
cp tradebaas-backup-*.tar.gz /var/www/tradebaas/
```

**Latest backup:** tradebaas-backup-20251103-150241.tar.gz (421 KB, 285 files)

### Restore from Backup

```bash
# Stop services
sudo systemctl stop tradebaas-backend

# Extract backup
cd /root
tar -xzf tradebaas-backup-YYYYMMDD-HHMMSS.tar.gz

# Restore dependencies
cd /root/tradebaas
npm install
cd backend && npm install && cd ..

# Rebuild frontend
npm run build
sudo cp -r dist/* /var/www/tradebaas/

# Restart services
sudo systemctl start tradebaas-backend
sudo systemctl reload nginx

# Verify
curl http://127.0.0.1:3000/health
```

## 🔗 URLs & Endpoints

**Production:**
- Frontend: https://app.tradebazen.nl
- Backend API: https://app.tradebazen.nl/api/*
- Health: https://app.tradebazen.nl/api/health (proxied)

**Internal (server):**
- Backend: http://127.0.0.1:3000
- Strategy Status: http://127.0.0.1:3000/api/strategy/status
- Analysis: http://127.0.0.1:3000/api/strategy/analysis/:id

## 📞 Emergency Procedures

### Kill Switch (Stop All Trading)

```bash
# Via API
curl -X POST http://127.0.0.1:3000/api/killswitch

# Or stop service
sudo systemctl stop tradebaas-backend
```

### Force Stop Strategy

```bash
# Stop via API
curl -X POST http://127.0.0.1:3000/api/strategy/stop

# Or restart backend
sudo systemctl restart tradebaas-backend
```

### Complete System Reset

```bash
# Stop all services
sudo systemctl stop tradebaas-backend

# Clear state (⚠️ loses active strategy)
rm /root/tradebaas/backend-state.json

# Restart
sudo systemctl start tradebaas-backend
```

---

**Version:** 1.0.0 Production  
**Last Updated:** November 3, 2025  
**Status:** ✅ Live & Running  
**Next Review:** Weekly (Monday mornings)

For technical details, see: `README.md`, `TECHNICAL_DOCS.md`, `RISK_ENGINE.md`
