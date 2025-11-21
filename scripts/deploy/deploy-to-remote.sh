#!/bin/bash

set -e

echo "=== 🚀 Deploying Backend to Remote Server ==="
echo ""

REMOTE_HOST="YOUR_SERVER_IP"
REMOTE_USER="root"
REMOTE_DIR="/root/backend"

# Step 1: Build backend locally
echo "📦 Step 1: Building backend locally..."
cd /root/Tradebaas/backend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Aborting deployment."
    exit 1
fi

echo "✅ Build successful"
echo ""

# Step 2: Create deployment package
echo "📦 Step 2: Creating deployment package..."
cd /root/Tradebaas
rm -f backend-deploy-latest.tar.gz

tar -czf backend-deploy-latest.tar.gz \
    -C backend \
    dist \
    package.json \
    package-lock.json \
    .env.production 2>/dev/null || tar -czf backend-deploy-latest.tar.gz \
    -C backend \
    dist \
    package.json \
    package-lock.json

echo "✅ Package created: $(ls -lh backend-deploy-latest.tar.gz | awk '{print $5}')"
echo ""

# Step 3: Check if we can reach remote
echo "🔍 Step 3: Checking remote server..."
if ! curl -s --connect-timeout 5 http://${REMOTE_HOST}:3000/health > /dev/null 2>&1; then
    echo "⚠️  Warning: Cannot reach remote backend health endpoint"
    echo "   Continuing anyway..."
fi
echo ""

# Step 4: Upload package (using existing method or manual)
echo "📤 Step 4: Uploading to remote..."
echo ""
echo "⚠️  Manual deployment required:"
echo ""
echo "1. Upload the package:"
echo "   scp /root/Tradebaas/backend-deploy-latest.tar.gz root@${REMOTE_HOST}:/tmp/"
echo ""
echo "2. SSH to remote and extract:"
echo "   ssh root@${REMOTE_HOST}"
echo "   cd ${REMOTE_DIR}"
echo "   tar -xzf /tmp/backend-deploy-latest.tar.gz"
echo ""
echo "3. Restart backend service:"
echo "   pm2 restart tradebaas-backend"
echo "   # OR"
echo "   systemctl restart tradebaas-backend"
echo ""
echo "4. Verify deployment:"
echo "   curl http://${REMOTE_HOST}:3000/api/debug/strategies"
echo ""
echo "5. Check logs:"
echo "   pm2 logs tradebaas-backend --lines 50"
echo ""

# Alternative: Try direct deployment if credentials exist
if [ -f ~/.ssh/id_rsa ] || [ -f ~/.ssh/id_ed25519 ]; then
    echo "🔐 Attempting automatic deployment..."
    echo ""
    
    # Try to SCP
    if scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        /root/Tradebaas/backend-deploy-latest.tar.gz \
        ${REMOTE_USER}@${REMOTE_HOST}:/tmp/ 2>/dev/null; then
        
        echo "✅ Upload successful!"
        echo ""
        
        # Try to extract and restart
        if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
            ${REMOTE_USER}@${REMOTE_HOST} \
            "cd ${REMOTE_DIR} && tar -xzf /tmp/backend-deploy-latest.tar.gz && pm2 restart tradebaas-backend" 2>/dev/null; then
            
            echo "✅ Deployment complete!"
            echo ""
            echo "🔍 Verifying..."
            sleep 3
            
            if curl -s http://${REMOTE_HOST}:3000/api/debug/strategies | jq '.success' 2>/dev/null | grep -q "true"; then
                echo "✅ Backend is running new code!"
                echo ""
                curl -s http://${REMOTE_HOST}:3000/api/debug/strategies | jq '.'
            else
                echo "⚠️  Backend restarted but debug endpoint not yet available"
                echo "   Check logs: pm2 logs tradebaas-backend"
            fi
        else
            echo "⚠️  Could not restart automatically. Please restart manually."
        fi
    else
        echo "⚠️  Could not upload automatically. Please follow manual steps above."
    fi
else
    echo "ℹ️  No SSH keys found. Please follow manual deployment steps above."
fi

echo ""
echo "=== 🎯 Deployment Package Ready ==="
echo "Location: /root/Tradebaas/backend-deploy-latest.tar.gz"
