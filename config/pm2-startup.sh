#!/bin/bash

##############################################################################
# PM2 Startup Script for Tradebaas
# 
# This script sets up PM2 to run both backend and frontend 24/7.
# It will automatically restart the processes on server reboot.
#
# Usage:
#   ./scripts/pm2-startup.sh
#
# What it does:
#   1. Stops any existing PM2 processes
#   2. Starts backend and frontend using ecosystem.config.cjs
#   3. Saves the PM2 process list
#   4. Sets up PM2 to auto-start on system boot
##############################################################################

set -e # Exit on error

echo "🚀 Tradebaas PM2 Startup Script"
echo "================================"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed!"
    echo "   Install it with: npm install -g pm2"
    exit 1
fi

echo "✅ PM2 is installed"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
echo "📂 Project root: $PROJECT_ROOT"
echo ""

# Stop existing PM2 processes (if any)
echo "🛑 Stopping existing PM2 processes..."
pm2 delete all 2>/dev/null || echo "   No existing processes to stop"
echo ""

# Ensure logs directory exists
echo "📁 Creating logs directory..."
mkdir -p "$PROJECT_ROOT/logs"
touch "$PROJECT_ROOT/logs/.gitkeep"
echo "✅ Logs directory ready"
echo ""

# Start processes using ecosystem config
echo "▶️  Starting Tradebaas processes..."
pm2 start "$PROJECT_ROOT/config/ecosystem.config.cjs"
echo ""

# Wait a moment for processes to stabilize
sleep 3

# Show status
echo "📊 PM2 Process Status:"
pm2 list
echo ""

# Save process list
echo "💾 Saving PM2 process list..."
pm2 save
echo "✅ Process list saved"
echo ""

# Setup PM2 to start on boot
echo "🔄 Setting up PM2 auto-start on system boot..."
pm2 startup | tail -n 1 > /tmp/pm2-startup-cmd.sh
chmod +x /tmp/pm2-startup-cmd.sh

echo ""
echo "⚠️  IMPORTANT: You need to run the following command as ROOT/sudo:"
echo ""
cat /tmp/pm2-startup-cmd.sh
echo ""
echo "Copy and paste the command above, then run this script again to verify."
echo ""

# Check if startup is already configured
if pm2 startup | grep -q "already configured"; then
    echo "✅ PM2 startup is already configured!"
else
    echo "❌ PM2 startup NOT YET configured"
    echo "   Run the command shown above with sudo, then re-run this script"
fi

echo ""
echo "🎉 PM2 setup complete!"
echo ""
echo "Useful commands:"
echo "  pm2 list              - Show all processes"
echo "  pm2 logs              - Show logs from all processes"
echo "  pm2 logs tradebaas-backend  - Show backend logs only"
echo "  pm2 logs tradebaas-frontend - Show frontend logs only"
echo "  pm2 restart all       - Restart all processes"
echo "  pm2 stop all          - Stop all processes"
echo "  pm2 delete all        - Delete all processes"
echo "  pm2 monit             - Live monitoring dashboard"
echo ""
echo "Your services are now running 24/7 and will auto-start on reboot! 🚀"
