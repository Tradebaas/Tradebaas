# 🚀 Tradebaas Installation & Deployment Guide

Complete guide for installing and deploying Tradebaas on your own server for 24/7 automated trading.

---

## ⚠️ SECURITY WARNING

**NEVER commit sensitive information to Git!**

The following files are git-ignored and must be configured locally:
- `.env` and `.env.production` (API keys, secrets)
- `ecosystem.config.cjs` (server-specific paths)
- `state/trades.db*` (trading database)
- `backend/data/*` (runtime data)

---

## 📋 Prerequisites

### Required Software
```bash
# Node.js 18+ and npm
node --version  # Should be v18.0.0 or higher
npm --version

# PM2 for process management
npm install -g pm2

# (Optional) Caddy for reverse proxy with automatic SSL
# See: https://caddyserver.com/docs/install
```

### Server Requirements
- **OS:** Ubuntu 20.04+ or similar Linux distribution
- **RAM:** Minimum 2GB (4GB recommended)
- **Storage:** 10GB+ free space
- **Network:** Stable internet connection for 24/7 trading
- **Domain:** (Optional) For HTTPS production deployment

---

## 🔧 Step 1: Clone & Install

```bash
# Clone the repository
git clone https://github.com/Tradebaas/Tradebaas.git
cd Tradebaas

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

---

## 🔐 Step 2: Configure Environment Variables

### Backend Configuration

Create `backend/.env` file:

```bash
cd backend
cp .env.example .env
nano .env  # Or use your preferred editor
```

**Required variables:**

```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# CORS Configuration
# Add your frontend URL(s) here
FRONTEND_URL=http://localhost:5173,http://localhost:5000,https://yourdomain.com

# Database
DATABASE_PATH=./data/trades.db

# Deribit API (TESTNET for testing, LIVE for production)
DERIBIT_ENVIRONMENT=testnet  # Change to 'live' for production trading

# Telegram Notifications (Optional)
TELEGRAM_ENABLED=false
# Get bot token from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
# Get chat ID by messaging your bot and checking updates
TELEGRAM_CHAT_ID=your_chat_id_here

# Logging
LOG_LEVEL=info  # Options: error, warn, info, debug
```

**⚠️ IMPORTANT:** Never commit `.env` files to Git! They are already in `.gitignore`.

### Frontend Configuration

Create `.env.production` in root directory:

```bash
# Return to root directory
cd ..
cp .env.example .env.production
nano .env.production
```

**Content:**

```env
# Backend API URL
# Development: http://localhost:3000
# Production with reverse proxy: Leave empty (uses same origin)
# Production without proxy: http://YOUR_SERVER_IP:3000
VITE_BACKEND_URL=
```

**URL Configuration:**
- **Same server (with Caddy/Nginx):** Leave empty → uses `window.location.origin`
- **Different server:** Set to `http://YOUR_BACKEND_IP:3000`
- **Development:** Uses `http://localhost:3000` automatically

---

## 🔑 Step 3: Deribit API Credentials

### Get Your API Keys

1. **Testnet (for testing):**
   - Go to: https://test.deribit.com/
   - Register account
   - Navigate to: Account → API → Create new key
   - **Permissions needed:** Trading, Account info, Wallet operations
   - Save your `Client ID` and `Client Secret`

2. **Live (for real trading):**
   - Go to: https://www.deribit.com/
   - Complete KYC verification
   - Navigate to: Account → API → Create new key
   - **Permissions:** Same as testnet
   - ⚠️ **WARNING:** Real money! Start with small amounts!

### Configure in Application

API credentials are **NOT stored in files**. You configure them via the web interface:

1. Start the application (see Step 4)
2. Open web interface
3. Click "Settings" → "Broker Settings"
4. Enter your Deribit credentials
5. Click "Save" → Credentials stored securely in backend

---

## 🏗️ Step 4: Build & Run

### Development Mode (Local Testing)

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend (new terminal)
npm run dev

# Open http://localhost:5173
```

### Production Mode

#### Option A: PM2 Process Manager (Recommended for 24/7)

Create `ecosystem.config.cjs` in root directory:

```javascript
module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      script: 'npm',
      args: 'start',
      cwd: '/absolute/path/to/Tradebaas/backend',  // CHANGE THIS!
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'tradebaas-frontend',
      script: 'npx',
      args: 'serve -s dist -l 5000',
      cwd: '/absolute/path/to/Tradebaas',  // CHANGE THIS!
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
    },
  ],
};
```

**Deploy:**

```bash
# Build frontend
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs

# Enable auto-restart on server reboot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs
```

#### Option B: Manual Run

```bash
# Backend
cd backend
npm start &

# Frontend (build first)
cd ..
npm run build
npx serve -s dist -l 5000
```

---

## 🌐 Step 5: Domain & SSL (Production)

### Option A: Caddy (Recommended - Automatic SSL)

Install Caddy:
```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Configure Caddy (`/etc/caddy/Caddyfile`):

```caddyfile
# Replace with your domain
yourdomain.com {
    # Frontend
    handle / {
        reverse_proxy localhost:5000
    }

    # Backend API
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # WebSocket support
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websockets localhost:5000
}
```

**Apply configuration:**

```bash
sudo systemctl reload caddy
sudo systemctl enable caddy  # Auto-start on boot
```

### Option B: Nginx

