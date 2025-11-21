#!/bin/bash

echo "=== Deploying Updated Backend to Remote Server ==="
echo ""

# Build backend first
echo "1. Building backend..."
cd /root/Tradebaas/backend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting deployment."
    exit 1
fi

echo "✅ Build successful"
echo ""

# Create deployment package
echo "2. Creating deployment package..."
cd /root/Tradebaas
tar -czf backend-deploy-new.tar.gz \
    backend/dist \
    backend/package.json \
    backend/package-lock.json \
    backend/.env.production \
    backend/node_modules

echo "✅ Package created"
echo ""

echo "3. Package size:"
ls -lh backend-deploy-new.tar.gz
echo ""

echo "=== Deployment package ready ==="
echo "To deploy to remote:"
echo "  1. Copy backend-deploy-new.tar.gz to remote server"
echo "  2. Extract and restart backend service"
echo ""
echo "Or use PM2 if available:"
echo "  pm2 restart tradebaas-backend"
