# Cleanup Process Fix (2025-11-08)

## Problem

De cron job die elke 5 minuten draaide (`cleanup-old-processes.sh`) **kill alle backend processen**, inclusief PM2-beheerde processen. Dit zorgde voor:

- ❌ Backend disconnect elke 5 minuten
- ❌ WebSocket verbinding verbroken met Deribit
- ❌ PM2 restart count steeg oneindig (was op 61+)
- ❌ Geen 24/7 stable verbinding mogelijk

## Root Cause

Het originele script gebruikte:
```bash
grep -E "tsx.*server\.ts" | grep -v "PM2"
```

**Probleem**: PM2-beheerde processen hebben NIET "PM2" in hun command line staan!

Voorbeeld process tree:
```
npm run dev (PM2 PID: 652799)
  └─ sh -c tsx watch src/server.ts
      └─ node tsx watch src/server.ts
          └─ node server.ts (actual backend)
```

Geen enkel proces heeft "PM2" in de command, dus `grep -v "PM2"` werkte NIET.

## Solution

Nieuw script checkt **recursief de parent tree** om te bepalen of een proces door PM2 beheerd wordt:

```bash
is_pm2_managed() {
  local pid=$1
  local checked_pids=""
  
  while [ "$pid" != "1" ] && [ -n "$pid" ]; do
    # Prevent infinite loops
    if echo "$checked_pids" | grep -q "\b$pid\b"; then
      return 1
    fi
    checked_pids="$checked_pids $pid"
    
    # Check if this PID is a PM2 process
    if echo "$PM2_PIDS" | grep -q "\b$pid\b"; then
      return 0  # This process is managed by PM2
    fi
    
    # Get parent PID
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  done
  
  return 1  # Not managed by PM2
}
```

### Hoe het werkt:

1. **Get all PM2 PIDs**: `pm2 jlist | jq -r '.[].pid'`
2. **Find all tsx processes**: `ps aux | grep "tsx.*server.ts"`
3. **For each process**:
   - Loop through parent tree (PID → PPID → PPID → ...)
   - Check if any parent is a PM2 process
   - If yes: **SKIP** (don't kill)
   - If no: **KILL** (orphaned process)

## Testing Results

### Test 1: PM2 processen niet killen
```bash
$ bash /root/tradebaas/cleanup-old-processes.sh
✅ No orphaned processes found
```
✅ **PASS**: Geen PM2 processen gekilled

### Test 2: Orphaned proces wel killen
```bash
$ npx tsx src/server.ts &  # Start orphan
$ bash /root/tradebaas/cleanup-old-processes.sh
🗑️  Found orphaned processes to kill:
root  654412  sh -c tsx src/server.ts
root  654413  node tsx src/server.ts
root  654439  node server.ts
✓ Killed process 654412
✓ Killed process 654413
✓ Killed process 654439
```
✅ **PASS**: Orphaned processen gekilled, PM2 intact (restart count NIET verhoogd)

## Deployment

1. ✅ Backup old script: `cleanup-old-processes.sh.backup`
2. ✅ Deploy new script: `cleanup-old-processes.sh` (with PM2 parent check)
3. ✅ Cron job enabled: `*/5 * * * * /root/tradebaas/cleanup-old-processes.sh`
4. ✅ Backend restart: `pm2 restart tradebaas-backend` (clean state)

## Expected Behavior

### Before Fix
- Backend restarts elke 5 minuten (cron job)
- WebSocket disconnect → manual reconnect vereist
- PM2 restart count: ↺ 60+ en stijgend

### After Fix
- Backend blijft **24/7 draaien** zonder restarts
- WebSocket blijft **persistent connected** (heartbeat elke 25s)
- PM2 restart count: **stabiel** (alleen bij code changes of manual restart)
- Cleanup job kill **alleen orphaned processen** die niet door PM2 beheerd worden

## Monitoring

Check over 10-15 minuten:
```bash
pm2 list  # Restart count moet stabiel blijven
pm2 logs tradebaas-backend --lines 50  # Geen onverwachte restarts
cat /var/log/tradebaas-cleanup.log | tail -20  # Moet "No orphaned processes" tonen
```

## Verification Command

Test het script handmatig:
```bash
# Should show "No orphaned processes found"
bash /root/tradebaas/cleanup-old-processes.sh

# Create test orphan
npx tsx src/server.ts &

# Should kill only the orphan, not PM2 processes
bash /root/tradebaas/cleanup-old-processes.sh
```

## Rollback (if needed)

```bash
mv /root/tradebaas/cleanup-old-processes.sh.backup /root/tradebaas/cleanup-old-processes.sh
# Then disable cron or fix the issue
```

## Impact

✅ **24/7 stable connection** nu mogelijk  
✅ **No more unexpected disconnects** door backend restarts  
✅ **Orphan cleanup blijft werken** zoals bedoeld  
✅ **PM2 processen protected** tegen accidental kills  

---

**Fix deployed**: 2025-11-08 18:37 UTC  
**Status**: ✅ RESOLVED
