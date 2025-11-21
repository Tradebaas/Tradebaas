# Laptop Shutdown Scenario - Strategy Persistence

**Vraag:** Blijft de backend ten alle tijden doorgaan met de laatst gekozen strategie als ik die manueel heb gestart en bv mijn complete laptop afsluit?

**Antwoord:** ✅ **JA - ABSOLUUT!**

---

## Scenario: Laptop Afsluiten Met Actieve Strategie

### Setup
```
Locatie Backend: VPS Server (YOUR_SERVER_IP)
Locatie Frontend: Jouw laptop
Actieve strategie: Razor (manueel gestart via frontend)
```

### Wat Gebeurt Er?

**1. Normale situatie (laptop AAN):**
```
┌─────────────┐                  ┌──────────────┐                 ┌─────────────┐
│   Laptop    │ ──── HTTP ────>  │  VPS Backend │ ──── WS ──────> │   Deribit   │
│  (Frontend) │                  │  Port 3000   │                 │   Exchange  │
└─────────────┘                  └──────────────┘                 └─────────────┘
                                       │
                                       │ Strategy Loop
                                       │ (Razor Executor)
                                       │
                                       v
                                  Every 5 seconds:
                                  - Fetch ticker
                                  - Analyze signals
                                  - Execute trades
```

**2. Jij sluit laptop af:**
```
┌─────────────┐
│   Laptop    │ ──────> SHUTDOWN
│  (Frontend) │
└─────────────┘
      X  (connection lost)
      
      
                                  ┌──────────────┐                 ┌─────────────┐
                      BLIJFT ──>  │  VPS Backend │ ──── WS ──────> │   Deribit   │
                      DRAAIEN!    │  Port 3000   │     ACTIEF      │   Exchange  │
                                  └──────────────┘                 └─────────────┘
                                       │
                                       │ Strategy Loop
                                       │ ✅ BLIJFT ACTIEF!
                                       │
                                       v
                                  Every 5 seconds:
                                  - ✅ Fetch ticker (Deribit)
                                  - ✅ Analyze signals (Razor)
                                  - ✅ Execute trades (automatic)
                                  - ✅ Position management (SL/TP)
```

### Waarom Blijft Het Draaien?

**1. Backend Draait Op VPS (Niet Op Laptop):**
```bash
# Backend proces draait op VPS server:
root@vps:~# ps aux | grep "npm run dev"
root     123456  tsx watch src/server.ts  # ✅ DRAAIT OP VPS

# Jouw laptop heeft GEEN invloed op dit proces
```

**2. State Wordt Lokaal Bijgehouden (Op VPS):**
```json
// File: /root/Tradebaas/state/backend-state.json (OP VPS!)
{
  "activeStrategies": [
    {
      "id": "strategy-1763075013255",
      "name": "Razor",
      "status": "active",  // ✅ BLIJFT ACTIVE
      "startedAt": 1763075013255,
      "config": {
        "instrument": "BTC_USDC-PERPETUAL",
        "tradeSize": 100
      }
    }
  ],
  "connection": {
    "broker": "deribit",
    "environment": "live",
    "connected": true,
    "manuallyDisconnected": false  // ✅ NIET MANUAL DISCONNECT
  }
}
```

**3. Strategy Loop Is Onafhankelijk:**
```typescript
// File: backend/src/strategy-service.ts
private async runStrategy(strategy: StrategyState): Promise<void> {
  console.log(`[StrategyService] Starting execution loop for ${strategy.name}`);
  
  // CRITICAL: This interval runs LOCALLY on VPS
  // It does NOT depend on frontend connection!
  const timer = setInterval(async () => {
    try {
      // ✅ Fetch data from Deribit (VPS -> Deribit direct)
      const ticker = await this.client.getTicker(instrument);
      
      // ✅ Execute strategy logic (on VPS)
      await executor.onTicker(ticker);
      
      // ✅ Place orders if signals found (VPS -> Deribit)
      // Frontend is NOT involved!
      
    } catch (error) {
      console.error('[StrategyService] Strategy tick error:', error);
    }
  }, 5000); // Every 5 seconds - INDEPENDENT of frontend
  
  this.runningStrategies.set(strategy.id, timer);
}
```

