# 🚀 24/7 Deployment Guide - Backend naar Ubuntu Server

**Datum:** 17 november 2025  
**Doel:** Backend naar YOUR_SERVER_IP deployen voor 24/7 trading  
**Huidige status:** Backend draait lokaal, moet naar server  

---

## 📋 Overzicht

### **Huidige Situatie:**
- ✅ Frontend draait op `YOUR_SERVER_IP:5000` (24/7)
- ❌ Backend draait op `localhost:5000` (alleen als laptop aan is)
- ❌ Frontend kan niet met backend praten als laptop uit is

### **Gewenste Situatie:**
- ✅ Frontend op `YOUR_SERVER_IP:5000` (24/7)
- ✅ Backend op `YOUR_SERVER_IP:3000` (24/7)
- ✅ Frontend praat met `http://YOUR_SERVER_IP:3000`
- ✅ Laptop kan uit = trading blijft doorgaan!

---

## 🎯 Deployment in 3 Stappen

### **Stap 1: Backend Deployen**

```bash
cd /root/Tradebaas
./deploy-backend.sh
```

**Dit script doet:**
1. ✅ Backend builden (TypeScript → JavaScript)
2. ✅ Deployment package maken (dist + src + .env)
3. ✅ SSH connectie checken
4. ✅ Files uploaden via rsync
5. ✅ Dependencies installeren op server
6. ✅ PM2 starten met auto-restart

**Verwachte output:**
```
============================================================================
🚀 Tradebaas Backend Deployment
============================================================================

📦 Step 1/6: Building backend locally...
✓ Backend built successfully

📂 Step 2/6: Creating deployment package...
✓ Deployment package created

🔌 Step 3/6: Checking server connectivity...
✓ Server is reachable

📤 Step 4/6: Uploading to server...
✓ Files uploaded successfully

📥 Step 5/6: Installing dependencies on server...
✓ Server dependencies ready

🚀 Step 6/6: Starting backend with PM2...
✓ Backend started

============================================================================
✅ DEPLOYMENT COMPLETE!
============================================================================

Backend is now running 24/7 on:
  http://YOUR_SERVER_IP:3000
```

---

### **Stap 2: Frontend Environment Updaten**

```bash
cd /root/Tradebaas
./update-frontend-env.sh
```

**Dit script doet:**
1. ✅ Backup maken van huidige `.env`
2. ✅ `VITE_API_URL=http://YOUR_SERVER_IP:3000` toevoegen
3. ✅ Frontend configuratie updaten

**Je `.env` wordt:**
```env
# Backend API URL (Production)
VITE_API_URL=http://YOUR_SERVER_IP:3000

# Deribit API Credentials
DERIBIT_API_KEY=REDACTED_API_KEY
DERIBIT_API_SECRET=REDACTED_API_SECRET
```

---

### **Stap 3: Frontend Rebuilden & Deployen**

**Optie A: Development (lokaal testen)**
```bash
# Frontend zal nu praten met YOUR_SERVER_IP:3000
npm run dev
```

**Optie B: Production (naar server)**
```bash
# Build frontend
npm run build

# Upload naar server (pas aan met jouw setup)
scp -r dist/* root@YOUR_SERVER_IP:/var/www/tradebaas/

# Of via rsync
rsync -avz dist/ root@YOUR_SERVER_IP:/var/www/tradebaas/
```

---

## 🔧 Server Configuratie (Belangrijk!)

### **1. Firewall - Backend Poort Openen**

```bash
# SSH naar server
ssh root@YOUR_SERVER_IP

# Check firewall status
sudo ufw status

# Open backend poort (3000)
sudo ufw allow 3000/tcp

# Verify
sudo ufw status
```

**Verwacht:**
```
Status: active

To                         Action      From
--                         ------      ----
5000/tcp                   ALLOW       Anywhere
3000/tcp                   ALLOW       Anywhere  ← Nieuw!
```

---

### **2. Backend .env Check (op server)**

```bash
ssh root@YOUR_SERVER_IP

# Check backend environment
cat /root/tradebaas-backend/backend/.env
```

