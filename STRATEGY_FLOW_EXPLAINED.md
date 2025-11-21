# 🎯 RAZOR STRATEGY - Complete Flow Explained (Super Eenvoudig)

**Datum:** 17 november 2025  
**Doel:** EXACT begrijpen waar alles gedefinieerd wordt - van start tot trade close

---

## 📋 QUICK REFERENCE - Waar vind ik wat?

| **Wat zoek je?** | **Bestand** | **Regel** |
|-----------------|------------|----------|
| **Config (SL/TP/tradeSize)** | `backend/src/strategy-service.ts` | 365-380 |
| **Strategie logica** | `backend/src/strategies/razor-executor.ts` | Hele bestand |
| **Order plaatsen** | `backend/src/strategies/razor-executor.ts` | 840-960 |
| **SL/TP berekening** | `backend/src/strategies/razor-executor.ts` | 855-869 |
| **Position size** | `backend/src/strategies/razor-executor.ts` | 845-852 |
| **Leverage** | NIET IN CODE - Deribit account setting | N/A |
| **Entry signaal** | `backend/src/strategies/razor-executor.ts` | 650-750 |
| **Auto-resume** | `backend/src/strategies/razor-executor.ts` | 580-640 |

---

## 🚀 FLOW STAP 1: Strategie Starten

### 📍 Bestand: `backend/src/strategy-service.ts` (regel 365-380)

```typescript
// DEFAULT CONFIG - Dit zijn de waarden die gebruikt worden!
const config: RazorConfig = {
  instrument,
  tradeSize: strategy.config.tradeSize || 100,        // 👈 $100 USD (HIER!)
  stopLossPercent: strategy.config.stopLossPercent || 0.5,   // 👈 0.5% SL (HIER!)
  takeProfitPercent: strategy.config.takeProfitPercent || 1.0,  // 👈 1.0% TP (HIER!)
  maxConcurrentTrades: strategy.config.maxConcurrentTrades || 1,
  maxDailyTrades: strategy.config.maxDailyTrades || 150,
  cooldownMinutes: strategy.config.cooldownMinutes || 5,
  minVolatility: strategy.config.minVolatility || 0.01,
  maxVolatility: strategy.config.maxVolatility || 5.0,
  rsiOversold: strategy.config.rsiOversold || 40,
  rsiOverbought: strategy.config.rsiOverbought || 60,
};
```

**💡 WAAROM ZIE JE DEZE WAARDEN?**
- Frontend stuurt GEEN config → backend gebruikt defaults
- `tradeSize: 100` = $100 USD per trade
- `stopLossPercent: 0.5` = 0.5% stop loss
- `takeProfitPercent: 1.0` = 1.0% take profit

**🔧 AANPASSEN:**
Wijzig regel 370-372 in `backend/src/strategy-service.ts`

---

## 📊 FLOW STAP 2: Market Analyse (Zoeken naar Signaal)

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 650-750)

```typescript
// ENTRY CRITERIA - Wanneer trade openen?
private async analyze(): Promise<void> {
  // Bereken indicators
  await this.calculateIndicators();
  
  const { rsi, volatility, emaFast, emaSlow } = this.analysisState.indicators;
  
  // LONG SIGNAL
  if (
    rsi < this.config.rsiOversold &&           // RSI < 40 (oversold)
    volatility >= this.config.minVolatility &&  // Vol >= 0.01%
    volatility <= this.config.maxVolatility &&  // Vol <= 5.0%
    emaFast > emaSlow                           // Trend omhoog
  ) {
    this.analysisState.signal.type = 'long';
    await this.executeTrade('long');
  }
  
  // SHORT SIGNAL
  if (
    rsi > this.config.rsiOverbought &&          // RSI > 60 (overbought)
    volatility >= this.config.minVolatility &&
    volatility <= this.config.maxVolatility &&
    emaFast < emaSlow                           // Trend omlaag
  ) {
    this.analysisState.signal.type = 'short';
    await this.executeTrade('short');
  }
}
```

**💡 WAT GEBEURT HIER?**
1. Elke tick (price update) → `analyze()` wordt aangeroepen
2. Bereken RSI, EMA's, Volatility
3. Check of signaal matched (long/short criteria)
4. Als match → `executeTrade()` (volgende stap!)

