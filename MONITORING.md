# 24/7 Auto-Resume Monitoring Guide

## Quick Start

### Watch live events:
```bash
/root/Tradebaas/monitor-24-7.sh
```

### Check current status:
```bash
# Database status
curl -s http://localhost:3000/api/trades/history?status=open | jq '.'

# Backend strategy status
curl -s http://localhost:3000/api/strategy/status/v2 | jq '.'

# Position status
curl -s http://localhost:3000/api/v2/positions | jq '.'
```

## What to Watch For

### 1. Position Close Event
```
================================================================================
[Razor] 🔄 AUTO-RESUME TRIGGERED - 2025-11-16T20:51:00.000Z
[Razor] ✅ Position closed - RESUMING strategy analysis
================================================================================

[Razor] 📊 Step 1/3: Updating trade history...
[Razor] 📈 Trade closed in database:
[Razor]    Exit Reason: SL_HIT
[Razor]    Exit Price: $93499.00
[Razor]    Entry Price: $93950.50
[Razor]    LOSS: $-451.50 (-0.48%)
[Razor]    Trade ID: trade_1763322661731_uos6qxhyn

[Razor] 🧹 Step 2/3: Cleaning up orphan orders...
[Razor] ✅ No orphan orders to cleanup

[Razor] ▶️  Step 3/3: Resuming strategy analysis...

────────────────────────────────────────────────────────────────────────────────
[Razor] ⏱️  Cooldown active until: 20:54:00 (3 minutes)
[Razor] 🔍 Next trade opportunity after cooldown period
[Razor] 🚀 24/7 AUTO-RESUME COMPLETE - Strategy will continue automatically
────────────────────────────────────────────────────────────────────────────────
```

### 2. Cooldown Period
```
[Razor] ⏱️  Cooldown active: 3 min remaining (180s)
[Razor] ⏱️  Cooldown active: 2 min remaining (120s)
[Razor] ⏱️  Cooldown active: 1 min remaining (60s)
[Razor] ✅ Cooldown ENDED - Resuming trend analysis and signal detection
```

### 3. New Trade Opening
```
================================================================================
[Razor] 🎯 NEW TRADE OPENED - 2025-11-16T20:55:00.000Z
================================================================================
[Razor] 📊 Trade Details:
[Razor]    Direction: LONG
[Razor]    Instrument: BTC_USDC-PERPETUAL
[Razor]    Entry Price: $94100.00
[Razor]    Amount: 104.123 contracts
[Razor]    Stop Loss: $93629.00 (0.50%)
[Razor]    Take Profit: $94571.00 (0.50%)
[Razor]    Risk/Reward: 1:1.00
[Razor] 🎫 Order IDs:
[Razor]    Entry: ETH-20251116-205500-1
[Razor]    SL: ETH-20251116-205500-1_sl
[Razor]    TP: ETH-20251116-205500-1_tp
[Razor] 💾 Database:
[Razor]    Trade ID: trade_1763323500000_abc123xyz
[Razor]    Status: OPEN
────────────────────────────────────────────────────────────────────────────────
[Razor] ⏸️  Strategy PAUSED - Waiting for position to close
[Razor] 🔄 Auto-resume will trigger when SL/TP hits
================================================================================
```

## Database Queries

### Check all trades (last 10):
```bash
curl -s 'http://localhost:3000/api/trades/history?limit=10' | jq '.trades[] | {
  time: .entryTime,
  strategy: .strategyName,
  side: .side,
  entry: .entryPrice,
  exit: .exitPrice,
  pnl: .pnl,
  status: .status
}'
```

### Check trade statistics:
```bash
curl -s 'http://localhost:3000/api/trades/stats' | jq '.stats'
```

### Check open position:
```bash
curl -s 'http://localhost:3000/api/trades/history?status=open' | jq '.trades[0]'
```

## Troubleshooting

### Strategy not resuming after position close?
1. Check PM2 logs: `pm2 logs tradebaas-backend | tail -50`
2. Verify backend running: `pm2 list`
3. Check database: `sqlite3 /root/Tradebaas/state/trades.db "SELECT * FROM trades ORDER BY entryTime DESC LIMIT 1;"`

### Frontend not updating?
1. Check browser console for errors
2. Verify hook polling: Look for `[useOpenPositionFromDB]` logs
3. Refresh browser

### Database not updating?
1. Check environment: `cat /root/Tradebaas/backend/.env | grep DB_PROVIDER`
2. Should show: `DB_PROVIDER=sql`
3. Restart backend: `pm2 restart tradebaas-backend --update-env`

## Success Indicators

✅ **Working 24/7 Loop:**
- Position closes → Auto-resume logs appear within 1 second
- Cooldown starts automatically (3 minutes default)
- After cooldown → Strategy analyzes market again
- New signal detected → Trade opens automatically
- Database updates at each step
- Frontend syncs via polling (3s interval)
- **NO MANUAL INTERVENTION NEEDED**

⚠️ **Issues:**
- No auto-resume logs after position close
- Database status stuck on "open"
- Frontend dropdown empty
- Cooldown never ends
- Strategy status "stopped"

## PM2 Commands

```bash
# Watch live logs
pm2 logs tradebaas-backend --lines 50

# Restart backend
pm2 restart tradebaas-backend --update-env

# Check process status
pm2 list

# Show process info
pm2 show tradebaas-backend

# Monitor CPU/Memory
pm2 monit
```

## Log Levels

All logs are prefixed with `[Razor]` for easy filtering:
- 🔄 = Auto-resume event
- 🎯 = New trade opened
- 📊 = Database operation
- 📈/📉 = Profit/Loss
- ⏱️ = Cooldown status
- ✅ = Success/Completion
- ❌ = Error
- ⏸️ = Strategy paused
- ▶️ = Strategy resumed
- 🧹 = Cleanup operation

## Next Steps

1. **Monitor first position close** - Watch the auto-resume flow
2. **Verify database updates** - Check trade history after close
3. **Test cooldown** - Ensure strategy resumes after 3 minutes
4. **Validate new trade** - Confirm automatic trade opening
5. **Check frontend sync** - Browser should update automatically

---

**Created:** 2025-11-16
**Purpose:** Monitor 24/7 auto-resume functionality
**Expected Behavior:** Fully autonomous trading loop