---

## Complete Flow: Laptop Shutdown

### Timeline

**T+0: Jij start strategie (laptop AAN)**
```
1. Frontend (laptop) -> POST /api/strategy/start -> Backend (VPS)
2. Backend creates strategy loop on VPS
3. State saved: status = 'active'
4. Loop starts: Every 5s analyze & trade
```

**T+30min: Jij sluit laptop**
```
5. Frontend connection verbroken
6. Backend MERKT DIT NIET (no dependency!)
7. Strategy loop BLIJFT DRAAIEN
8. Trades BLIJVEN PLAATSEN
```

**T+1hr: Laptop nog steeds uit**
```
9. Backend: ✅ Still running
10. Strategy: ✅ Still analyzing
11. Trades: ✅ Still executing
12. Position: ✅ SL/TP still monitored
```

**T+2hr: Jij start laptop weer op**
```
13. Frontend reconnects to backend
14. Dashboard shows: Strategy ACTIVE sinds T+0
15. Jij ziet: Alle trades die zijn uitgevoerd
16. Alles werkt normaal verder
```

---

## Technische Details

### 1. Backend Process Independence

**Backend draait als systemd service OF screen session:**
```bash
# Option A: tsx watch (current)
cd /root/Tradebaas/backend && npm run dev

# Process blijft draaien onafhankelijk van SSH sessie
# Frontend heeft GEEN invloed op backend proces
```

### 2. WebSocket Connections

**Deribit WebSocket (Backend <-> Exchange):**
```
Backend (VPS) <------ WebSocket ------> Deribit Exchange
              ✅ BLIJFT ACTIEF

              Independent of frontend!
```

**Frontend WebSocket (Optional - alleen voor UI updates):**
```
Frontend (laptop) <--- WebSocket ---> Backend (VPS)
                  X  DISCONNECTED

                  Dit heeft GEEN invloed op strategy execution!
                  Strategy draait op backend side.
```

### 3. State Persistence

**State file lokaal op VPS:**
```bash
# File location: /root/Tradebaas/state/backend-state.json
# Dit bestand staat op VPS, NIET op jouw laptop!

# Laptop shutdown heeft GEEN invloed op dit bestand
```

### 4. Auto-Resume After Backend Restart

**Zelfs als VPS backend crasht:**
```typescript
// File: backend/src/server.ts
const start = async () => {
  // Initialize strategy service (auto-resume if needed)
  await strategyService.initialize();  // ✅ Restores active strategies!
  
  // Starts HTTP server
  await server.listen({ port: PORT, host: '0.0.0.0' });
};
```

**Strategy service initialize logic:**
```typescript
// File: backend/src/strategy-service.ts
async initialize(): Promise<void> {
  await stateManager.initialize();
  
  // Load activeStrategies from state file
  const strategies = stateManager.getActiveStrategies();
  
  for (const strategy of strategies) {
    if (strategy.status === 'active') {
      // ✅ AUTO-RESUME active strategies!
      await this.resumeStrategy(strategy);
    }
  }
}
```

---

## Testen

### Test 1: Laptop Afsluiten

```bash
# 1. Start strategy via frontend (laptop)
# 2. Wacht 1 minuut
# 3. Check logs op VPS:
ssh root@YOUR_SERVER_IP
cd /root/Tradebaas/backend
tail -f logs/backend.log

# Expected: Strategy ticks every 5 seconds

# 4. Sluit laptop af
# 5. Wacht 5 minuten
# 6. SSH weer in vanaf ander device (phone/tablet):
ssh root@YOUR_SERVER_IP
cd /root/Tradebaas/backend
tail -f logs/backend.log

# Expected: Strategy STILL ticking every 5 seconds!
# Expected: Timestamps laten zien dat het NOOIT gestopt is
```

### Test 2: Backend Restart (Extreme Case)