**🔧 AANPASSEN:**
Wijzig RSI levels (regel 376-377 in strategy-service.ts)
- `rsiOversold: 40` → bijv. 30 (meer extreme oversold)
- `rsiOverbought: 60` → bijv. 70 (meer extreme overbought)

---

## 💰 FLOW STAP 3: Position Size Berekening

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 845-852)

```typescript
// POSITION SIZE - Hoeveel BTC kopen?
const notionalValue = this.config.tradeSize;  // $100 USD
const amount = notionalValue / currentPrice;   // $100 / $95,000 = 0.00105 BTC

// Round naar minimum trade amount (Deribit vereiste)
const roundedAmount = Math.max(
  Math.round(amount / instrument.min_trade_amount) * instrument.min_trade_amount,
  instrument.min_trade_amount
);

// Fix floating point precision
const finalAmount = Number(roundedAmount.toFixed(8));  // 0.001 BTC
```

**💡 WAAROM 0.001 BTC?**
- Config: `tradeSize = $100` (regel 370 in strategy-service.ts)
- BTC prijs: ~$95,000
- Berekening: $100 / $95,000 = **0.00105 BTC**
- Afgerond: **0.001 BTC** (Deribit minimum)

**🔧 AANPASSEN:**
Verhoog `tradeSize` in regel 370:
- `tradeSize: 100` → `tradeSize: 1000` (0.01 BTC bij $100k)
- `tradeSize: 100` → `tradeSize: 10000` (0.1 BTC bij $100k)

---

## 🎯 FLOW STAP 4: Stop Loss & Take Profit Berekening

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 855-869)

```typescript
// SL/TP CALCULATION
const slPercent = this.config.stopLossPercent / 100;  // 0.5 / 100 = 0.005
const tpPercent = this.config.takeProfitPercent / 100; // 1.0 / 100 = 0.01

let stopLoss, takeProfit;
if (direction === 'long') {
  stopLoss = currentPrice * (1 - slPercent);    // $95,000 * 0.995 = $94,525
  takeProfit = currentPrice * (1 + tpPercent);  // $95,000 * 1.01 = $95,950
} else {
  stopLoss = currentPrice * (1 + slPercent);    // SHORT: prijs OMHOOG
  takeProfit = currentPrice * (1 - tpPercent);  // SHORT: prijs OMLAAG
}

// TICK SIZE ROUNDING - DIT veroorzaakt RR variaties!
const tickSize = instrument.tick_size;  // Bijv. $0.50
stopLoss = Math.round(stopLoss / tickSize) * tickSize;    // $94,525 → $94,525.00
takeProfit = Math.round(takeProfit / tickSize) * tickSize; // $95,950 → $95,950.00
```

**💡 WAAROM VARIEERT RR (1.95-2.05)?**
- Theoretisch RR: 1.0% / 0.5% = **2.0**
- Tick rounding: $94,525.234 → $94,525.00 (afronding!)
- Resultaat: SL kan 0.4999% zijn, TP kan 1.0001% zijn
- Nieuwe RR: **1.9998 of 2.0002** (kleine variaties)

**🔧 AANPASSEN:**
Wijzig percentages (regel 371-372 in strategy-service.ts):
- `stopLossPercent: 0.5` → `stopLossPercent: 1.0` (grotere SL)
- `takeProfitPercent: 1.0` → `takeProfitPercent: 2.0` (grotere TP)

---

## 📞 FLOW STAP 5: Orders Plaatsen (Deribit API)

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 878-905)

```typescript
// STEP 1: Entry order (market order)
const entryOrder = direction === 'long'
  ? await this.client.placeBuyOrder(
      this.config.instrument,  // BTC_USDC-PERPETUAL
      finalAmount,             // 0.001 BTC
      undefined,               // Geen limit price (market order)
      'market',                // Order type
      label                    // Label voor tracking
    )
  : await this.client.placeSellOrder(...);

// STEP 2: Stop Loss order (stop_market, reduce_only)
const slOrder = direction === 'long'
  ? await this.client.placeSellOrder(
      this.config.instrument,
      finalAmount,
      stopLoss,        // $94,525 (trigger price)
      'stop_market',   // Type
      `${label}_sl`,
      true             // reduce_only = TRUE (alleen sluiten, niet nieuwe positie)
    )
  : await this.client.placeBuyOrder(...);

// STEP 3: Take Profit order (limit, reduce_only)
const tpOrder = direction === 'long'
  ? await this.client.placeSellOrder(
      this.config.instrument,
      finalAmount,
      takeProfit,      // $95,950 (limit price)
      'limit',         // Type
      `${label}_tp`,
      true             // reduce_only = TRUE
    )
  : await this.client.placeBuyOrder(...);
```