**Kritieke settings:**
```env
NODE_ENV=production
HOST=0.0.0.0           ← BELANGRIJK! (niet 127.0.0.1)
PORT=3000
FRONTEND_URL=http://YOUR_SERVER_IP:5000  ← CORS!
```

**Waarom `HOST=0.0.0.0`?**
- `127.0.0.1` = alleen localhost (server kan niet van buiten bereikt worden)
- `0.0.0.0` = luister op ALLE network interfaces (publiek bereikbaar)

---

### **3. PM2 Status Check**

```bash
ssh root@YOUR_SERVER_IP

# Check PM2 status
pm2 status

# Live logs
pm2 logs tradebaas-backend --lines 50

# Monitoring dashboard
pm2 monit
```

**Verwacht:**
```
┌─────┬──────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                 │ mode    │ status  │ cpu      │
├─────┼──────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ tradebaas-backend    │ fork    │ online  │ 0%       │
└─────┴──────────────────────┴─────────┴─────────┴──────────┘
```

---

## ✅ Validatie Checklist

### **Backend Online Check**

```bash
# Vanaf je lokale machine
curl http://YOUR_SERVER_IP:3000/health

# Verwacht:
{
  "status": "healthy",
  "uptime": 123.45,
  "timestamp": "2025-11-17T12:00:00.000Z"
}
```

### **CORS Check**

```bash
# Test CORS headers
curl -I http://YOUR_SERVER_IP:3000/health

# Verwacht (bevat):
Access-Control-Allow-Origin: http://YOUR_SERVER_IP:5000
```

### **Strategy Check**

```bash
# Via backend API
curl http://YOUR_SERVER_IP:3000/api/strategy/status

# Of SSH + PM2 logs
ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend | grep -i razor'
```

### **Database Check**

```bash
ssh root@YOUR_SERVER_IP

# Check database exists
ls -lh /root/tradebaas-backend/state/trades.db

# Query trades
sqlite3 /root/tradebaas-backend/state/trades.db "SELECT COUNT(*) FROM trades;"
```

---

## 🚨 Troubleshooting

### **Probleem: Backend niet bereikbaar**

**Check 1: Is backend online?**
```bash
ssh root@YOUR_SERVER_IP 'pm2 status'
```

**Check 2: Draait het op juiste poort?**
```bash
ssh root@YOUR_SERVER_IP 'netstat -tulpn | grep :3000'
# Verwacht: node proces luistert op 0.0.0.0:3000
```

**Check 3: Firewall geblokkeerd?**
```bash
ssh root@YOUR_SERVER_IP 'sudo ufw status | grep 3000'
```

**Fix:**
```bash
# Firewall openen
ssh root@YOUR_SERVER_IP 'sudo ufw allow 3000/tcp'

# Backend restart
ssh root@YOUR_SERVER_IP 'pm2 restart tradebaas-backend'
```

---

### **Probleem: CORS Error in Frontend**

**Symptoom:**
```
Access to XMLHttpRequest at 'http://YOUR_SERVER_IP:3000/api/...' 
from origin 'http://YOUR_SERVER_IP:5000' has been blocked by CORS policy
```

**Fix:**
```bash
ssh root@YOUR_SERVER_IP

# Edit .env
nano /root/tradebaas-backend/backend/.env

# Update FRONTEND_URL
FRONTEND_URL=http://YOUR_SERVER_IP:5000,http://localhost:5173

# Restart backend
pm2 restart tradebaas-backend
```

---

### **Probleem: Database niet gevonden**

**Symptoom:**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Fix:**
```bash
ssh root@YOUR_SERVER_IP

# Create state directory
mkdir -p /root/tradebaas-backend/state

# Copy database from local (indien nodig)
# Op lokale machine:
scp /root/Tradebaas/state/trades.db root@YOUR_SERVER_IP:/root/tradebaas-backend/state/

# Restart backend
ssh root@YOUR_SERVER_IP 'pm2 restart tradebaas-backend'
```