Configuration example (`/etc/nginx/sites-available/tradebaas`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and get SSL with Let's Encrypt:

```bash
sudo ln -s /etc/nginx/sites-available/tradebaas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com
```

### DNS Configuration

Point your domain to your server:

```
Type: A
Name: @ (or subdomain like 'app')
Value: YOUR_SERVER_IP
TTL: 300 (5 minutes)
```

**Update vite.config.ts** with your domain:

```typescript
allowedHosts: ['yourdomain.com', 'localhost', '127.0.0.1'],
hmr: {
  host: 'yourdomain.com',
  // ...
}
```

---

## 🧪 Step 6: Verify Installation

### Backend Health Check

```bash
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","uptime":123.45}
```

### Frontend Access

Open in browser:
- **Development:** http://localhost:5173
- **Production (local):** http://localhost:5000
- **Production (domain):** https://yourdomain.com

### Test Strategy

1. Open web interface
2. Go to Settings → Configure Deribit credentials (testnet)
3. Go to Strategies page
4. Enable "Razor" strategy
5. Monitor Trade History for signals

---

## 📊 Monitoring & Maintenance

### PM2 Commands

```bash
# Status
pm2 status

# Logs (real-time)
pm2 logs

# Restart services
pm2 restart tradebaas-backend
pm2 restart tradebaas-frontend

# Stop services
pm2 stop all

# Remove from PM2
pm2 delete all
```

### Database Backup

```bash
# Backup trades database
cp backend/data/trades.db backend/data/trades.db.backup-$(date +%Y%m%d)

# Automated daily backup (add to crontab)
0 0 * * * cp /path/to/Tradebaas/backend/data/trades.db /path/to/backups/trades-$(date +\%Y\%m\%d).db
```

### Log Rotation

PM2 handles log rotation automatically. Configure in `ecosystem.config.cjs`:

```javascript
log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
error_file: './logs/backend-error.log',
out_file: './logs/backend-out.log',
```

---

## 🔒 Security Best Practices

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS

# If NOT using reverse proxy, allow backend port
sudo ufw allow 3000/tcp
```

### 2. API Key Security

- ✅ **DO:** Store keys in `.env` files (git-ignored)
- ✅ **DO:** Use testnet for development
- ✅ **DO:** Set API key permissions to minimum required
- ❌ **DON'T:** Commit API keys to Git
- ❌ **DON'T:** Share API keys publicly
- ❌ **DON'T:** Use production keys in development

### 3. Server Hardening

```bash
# Keep system updated
sudo apt update && sudo apt upgrade -y

# Install fail2ban (SSH protection)
sudo apt install fail2ban

# Disable root SSH login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd
```

---

## 🐛 Troubleshooting

### Backend won't start

```bash
# Check if port 3000 is already in use
sudo lsof -i :3000

# Kill existing process
sudo kill -9 $(sudo lsof -t -i:3000)

# Check backend logs
pm2 logs tradebaas-backend
# Or manual:
cd backend
npm start
```

### Frontend can't connect to backend

1. **Check backend is running:**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **CORS errors:** Update `backend/.env`:
   ```env
   FRONTEND_URL=http://your-frontend-url:5000
   ```

3. **Mixed content (HTTPS → HTTP):** Use reverse proxy (Caddy/Nginx)

### Deribit Connection Fails

1. **Check credentials:** Settings → Broker Settings
2. **Environment mismatch:** Testnet keys don't work on live (and vice versa)
3. **API permissions:** Ensure Trading + Account info enabled
4. **Rate limits:** Deribit has rate limits, wait 60 seconds and retry

### PM2 Process Crashes

```bash
# View crash logs
pm2 logs tradebaas-backend --err

# Check memory usage
pm2 status

# Increase memory limit in ecosystem.config.cjs
max_memory_restart: '1G'  # Default is 500M
```

---

## 📚 Additional Resources

### Documentation

- `DOCS/BACKEND_URL_CONFIG.md` - Backend URL architecture
- `DOCS/RAZOR_STRATEGY_ANALYSIS.md` - Strategy analysis & optimization
- `DOCS/deployment/` - Deployment guides
- `README.md` - Project overview

### Community & Support

- GitHub Issues: https://github.com/Tradebaas/Tradebaas/issues
- Deribit API Docs: https://docs.deribit.com/
- PM2 Documentation: https://pm2.keymetrics.io/docs/

---

## 🚨 Risk Disclaimer

**Cryptocurrency trading involves substantial risk of loss.**

- Start with **testnet** to learn the system
- Use **small amounts** when going live
- Never invest more than you can afford to lose
- This software is provided **AS-IS** with no guarantees
- **You are responsible** for your trading decisions
- Monitor your positions actively, especially initially

---

## ✅ Quick Start Checklist

- [ ] Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Repository cloned
- [ ] Dependencies installed (frontend + backend)
- [ ] `backend/.env` configured
- [ ] `.env.production` created (if needed)
- [ ] `ecosystem.config.cjs` paths updated
- [ ] Deribit API keys obtained (testnet)
- [ ] Frontend built (`npm run build`)
- [ ] PM2 started (`pm2 start ecosystem.config.cjs`)
- [ ] PM2 auto-startup enabled (`pm2 startup; pm2 save`)
- [ ] Firewall configured
- [ ] (Optional) Domain DNS configured
- [ ] (Optional) Reverse proxy (Caddy/Nginx) configured
- [ ] Web interface accessible
- [ ] Deribit credentials saved via Settings
- [ ] Test strategy enabled and running
- [ ] Monitoring setup (PM2 logs, Telegram)

---

**Happy Trading! 🚀📈**

*Remember: Test thoroughly on testnet before using real money!*
