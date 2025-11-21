#!/bin/bash
cd /root/Tradebaas

echo "=== LIVE USDC BALANCE TEST ==="
echo "Environment: LIVE_ENABLED=true, TESTNET=false"
echo "Testing at: $(date)"
echo ""

echo "1. Server status check:"
curl -s http://127.0.0.1:3000/health

echo -e "\n2. Bitget status check:"  
curl -s http://127.0.0.1:3000/brokers/bitget/status

echo -e "\n3. LIVE USDC Balance Test:"
curl -s http://127.0.0.1:3000/brokers/bitget/ping

echo -e "\n\n=== Test Completed ==="
