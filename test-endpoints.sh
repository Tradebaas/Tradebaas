#!/bin/bash
echo "Testing server endpoints..."

echo "1. Health check:"
curl -s http://127.0.0.1:3001/health | jq . 2>/dev/null || curl -s http://127.0.0.1:3001/health

echo -e "\n2. Bitget status:"
curl -s http://127.0.0.1:3001/brokers/bitget/status | jq . 2>/dev/null || curl -s http://127.0.0.1:3001/brokers/bitget/status

echo -e "\n3. Bitget ping test (corrected endpoint):"
curl -s http://127.0.0.1:3001/brokers/bitget/ping | jq . 2>/dev/null || curl -s http://127.0.0.1:3001/brokers/bitget/ping

echo -e "\n4. Server connection test:"
timeout 5 nc -zv 127.0.0.1 3001 2>&1