**💡 WAT GEBEURT HIER?**
1. **Entry**: Market order → INSTANT gevuld tegen huidige prijs
2. **Stop Loss**: Stop market @ $94,525 → triggered als prijs daalt
3. **Take Profit**: Limit order @ $95,950 → gevuld als prijs stijgt
4. Beide SL/TP zijn `reduce_only` → kunnen ALLEEN positie sluiten

**🔍 DERIBIT CLIENT:**
- API calls in: `backend/src/deribit-client.ts`
- Methodes: `placeBuyOrder()`, `placeSellOrder()`

---

## 🔒 FLOW STAP 6: Leverage (NIET IN CODE!)

### ⚠️ KRITISCH: Leverage is NIET geconfigureerd in de bot!

```typescript
// ❌ NIET IN RAZOR CONFIG
// ❌ NIET IN DERIBIT CLIENT
// ❌ NIET IN STRATEGY-SERVICE

// ✅ WEL: Jouw Deribit account setting
```

**💡 WAAR KOMT 50x VANDAAN?**
- **Deribit Account Settings** → Margin → Cross Margin Leverage
- Dit is een ACCOUNT-LEVEL instelling
- Bot gebruikt ALTIJD de leverage uit je account
- Niet instelbaar via code (tenzij je API call toevoegt)

**🔧 AANPASSEN:**
1. Log in op Deribit.com
2. Ga naar Account → Settings → Margin
3. Wijzig Cross Margin Leverage (1x - 100x)
4. Bot gebruikt nieuwe waarde bij volgende trade

---

## ⏸️ FLOW STAP 7: Strategy Pause (Wachten op Close)

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 945-950)

```typescript
// UPDATE STATE - Strategy PAUZEERT
this.analysisState.status = 'position_open';  // ANALYZING → POSITION_OPEN
this.lastTradeTime = Date.now();
this.dailyTrades++;
this.analysisState.cooldownUntil = Date.now() + (this.config.cooldownMinutes * 60 * 1000);

console.log(`[Razor] ⏸️  Strategy PAUSED - Waiting for position to close`);
console.log(`[Razor] 🔄 Auto-resume will trigger when SL/TP hits`);
```

**💡 WAT GEBEURT HIER?**
- Status wordt `position_open`
- `analyze()` wordt NIET meer aangeroepen
- Strategy is "frozen" tot positie sluit
- **Auto-resume** (volgende stap) monitort positie

---

## 🔄 FLOW STAP 8: Auto-Resume (Position Monitoring)

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 580-640)

```typescript
// AUTO-RESUME LOGIC - Elke tick check positie
async checkPositionAndResume(): Promise<void> {
  // STAP 1: Check of positie nog bestaat
  const positions = await this.client.getPositions(this.config.instrument);
  const hasPosition = positions.some(p => Math.abs(p.size) > 0);
  
  if (!hasPosition) {
    // STAP 2: Positie is GESLOTEN!
    console.log('[Razor] 🔄 AUTO-RESUME TRIGGERED');
    
    // STAP 3: Cleanup orphan orders (SL/TP die blijven hangen)
    await this.cleanupOrphanOrders();
    
    // STAP 4: Close trade in database (berekent PnL)
    await this.closeTradeHistory();
    
    // STAP 5: Resume analyzing
    this.analysisState.status = 'cooldown';  // COOLDOWN period
    
    // Na cooldown: terug naar 'analyzing'
    setTimeout(() => {
      this.analysisState.status = 'analyzing';
      console.log('[Razor] ✅ Cooldown ENDED - Resume analyzing');
    }, this.config.cooldownMinutes * 60 * 1000);
  }
}
```