---

### **Probleem: PM2 niet installed**

**Fix:**
```bash
ssh root@YOUR_SERVER_IP

# Install PM2 globally
npm install -g pm2

# Start backend
cd /root/tradebaas-backend/backend
pm2 start src/server.ts --name tradebaas-backend --interpreter tsx

# Save config
pm2 save

# Auto-start on reboot
pm2 startup systemd
```

---

## 🔄 Updates Deployen (Na Wijzigingen)

**Als je code wijzigt:**

```bash
# Lokaal - redeploy backend
cd /root/Tradebaas
./deploy-backend.sh

# Het script doet automatisch:
# - Build
# - Upload
# - npm install
# - PM2 restart
```

**Als je alleen .env wijzigt:**

```bash
# Manual sync
scp /root/Tradebaas/backend/.env root@YOUR_SERVER_IP:/root/tradebaas-backend/backend/

# Restart
ssh root@YOUR_SERVER_IP 'pm2 restart tradebaas-backend'
```

---

## 📊 Monitoring & Logs

### **Live Logs Bekijken**

```bash
# Real-time logs
ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend --lines 100'

# Filter op strategie
ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend | grep -i razor'

# Filter op errors
ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend --err'
```

### **PM2 Monitoring Dashboard**

```bash
ssh root@YOUR_SERVER_IP
pm2 monit
```

**Je ziet:**
- CPU usage
- Memory usage
- Log output (real-time)
- Custom metrics

### **Health Check Automation**

**Optie: Cron job voor health monitoring**

```bash
ssh root@YOUR_SERVER_IP

# Add to crontab
crontab -e

# Add this line (check elke 5 minuten)
*/5 * * * * curl -s http://127.0.0.1:3000/health || pm2 restart tradebaas-backend
```

---

## 🎯 Volledige 24/7 Setup Checklist

- [ ] **Backend deployed** (`./deploy-backend.sh` success)
- [ ] **PM2 running** (`pm2 status` toont online)
- [ ] **Firewall open** (poort 3000 toegankelijk)
- [ ] **Health check OK** (`curl http://YOUR_SERVER_IP:3000/health`)
- [ ] **Frontend .env updated** (`VITE_API_URL=http://YOUR_SERVER_IP:3000`)
- [ ] **CORS configured** (FRONTEND_URL in backend .env)
- [ ] **Database copied** (state/trades.db op server)
- [ ] **Strategy running** (logs tonen Razor activity)
- [ ] **PM2 auto-start** (`pm2 startup` configured)
- [ ] **Monitoring setup** (PM2 dashboard, optional Telegram)

---

## 🚀 Final Test

**Complete flow test:**

1. **Open frontend** → `http://YOUR_SERVER_IP:5000`
2. **Start strategie** → Razor strategy
3. **Check logs** → `ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend'`
4. **Sluit laptop** → Backend blijft draaien!
5. **Open laptop na 1 uur** → Check trades in metrics page
6. **Verify 24/7** → Backend heeft door blijven handelen

**Als dit werkt:**
✅ **JE BENT KLAAR! Backend draait nu 24/7!** 🎉

---

## 📞 Quick Reference Commands

```bash
# Deploy backend
./deploy-backend.sh

# Update frontend environment
./update-frontend-env.sh

# SSH naar server
ssh root@YOUR_SERVER_IP

# Check backend status
ssh root@YOUR_SERVER_IP 'pm2 status'

# View logs
ssh root@YOUR_SERVER_IP 'pm2 logs tradebaas-backend'

# Restart backend
ssh root@YOUR_SERVER_IP 'pm2 restart tradebaas-backend'

# Health check
curl http://YOUR_SERVER_IP:3000/health

# Check open ports
ssh root@YOUR_SERVER_IP 'sudo netstat -tulpn | grep -E ":(3000|5000)"'

# Firewall status
ssh root@YOUR_SERVER_IP 'sudo ufw status'
```

---

**🎯 Nu kun je beginnen! Run `./deploy-backend.sh` om te starten!**
