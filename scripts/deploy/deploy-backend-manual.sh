#!/bin/bash

# ============================================================================
# Tradebaas Backend Manual Deployment Guide
# Voor deployment ZONDER SSH key (met wachtwoord)
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}📦 Tradebaas Backend Manual Deployment${NC}"
echo -e "${BLUE}============================================================================${NC}"

# Configuration
SERVER_IP="YOUR_SERVER_IP"
LOCAL_BACKEND="/root/Tradebaas/backend"

# Step 1: Build backend
echo -e "\n${YELLOW}📦 Step 1/4: Building backend locally...${NC}"
cd "$LOCAL_BACKEND"

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} Found package.json"
    
    # Build TypeScript
    echo -e "${YELLOW}Building TypeScript...${NC}"
    npm run build
    echo -e "${GREEN}✓${NC} Backend built successfully"
else
    echo -e "${RED}✗${NC} package.json not found"
    exit 1
fi

# Step 2: Create deployment package
echo -e "\n${YELLOW}📂 Step 2/4: Creating deployment package...${NC}"
cd /root/Tradebaas

# Create deployment directory
DEPLOY_DIR="/tmp/tradebaas-deploy-$(date +%s)"
mkdir -p "$DEPLOY_DIR/backend"

echo -e "${BLUE}Package directory: $DEPLOY_DIR${NC}"

# Copy files
cp -r backend/src "$DEPLOY_DIR/backend/"
cp -r backend/dist "$DEPLOY_DIR/backend/" 2>/dev/null || echo "No dist folder (will use src)"
cp backend/package.json "$DEPLOY_DIR/backend/"
cp backend/package-lock.json "$DEPLOY_DIR/backend/" 2>/dev/null || true
cp backend/.env.production "$DEPLOY_DIR/backend/.env"  # Use production env!

# Copy state if exists
if [ -d "state" ]; then
    cp -r state "$DEPLOY_DIR/"
    echo -e "${GREEN}✓${NC} Copied database (state/trades.db)"
fi

echo -e "${GREEN}✓${NC} Deployment package created"

# Step 3: Create deployment tarball
echo -e "\n${YELLOW}📦 Step 3/4: Creating deployment archive...${NC}"
cd "$DEPLOY_DIR"
tar -czf "/root/Tradebaas/backend-deploy.tar.gz" .

echo -e "${GREEN}✓${NC} Created: /root/Tradebaas/backend-deploy.tar.gz"
echo -e "${BLUE}Size: $(ls -lh /root/Tradebaas/backend-deploy.tar.gz | awk '{print $5}')${NC}"

# Cleanup temp directory
rm -rf "$DEPLOY_DIR"

# Step 4: Manual instructions
echo -e "\n${BLUE}============================================================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT PACKAGE READY!${NC}"
echo -e "${BLUE}============================================================================${NC}"

echo -e "\n${YELLOW}📋 MANUAL DEPLOYMENT STEPS:${NC}\n"

echo -e "${BLUE}1. Upload package to server:${NC}"
echo -e "   ${GREEN}scp /root/Tradebaas/backend-deploy.tar.gz root@$SERVER_IP:/root/${NC}"
echo -e "   (Enter your server password when prompted)\n"

echo -e "${BLUE}2. SSH into server:${NC}"
echo -e "   ${GREEN}ssh root@$SERVER_IP${NC}\n"

echo -e "${BLUE}3. On the server, run these commands:${NC}"
cat << 'SERVERCOMMANDS'
   
   # Create backend directory
   mkdir -p /root/tradebaas-backend
   
   # Extract deployment
   cd /root/tradebaas-backend
   tar -xzf /root/backend-deploy.tar.gz
   
   # Install dependencies
   cd backend
   npm install --production
   
   # Install PM2 if needed
   npm install -g pm2 tsx
   
   # Stop old backend
   pm2 stop tradebaas-backend 2>/dev/null || true
   pm2 delete tradebaas-backend 2>/dev/null || true
   
   # Start backend
   pm2 start src/server.ts \
       --name tradebaas-backend \
       --interpreter tsx \
       --watch false \
       --max-memory-restart 500M
   
   # Save PM2 config
   pm2 save
   pm2 startup systemd -u root --hp /root
   
   # Check status
   pm2 status
   pm2 logs tradebaas-backend --lines 20
   
SERVERCOMMANDS

echo -e "\n${BLUE}4. Verify backend is running:${NC}"
echo -e "   ${GREEN}curl http://127.0.0.1:3000/health${NC}\n"

echo -e "${BLUE}5. Open firewall port (if needed):${NC}"
echo -e "   ${GREEN}sudo ufw allow 3000/tcp${NC}\n"

echo -e "${BLUE}6. Test from your local machine:${NC}"
echo -e "   ${GREEN}curl http://$SERVER_IP:3000/health${NC}\n"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${YELLOW}⚡ QUICK COPY-PASTE:${NC}\n"
echo -e "${GREEN}# Upload:${NC}"
echo -e "scp /root/Tradebaas/backend-deploy.tar.gz root@$SERVER_IP:/root/\n"
echo -e "${GREEN}# Then on server:${NC}"
echo -e "mkdir -p /root/tradebaas-backend && cd /root/tradebaas-backend && tar -xzf /root/backend-deploy.tar.gz && cd backend && npm install --production && pm2 start src/server.ts --name tradebaas-backend --interpreter tsx && pm2 save\n"
echo -e "${BLUE}============================================================================${NC}"
