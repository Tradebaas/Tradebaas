#!/bin/bash

# ============================================================================
# Tradebaas Backend Deployment Script
# Deploy backend to Ubuntu server (YOUR_SERVER_IP) for 24/7 trading
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="YOUR_SERVER_IP"
SERVER_USER="root"  # Change if using different user
REMOTE_DIR="/root/tradebaas-backend"
LOCAL_BACKEND_DIR="/root/Tradebaas/backend"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}🚀 Tradebaas Backend Deployment${NC}"
echo -e "${BLUE}============================================================================${NC}"

# Step 1: Build backend locally
echo -e "\n${YELLOW}📦 Step 1/6: Building backend locally...${NC}"
cd "$LOCAL_BACKEND_DIR"

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} Found package.json"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm install
    fi
    
    # Build TypeScript
    echo -e "${YELLOW}Building TypeScript...${NC}"
    npm run build
    echo -e "${GREEN}✓${NC} Backend built successfully"
else
    echo -e "${RED}✗${NC} package.json not found in $LOCAL_BACKEND_DIR"
    exit 1
fi

# Step 2: Create deployment package
echo -e "\n${YELLOW}📂 Step 2/6: Creating deployment package...${NC}"
cd /root/Tradebaas

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo -e "${BLUE}Temp directory: $TEMP_DIR${NC}"

# Copy necessary files
mkdir -p "$TEMP_DIR/backend"
cp -r backend/dist "$TEMP_DIR/backend/" 2>/dev/null || echo "No dist folder (using src directly)"
cp -r backend/src "$TEMP_DIR/backend/"
cp backend/package.json "$TEMP_DIR/backend/"
cp backend/package-lock.json "$TEMP_DIR/backend/" 2>/dev/null || true
cp backend/.env "$TEMP_DIR/backend/"

# Copy state directory if exists
if [ -d "state" ]; then
    cp -r state "$TEMP_DIR/"
    echo -e "${GREEN}✓${NC} Copied state directory (trade history)"
fi

echo -e "${GREEN}✓${NC} Deployment package created"

# Step 3: Check server connectivity
echo -e "\n${YELLOW}🔌 Step 3/6: Checking server connectivity...${NC}"
if ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER_IP" "echo 'Connected'" &>/dev/null; then
    echo -e "${GREEN}✓${NC} Server is reachable"
else
    echo -e "${RED}✗${NC} Cannot connect to server at $SERVER_IP"
    echo -e "${YELLOW}Please check:${NC}"
    echo -e "  1. Server IP is correct"
    echo -e "  2. SSH key is set up (run: ssh-copy-id $SERVER_USER@$SERVER_IP)"
    echo -e "  3. Server is online"
    exit 1
fi

# Step 4: Upload to server
echo -e "\n${YELLOW}📤 Step 4/6: Uploading to server...${NC}"
echo -e "${BLUE}Uploading to $SERVER_USER@$SERVER_IP:$REMOTE_DIR${NC}"

# Create remote directory
ssh "$SERVER_USER@$SERVER_IP" "mkdir -p $REMOTE_DIR"

# Sync files (excluding node_modules)
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    "$TEMP_DIR/" "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/"

echo -e "${GREEN}✓${NC} Files uploaded successfully"

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Step 5: Install dependencies on server
echo -e "\n${YELLOW}📥 Step 5/6: Installing dependencies on server...${NC}"
ssh "$SERVER_USER@$SERVER_IP" << 'ENDSSH'
cd /root/tradebaas-backend/backend

# Check Node.js version
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install production dependencies
echo "Installing dependencies..."
npm install --production

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found, installing..."
    npm install -g pm2
fi

echo "✓ Dependencies installed"
ENDSSH

echo -e "${GREEN}✓${NC} Server dependencies ready"

# Step 6: Start/Restart backend with PM2
echo -e "\n${YELLOW}🚀 Step 6/6: Starting backend with PM2...${NC}"
ssh "$SERVER_USER@$SERVER_IP" << 'ENDSSH'
cd /root/tradebaas-backend/backend

# Stop existing process
pm2 stop tradebaas-backend 2>/dev/null || echo "No existing process found"
pm2 delete tradebaas-backend 2>/dev/null || true

# Start new process
pm2 start src/server.ts \
    --name tradebaas-backend \
    --interpreter tsx \
    --watch false \
    --max-memory-restart 500M \
    --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
    --merge-logs

# Save PM2 config
pm2 save

# Setup auto-start on reboot
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Show status
pm2 status
pm2 logs tradebaas-backend --lines 20

ENDSSH

echo -e "\n${BLUE}============================================================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "\n${GREEN}Backend is now running 24/7 on:${NC}"
echo -e "  ${BLUE}http://$SERVER_IP:3000${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  1. Update frontend .env: ${BLUE}VITE_API_URL=http://$SERVER_IP:3000${NC}"
echo -e "  2. Test health: ${BLUE}curl http://$SERVER_IP:3000/health${NC}"
echo -e "  3. Monitor logs: ${BLUE}ssh $SERVER_USER@$SERVER_IP 'pm2 logs tradebaas-backend'${NC}"
echo -e "\n${YELLOW}Useful PM2 commands (on server):${NC}"
echo -e "  pm2 status              - Show all processes"
echo -e "  pm2 logs tradebaas-backend - View logs"
echo -e "  pm2 restart tradebaas-backend - Restart backend"
echo -e "  pm2 monit               - Live monitoring"
echo -e "${BLUE}============================================================================${NC}"
