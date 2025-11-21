#!/bin/bash

# ============================================================================
# Update Frontend Environment for Production Backend
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}🔧 Frontend Environment Update${NC}"
echo -e "${BLUE}============================================================================${NC}"

# Configuration
SERVER_IP="YOUR_SERVER_IP"
BACKEND_PORT="3000"
FRONTEND_DIR="/root/Tradebaas"

echo -e "\n${YELLOW}Updating frontend to use production backend...${NC}"
echo -e "${BLUE}Backend URL: http://$SERVER_IP:$BACKEND_PORT${NC}"

# Check if .env exists
if [ ! -f "$FRONTEND_DIR/.env" ]; then
    echo -e "${YELLOW}Creating new .env file...${NC}"
    touch "$FRONTEND_DIR/.env"
fi

# Backup existing .env
cp "$FRONTEND_DIR/.env" "$FRONTEND_DIR/.env.backup.$(date +%s)"
echo -e "${GREEN}✓${NC} Backed up existing .env"

# Update or add VITE_API_URL
if grep -q "VITE_API_URL" "$FRONTEND_DIR/.env"; then
    # Update existing
    sed -i "s|VITE_API_URL=.*|VITE_API_URL=http://$SERVER_IP:$BACKEND_PORT|" "$FRONTEND_DIR/.env"
    echo -e "${GREEN}✓${NC} Updated VITE_API_URL"
else
    # Add new
    echo "" >> "$FRONTEND_DIR/.env"
    echo "# Backend API URL (Production)" >> "$FRONTEND_DIR/.env"
    echo "VITE_API_URL=http://$SERVER_IP:$BACKEND_PORT" >> "$FRONTEND_DIR/.env"
    echo -e "${GREEN}✓${NC} Added VITE_API_URL"
fi

echo -e "\n${GREEN}Current .env configuration:${NC}"
cat "$FRONTEND_DIR/.env"

echo -e "\n${BLUE}============================================================================${NC}"
echo -e "${GREEN}✅ Frontend environment updated!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  1. Restart frontend dev server: ${BLUE}npm run dev${NC}"
echo -e "  2. Or rebuild frontend: ${BLUE}npm run build${NC}"
echo -e "  3. Frontend will now connect to: ${BLUE}http://$SERVER_IP:$BACKEND_PORT${NC}"
echo -e "${BLUE}============================================================================${NC}"
