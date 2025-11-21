# Enhanced Logging Summary

## What was added:

### 1. AUTO-RESUME EVENT (Position Close)
Triggers when SL/TP hits. Shows:
- Timestamp
- 3-step process (update DB → cleanup → resume)
- Trade exit details (price, reason, PnL)
- Cooldown countdown
- Visual box with === borders

### 2. COOLDOWN MONITORING
Logs every 30 seconds during cooldown:
- Minutes and seconds remaining
- Clear "Cooldown ENDED" message
- Prevents log spam

### 3. NEW TRADE OPENING
Complete trade details in visual box:
- Direction, price, amount
- SL/TP levels and percentages
- Risk/Reward ratio
- All order IDs
- Database trade ID
- Strategy pause confirmation

## Files Modified:

1. **backend/src/strategies/razor-executor.ts**
   - Enhanced checkPositionAndResume()
   - Detailed closeTradeHistory() logging
   - New trade opening visual box
   - Cooldown progress tracking
   - Added lastCooldownLog property

2. **Created monitoring tools:**
   - /root/Tradebaas/monitor-24-7.sh (live event filter)
   - /root/Tradebaas/MONITORING.md (complete guide)

## Usage:

```bash
# Watch live 24/7 events
/root/Tradebaas/monitor-24-7.sh

# Check database
curl -s 'http://localhost:3000/api/trades/history?status=open' | jq '.'

# Full logs
pm2 logs tradebaas-backend
```

## Expected Flow:

```
Position OPEN (paused)
    ↓
SL/TP HIT
    ↓
🔄 AUTO-RESUME TRIGGERED
    ↓
📊 Database updated (status: closed, pnl calculated)
    ↓
🧹 Orphan orders cleaned
    ↓
▶️  Strategy resumed (status: analyzing)
    ↓
⏱️  Cooldown active (3 minutes)
    ↓
✅ Cooldown ended
    ↓
🔍 Trend analysis
    ↓
Signal detected
    ↓
🎯 NEW TRADE OPENED
    ↓
Back to Position OPEN
```

## Visual Examples:

**Auto-Resume Trigger:**
```
================================================================================
[Razor] 🔄 AUTO-RESUME TRIGGERED - 2025-11-16T20:51:00Z
[Razor] ✅ Position closed - RESUMING strategy analysis
================================================================================
[Razor] 📊 Step 1/3: Updating trade history...
[Razor] 📉 Trade closed in database:
[Razor]    Exit Reason: SL_HIT
[Razor]    LOSS: $-451.50 (-0.48%)
```

**New Trade:**
```
================================================================================
[Razor] 🎯 NEW TRADE OPENED - 2025-11-16T20:55:00Z
================================================================================
[Razor] 📊 Trade Details:
[Razor]    Direction: LONG
[Razor]    Entry Price: $94100.00
[Razor]    Stop Loss: $93629.00 (0.50%)
[Razor]    Risk/Reward: 1:1.00
```

---

**Status:** ✅ READY FOR 24/7 MONITORING
**Next:** Wait for position close to test auto-resume
