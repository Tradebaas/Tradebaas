#!/bin/bash
cd /root/Tradebaas
echo "=== USDC FUTURES BALANCE TEST ===" 
echo "Starting test at $(date)"
echo ""

# Run the test and capture output
npx ts-node scripts/check-bitget.ts > usdc-test-result.log 2>&1

echo "Test completed. Results:"
echo "===================="
cat usdc-test-result.log
echo "===================="
echo ""
echo "Check if API credentials are working..."
