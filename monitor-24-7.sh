#!/bin/bash

# 24/7 Auto-Resume Monitor
# Filters PM2 logs to show only critical events

echo "=========================================="
echo "  🤖 24/7 AUTO-RESUME MONITOR"
echo "  Strategie: Razor"
echo "  Watching for:"
echo "    - Position closes (SL/TP hits)"
echo "    - Auto-resume triggers"
echo "    - New trade openings"
echo "    - Cooldown periods"
echo "=========================================="
echo ""

pm2 logs tradebaas-backend --nostream --lines 100 | grep -E "(AUTO-RESUME|NEW TRADE|Position closed|Trade closed|Cooldown|Step [123])" | tail -50

echo ""
echo "=========================================="
echo "  Live tail (Ctrl+C to stop):"
echo "=========================================="
echo ""

pm2 logs tradebaas-backend --lines 0 | grep --line-buffered -E "(AUTO-RESUME|NEW TRADE|Position closed|Trade closed|Cooldown|Step [123]|=====)"