**💡 LIFECYCLE:**
1. **Position Open** → Status = `position_open` (paused)
2. **SL/TP Hit** → Deribit sluit positie automatisch
3. **Auto-Resume** → Detecteert geen positie meer
4. **Cleanup** → Cancelt overgebleven orders
5. **Database Update** → Sluit trade, berekent PnL
6. **Cooldown** → 5 minuten wachten (config)
7. **Resume** → Status = `analyzing` (zoekt nieuwe signalen)

---

## 💾 FLOW STAP 9: Trade History (Database Tracking)

### 📍 Bestand: `backend/src/strategies/razor-executor.ts` (regel 912-922)

```typescript
// RECORD TRADE - Opslaan in database
const tradeHistory = getTradeHistoryService();
this.currentTradeId = await tradeHistory.recordTrade({
  strategyName: this.strategyName,     // 'razor'
  instrument: this.config.instrument,  // 'BTC_USDC-PERPETUAL'
  side: direction === 'long' ? 'buy' : 'sell',
  entryOrderId: entryOrder.order_id,
  slOrderId: slOrder.order_id,
  tpOrderId: tpOrder.order_id,
  entryPrice: currentPrice,            // $95,000
  amount: finalAmount,                 // 0.001 BTC
  stopLoss,                            // $94,525
  takeProfit                           // $95,950
});
```

**📊 DATABASE:**
- **Bestand:** `/root/Tradebaas/state/trades.db` (SQLite)
- **Service:** `backend/src/services/trade-history.ts`
- **Table:** `trades` (entry time, exit time, PnL, etc.)

**🔍 CLOSE TRADE:**
```typescript
// Bij positie close - Update database
await tradeHistory.closeTrade(this.currentTradeId, {
  exitPrice: lastPrice,           // Exit prijs
  pnl: calculatedPnl,             // Profit/Loss in USD
  pnlPercentage: pnlPercent,      // Profit/Loss in %
  exitReason: 'sl_hit'            // sl_hit / tp_hit / manual
});
```

---

## 📝 VOLLEDIGE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. FRONTEND: User klikt "Start Strategy"                       │
│    📍 src/components/StrategyTradingCard.tsx                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. BACKEND: strategy-service.ts laadt DEFAULT CONFIG            │
│    📍 backend/src/strategy-service.ts (regel 365-380)           │
│    ✅ tradeSize: $100                                           │
│    ✅ stopLossPercent: 0.5%                                     │
│    ✅ takeProfitPercent: 1.0%                                   │
│    ✅ cooldownMinutes: 5                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RAZOR EXECUTOR: Initialize + Subscribe Ticker                │
│    📍 backend/src/strategies/razor-executor.ts                  │
│    - Laadt 100 historical candles                               │
│    - Berekent indicators (EMA, RSI, Volatility)                 │
│    - Status: 'analyzing'                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. MARKET ANALYSIS: Elke tick (price update)                    │
│    📍 razor-executor.ts → analyze() (regel 650-750)             │
│    - Check RSI < 40 (oversold) of > 60 (overbought)             │
│    - Check Volatility 0.01% - 5.0%                              │
│    - Check EMA trend                                            │
│    ❓ Signaal match? → executeTrade()                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │ SIGNAAL DETECTED!
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. POSITION SIZE: Bereken hoeveel BTC                           │
│    📍 razor-executor.ts → executeTrade() (regel 845-852)        │
│    - notionalValue = $100 (config.tradeSize)                    │
│    - amount = $100 / currentPrice                               │
│    - roundedAmount = 0.001 BTC (Deribit minimum)                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. SL/TP CALCULATION                                            │
│    📍 razor-executor.ts (regel 855-869)                         │
│    - SL = currentPrice * (1 - 0.005) = -0.5%                    │
│    - TP = currentPrice * (1 + 0.01) = +1.0%                     │
│    - Round to tick_size ($0.50)                                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. PLACE ORDERS (Deribit API)                                   │
│    📍 razor-executor.ts (regel 878-905)                         │
│    ① Entry: Market order (0.001 BTC)                            │
│    ② Stop Loss: Stop market @ -0.5% (reduce_only)               │
│    ③ Take Profit: Limit @ +1.0% (reduce_only)                   │
│    📞 backend/src/deribit-client.ts → placeBuyOrder()           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. DATABASE: Record trade                                       │
│    📍 backend/src/services/trade-history.ts                     │
│    - Save to SQLite: state/trades.db                            │
│    - Status: 'open'                                             │
│    - Entry price, SL, TP, order IDs                             │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. STRATEGY PAUSE                                               │
│    📍 razor-executor.ts (regel 945-950)                         │
│    - Status: 'position_open'                                    │
│    - analyze() STOPT met nieuwe signalen                        │
│    - Wacht op SL/TP hit...                                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ ⏳ WAITING... (position loopt)
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. SL/TP HIT! (Deribit sluit positie)                          │
│     - Prijs raakt SL ($94,525) of TP ($95,950)                  │
│     - Deribit execute reduce_only order                         │
│     - Positie = CLOSED                                          │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 11. AUTO-RESUME                                                 │
│     📍 razor-executor.ts → checkPositionAndResume() (580-640)   │
│     ① Detect: geen positie meer                                 │
│     ② Cleanup: cancel orphan SL/TP orders                       │
│     ③ Database: close trade, calculate PnL                      │
│     ④ Cooldown: 5 minuten wachten                               │
│     ⑤ Resume: status = 'analyzing' → zoek nieuwe signalen!      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
                 LOOP (terug naar stap 4)