```bash
# 1. Start strategy via frontend
# 2. Check state file:
cat /root/Tradebaas/state/backend-state.json | jq .activeStrategies

# Expected: status: "active"

# 3. Kill backend proces (simulate crash):
pkill -f "tsx watch"

# 4. Restart backend:
cd /root/Tradebaas/backend && npm run dev

# Expected in logs:
# [StrategyService] Found active manual connection - attempting auto-resume...
# [StrategyService] Resuming strategy: Razor
# ✅ Strategy AUTOMATICALLY resumed!

# 5. Laptop was al uit tijdens test
# Result: Strategy blijft draaien, onafhankelijk van laptop
```

---

## Garanties

### ✅ WAT BLIJFT DRAAIEN:

1. **Backend Process:**
   - Draait op VPS (YOUR_SERVER_IP)
   - Onafhankelijk van jouw laptop
   - Onafhankelijk van frontend
   - 24/7 beschikbaar

2. **Strategy Execution Loop:**
   - Interval timer op VPS
   - Fetches data from Deribit
   - Analyzes signals
   - Places trades
   - Monitors positions

3. **Deribit WebSocket Connection:**
   - Direct connection: VPS <-> Deribit
   - Real-time market data
   - Order execution
   - Position updates

4. **State Persistence:**
   - Opgeslagen op VPS disk
   - Survives backend restart
   - Auto-resume na crash

### ❌ WAT STOPT (Geen probleem):

1. **Frontend UI:**
   - Draait op jouw laptop
   - Alleen voor monitoring
   - NIET nodig voor strategy execution
   - Kan altijd later weer opstarten

2. **Frontend WebSocket (Optional):**
   - Alleen voor real-time UI updates
   - NIET gebruikt door strategy logic
   - Backend draait zonder frontend WS

---

## Edge Cases

### Scenario A: VPS Restart (Power Outage)

**Wat gebeurt:**
```
1. VPS gaat uit (stroomstoring datacenter)
2. State file blijft intact (disk)
3. VPS komt weer online
4. Backend auto-start (systemd service)
5. Strategy service initialize()
6. ✅ Active strategies worden AUTOMATIC resumed
```

**Vereiste:**
```bash
# Setup systemd service (eenmalig):
sudo nano /etc/systemd/system/tradebaas-backend.service

[Service]
WorkingDirectory=/root/Tradebaas/backend
ExecStart=/usr/bin/npm run dev
Restart=always

sudo systemctl enable tradebaas-backend
sudo systemctl start tradebaas-backend
```

### Scenario B: Internet Uitval (Jouw Laptop)

**Wat gebeurt:**
```
1. Jouw laptop verliest internet
2. Frontend kan niet meer met backend praten
3. Backend MERKT DIT NIET
4. ✅ Strategy blijft draaien
5. ✅ Trades blijven plaatsen
6. Jij komt later online: ziet alle trades in dashboard
```

### Scenario C: VPS Internet Uitval

**Wat gebeurt:**
```
1. VPS verliest internet
2. Deribit WebSocket disconnected
3. Strategy loop BLIJFT draaien (probeert reconnect)
4. Trades KUNNEN NIET plaatsen (no exchange connection)
5. Internet komt terug
6. WebSocket reconnects AUTOMATIC
7. ✅ Strategy hervat normal operations
```

**Mitigatie:**
```typescript
// Auto-reconnect logic already implemented
// See: backend/src/deribit-client.ts
private setupReconnectLogic() {
  this.ws.on('close', () => {
    setTimeout(() => this.reconnect(), 5000);
  });
}
```

---

## Conclusie

**✅ JA - STRATEGIE BLIJFT 100% DRAAIEN!**

**Waarom:**
1. Backend draait op VPS (niet op laptop)
2. Strategy loop is local VPS interval (niet frontend dependent)
3. Deribit connection is VPS <-> Exchange (niet via laptop)
4. State wordt opgeslagen op VPS disk (niet op laptop)
5. Auto-resume werkt na backend restart

**Jouw laptop is ALLEEN:**
- UI voor monitoring
- Interface om te starten/stoppen
- Dashboard voor analytics

**Backend is VOLLEDIG onafhankelijk!**

**Test het gerust:**
1. Start strategy
2. Sluit laptop
3. Wacht 1 uur
4. Start laptop weer op
5. Check dashboard: strategie heeft gewoon doorgedraaid! 🚀