```

---

## 🔧 BELANGRIJKSTE AANPASSINGEN

### 1️⃣ Trade Size Verhogen
**Bestand:** `backend/src/strategy-service.ts` (regel 370)
```typescript
tradeSize: strategy.config.tradeSize || 1000, // Was: 100
```

### 2️⃣ Stop Loss/Take Profit Aanpassen
**Bestand:** `backend/src/strategy-service.ts` (regel 371-372)
```typescript
stopLossPercent: strategy.config.stopLossPercent || 1.0,  // Was: 0.5
takeProfitPercent: strategy.config.takeProfitPercent || 2.0, // Was: 1.0
```

### 3️⃣ RSI Thresholds Aanpassen
**Bestand:** `backend/src/strategy-service.ts` (regel 376-377)
```typescript
rsiOversold: strategy.config.rsiOversold || 30,  // Was: 40
rsiOverbought: strategy.config.rsiOverbought || 70, // Was: 60
```

### 4️⃣ Cooldown Period Aanpassen
**Bestand:** `backend/src/strategy-service.ts` (regel 374)
```typescript
cooldownMinutes: strategy.config.cooldownMinutes || 10, // Was: 5
```

### 5️⃣ Leverage Aanpassen
**NIET IN CODE!** → Deribit.com → Account Settings → Margin

---

## 🎯 SAMENVATTING - Alle Kritieke Bestanden

| **Bestand** | **Verantwoordelijkheid** |
|------------|-------------------------|
| `backend/src/strategy-service.ts` | ✅ DEFAULT CONFIG (SL/TP/tradeSize/cooldown) |
| `backend/src/strategies/razor-executor.ts` | ✅ Strategy logica (signalen, orders, auto-resume) |
| `backend/src/deribit-client.ts` | ✅ Deribit API (orders plaatsen) |
| `backend/src/services/trade-history.ts` | ✅ Database tracking (PnL, history) |
| `state/trades.db` | ✅ SQLite database (trade records) |

**🚫 NIET IN CODE:**
- Leverage (Deribit account setting)
- Market data (Deribit WebSocket)

---

## 📚 EXTRA HULP NODIG?

### Wil je weten:
- ❓ **Hoe indicatoren berekend worden?** → Regel 390-500 in razor-executor.ts
- ❓ **Hoe candles gebouwd worden?** → Regel 200-300 in razor-executor.ts
- ❓ **Hoe orphan cleanup werkt?** → Regel 400-500 in razor-executor.ts
- ❓ **Hoe PnL berekend wordt?** → Regel 500-580 in razor-executor.ts

### Frontend UI:
- Trade history tabel: `src/components/metrics/TradeHistoryTable.tsx`
- Strategy status: `src/components/StrategyTradingCard.tsx`
- Metrics: `src/components/metrics/TradeStatsCards.tsx`

---

**✅ Je hebt nu EXACT overzicht van ALLES - van klik tot trade close!**
