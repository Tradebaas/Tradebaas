# Complete Strategy Card Flow - Gebruikershandleiding

**Versie:** 2.0  
**Datum:** 8 November 2025  
**Status:** ✅ PRODUCTION SPECIFICATION

---

## Inhoudsopgave

1. [Overzicht](#overzicht)
2. [Strategy Card Elementen](#strategy-card-elementen)
3. [Complete Flow Scenario's](#complete-flow-scenarios)
4. [Status Badge Mapping](#status-badge-mapping)
5. [Button Logica](#button-logica)
6. [Velden & Dropdowns](#velden--dropdowns)
7. [Meldingen & Waarschuwingen](#meldingen--waarschuwingen)
8. [Edge Cases](#edge-cases)

---

## Overzicht

De Strategy Card is het **centrale controle paneel** voor trading strategieën. Gebruikers kunnen hier:

- ✅ Een strategie selecteren
- ✅ Risico instellen (percentage of vast bedrag)
- ✅ Strategie starten/stoppen/herstarten
- ✅ Live status zien (analyseert, gepauzeerd, gestopt)
- ✅ Open posities monitoren
- ✅ Strategie wisselen terwijl positie open staat

**Kernprincipe:** Posities ### Do's ✅ (24/7 Trading Best Practices)

1. **24/7 is default** - Auto-resume ALTIJD enabled na "Start Trading"
2. **Settings altijd editabel** - Dropdown & risk slider werken tijdens elke status
3. **Simpele button logica** - "Start Trading" of "Stop Trading", niets ertussen
4. **Posities heilig** - Nooit automatisch sluiten bij status change
5. **Auto-resume = robuust** - Werkt na SL, TP, handmatig sluiten, refresh, crash
6. **Confirm bij stop tijdens positie** - Voorkomt onbedoeld stoppen van 24/7
7. **Orphan position support** - Start in paused mode, auto-resume na close
8. **Strategie switch** - Kan tijdens positie, nieuwe strategie auto-start na closeLTIJD open tot SL/TP hit of handmatig sluiten, ongeacht strategy status.

---

## Strategy Card Elementen

### 1. Header
```
┌─────────────────────────────────────────────────────────┐
│ STRATEGIE                    [Status Badge]  [Eye Icon] │
└─────────────────────────────────────────────────────────┘
```

**Status Badge Kleuren:**
- 🔴 **Grijs** - "Gestopt" (strategy inactief)
- 🟡 **Blauw** - "Analyseert" (strategy monitort markt)
- 🟢 **Groen** - "Actief" (order geplaatst, nog niet filled)
- 🟠 **Oranje** - "Gepauzeerd (Positie Open)" (positie open, strategy wacht)

**Eye Icon:** Opent Analysis Modal met live checkpoints en indicators

---

### 2. Dropdown: "Selecteer strategie"

```
┌──────────────────────────────┐
│ Selecteer strategie     [▼]  │
│                              │
│ ┌──────────────────────────┐ │
│ │ EMA-RSI Scalper          │ │
│ │ Fast Test                │ │
│ │ Vortex                   │ │
│ │ Razor               [✓]  │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Gedrag:**
- ✅ **Altijd editbaar** (behalve als disclaimer niet geaccepteerd)
- ✅ Toont laatst gebruikte strategie als default
- ✅ Kan gewisseld worden tijdens elke status
- ✅ Wijziging wordt opgeslagen in localStorage als `last-active-strategy`
- ✅ Bij switchen tijdens positie: nieuwe strategie start na positie sluiten

**Disabled wanneer:**
- ❌ Disclaimer niet geaccepteerd (rode melding verschijnt)
- ❌ Niet verbonden met broker

---

### 3. Dropdown: "Risico per trade"

```
┌──────────────────────────────┐
│ Risico per trade        [▼]  │
│                              │
│ ┌──────────────────────────┐ │
│ │ Percentage van equity [✓]│ │
│ │ Vast bedrag (USDC)       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Gedrag:**
- ✅ **Altijd editbaar** (behalve als disclaimer niet geaccepteerd)
- ✅ Switch tussen "Percentage van equity" en "Vast bedrag (USDC)"
- ✅ Wijziging geldt voor **volgende trade** (niet huidige positie)
- ✅ Waarde wordt opgeslagen in localStorage

**Disabled wanneer:**
- ❌ Disclaimer niet geaccepteerd
- ❌ Niet verbonden met broker

---

### 4. Risk Slider

```
┌──────────────────────────────┐
│        1.0%                  │
│  [-]  ═════●═══════  [+]     │
│                              │
│ Risico als percentage van    │
│ equity                       │
└──────────────────────────────┘
```

**Percentage Mode:**
- Min: 0.5%
- Max: 50%
- Step: 0.5%
- Default: 1.0%

**Vast Bedrag Mode:**
- Min: $10
- Max: 50% van balance
- Step: $10
- Default: $10

**Gedrag:**
- ✅ **Altijd editbaar**
- ✅ [-] button verlaagt waarde met 1 step
- ✅ [+] button verhoogt waarde met 1 step
- ✅ Direct opgeslagen bij wijziging

---

### 5. Trading Control Button

```
┌────────────────────────────────────────┐
│  [▶]  Start Trading                    │  ← Status: Stopped
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  [⏸]  Stop Trading                     │  ← Status: Analyzing
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  [⏸]  Stop Trading                     │  ← Status: Active
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  [⏸]  Stop Trading                     │  ← Status: Paused (positie open)
└────────────────────────────────────────┘
```

**Kernprincipe: 24/7 Trading by Default**
- **"Start Trading"** = Start automatische trading cyclus (blijft draaien tot user stopt)
- **"Stop Trading"** = Stop ALLE trading activiteit (ook auto-resume)
- Auto-resume is ALTIJD actief (behalve als user expliciet stopt)
- Simpel: 1 button, 2 states, duidelijk gedrag

**Button Text Logica:**

| Status      | Positie Open | Button Text      | Icon | Auto-Resume | Notities |
|-------------|-------------|------------------|------|-------------|----------|
| `stopped`   | Nee         | "Start Trading"  | ▶    | N/A         | Inactief, wacht op user |
| `stopped`   | Ja (orphan) | "Start Trading"  | ▶    | N/A         | Orphan positie (manual trade) |
| `analyzing` | Nee         | "Stop Trading"   | ⏸    | ✅ Enabled  | Monitort markt, 24/7 actief |
| `active`    | Nee         | "Stop Trading"   | ⏸    | ✅ Enabled  | Order geplaatst, 24/7 actief |
| `paused`    | Ja          | "Stop Trading"   | ⏸    | ✅ Enabled  | Wacht op position close, dan auto-resume |

**BELANGRIJKE REGELS voor 24/7 Trading:**
1. **Auto-resume is ALTIJD actief** - Strategie hervat automatisch na positie sluiten
2. **"Stop Trading" = Volledige stop** - Disabled auto-resume EN stopt monitoring
3. **Simpele state machine** - Alleen `stopped` of "actief" (analyzing/active/paused)
4. **Paused ≠ Stopped** - Paused = wacht op position close, Stopped = user heeft gestopt
5. **24/7 mode** - Eenmaal gestart blijft strategie draaien tot user stopt

**Disabled wanneer:**
- ❌ Disclaimer niet geaccepteerd
- ❌ Niet verbonden met broker
- ❌ Geen strategie geselecteerd (alleen bij status = `stopped`)

---

### 6. Waarschuwing Banner

```
┌────────────────────────────────────────────────────┐
│ ⚠️ Er staat een positie open. De strategie is     │
│    gepauzeerd en zal automatisch herstarten na    │
│    sluiten van de positie.                        │
└────────────────────────────────────────────────────┘
```

**Verschijnt wanneer:**
- Status = `paused`
- EN positie is open
- Kleur: Oranje achtergrond (bg-warning/10)

**Verdwijnt wanneer:**
- Positie sluit (auto-resume naar `analyzing`)
- User klikt "Stop Trading" (status → `stopped`)

**Tekst aanpassing:**
```
⚠️ Er staat een positie open. De strategie is gepauzeerd en hervat
   automatisch zodra de positie sluit. Klik "Stop Trading" om 
   auto-resume uit te schakelen.
```

---

## Complete Flow Scenario's

### Scenario 1: Normale Trade Cyclus (Happy Path)

**Stap 1: Start 24/7 Trading**
```
Gebruiker:
  1. Selecteert "Razor" strategie
  2. Zet risico op 1.0% equity
  3. Klikt "Start Trading"

UI Update:
  - Status Badge: "Analyseert" (blauw)
  - Button: "Start Trading" → "Stop Trading"
  - Eye icon: Actief (kan klikken)
  - Auto-resume: ✅ ENABLED (zal automatisch blijven traden)

Backend:
  - Strategy start monitoring markt
  - Elke 30 seconden: Check RSI, EMA, volume
  - Checkpoints updaten in analysis modal
  - Save: last-active-strategy = "razor"
  - Set: wasStrategyStopped = false

Toast: "Trading gestart - 24/7 modus actief"
```

**Stap 2: Entry Signal**
```
Backend:
  - Detecteert entry signal (bijv. RSI < 40, momentum > 0.1%)
  - Plaatst OTOCO order (Entry + SL + TP)
  
UI Update:
  - Status Badge: "Actief" (groen)
  - Toast: "Entry order geplaatst"
  - Analysis modal: Shows entry signal details
```

**Stap 3: Order Filled → Positie Open**
```
Backend:
  - Entry order FILLED
  - Detecteert positie open
  - Auto-pauses strategy (status: 'paused')
  - SL/TP orders blijven actief
  - Strategy monitort position elke 5 seconden
  - Auto-resume: BLIJFT enabled (24/7 mode)

UI Update:
  - Status Badge: "Gepauzeerd (Positie Open)" (oranje)
  - Button: BLIJFT "Stop Trading"
  - Waarschuwing banner: Verschijnt met auto-resume tekst
  - Positie Card: Toont LONG/SHORT, entry, SL, TP, live PnL
  - Positie Card Header: "Strategie: Razor"
  
BELANGRIJK: 24/7 blijft actief! Strategy zal automatisch herstarten na position close.
```

**Stap 4: Wachten op SL/TP**
```
Backend:
  - Monitort SL/TP orders elke 5 seconden
  - Checkt: Zijn beide orders nog open?
  
UI:
  - Live PnL update (groen/rood)
  - Dropdown & Risk slider: Blijven editbaar!
  - Gebruiker KAN strategie wisselen
```

**Stap 5A: Take Profit Hit ✅ (AUTO-RESUME!)**
```
Backend:
  - TP order FILLED
  - SL order auto CANCELLED
  - Detecteert: beide orders weg → Positie closed
  - Checkt: wasStrategyStopped = false ✅ (24/7 mode!)
  - Checkt: last-active-strategy = "razor"
  - **IMMEDIATE AUTO-RESUME** → Status: 'paused' → 'analyzing'
  - Backend METEEN verder met monitoring

UI Update:
  - Status Badge: "Gepauzeerd" → "Analyseert" (oranje → blauw)
  - Button: BLIJFT "Stop Trading"
  - Waarschuwing banner: Verdwijnt
  - Positie Card: Verdwijnt
  - Toast: "✅ Positie gesloten (+$15.30) - 24/7 trading actief"
  
→ Cyclus herhaalt AUTOMATISCH vanaf Stap 1 (geen user actie nodig!)
→ Dit is 24/7 trading: Positie → SL/TP → Auto-resume → Nieuwe trade → Repeat ∞
```

**Stap 5B: Stop Loss Hit ❌ (AUTO-RESUME!)**
```
Backend:
  - SL order FILLED
  - TP order auto CANCELLED
  - Positie closed
  - Checkt: wasStrategyStopped = false ✅ (24/7 mode!)
  - **IMMEDIATE AUTO-RESUME** → 'analyzing'

UI Update:
  - Status Badge: "Gepauzeerd" → "Analyseert" (oranje → blauw)
  - Button: BLIJFT "Stop Trading"
  - Toast: "⚠️ Positie gesloten (-$8.50) - 24/7 trading actief"
  
→ Cyclus herhaalt AUTOMATISCH vanaf Stap 1
→ 24/7 mode blijft actief, ook na verlies!
```

---

### Scenario 2: Stop 24/7 Trading (Tijdens Positie)

**Stap 1: 24/7 Trading Actief, Positie Open**
```
Huidige State:
  - Status Badge: "Gepauzeerd (Positie Open)" (oranje)
  - Button: "Stop Trading"
  - Positie: LONG BTC @ $102,000
  - SL: $101,500 | TP: $102,500
  - Auto-resume: ✅ ENABLED (24/7 mode actief)
  - Waarschuwing: "Hervat automatisch na positie sluiten"
```

**Stap 2: Gebruiker Wil 24/7 Uitschakelen**
```
Scenario: User wil NIET dat strategie automatisch hervat na deze trade

Gebruiker:
  1. Ziet positie open
  2. Wil 24/7 mode stoppen (geen nieuwe trades)
  3. Klikt "Stop Trading"

Confirm Dialog (belangrijk!):
  ┌────────────────────────────────────────────────┐
  │ ⚠️ Weet je zeker dat je trading wilt stoppen? │
  │                                                │
  │ • Huidige positie blijft OPEN                 │
  │ • Auto-resume wordt UITGESCHAKELD             │
  │ • Geen nieuwe trades na positie sluiten       │
  │                                                │
  │  [Annuleer]  [Stop Trading]                   │
  └────────────────────────────────────────────────┘

Gebruiker: Klikt "Stop Trading"
```

**Stap 3: 24/7 Mode Gestopt**
```
Frontend:
  1. Call: stopStrategy(strategyId)
  2. Delete: last-active-strategy from KV
  3. Set: wasStrategyStopped = true ❌ (DISABLE auto-resume!)
  4. Status → 'stopped'
  5. Button → "Start Trading"

UI Update:
  - Status Badge: "Gestopt" (grijs)
  - Button: "Stop Trading" → "Start Trading"
  - Positie Card: BLIJFT zichtbaar (positie NOG OPEN!)
  - Waarschuwing banner: Verdwijnt
  - Toast: "⚠️ 24/7 trading gestopt - Positie blijft open, geen auto-resume"

Backend:
  - Stop monitoring loop
  - Positie blijft open met SL/TP
  - NO action na position close
```

**Stap 4: Positie Sluit Later (SL/TP)**
```
Backend:
  - TP hit, positie closed
  - Checkt: wasStrategyStopped = true ❌
  - Checkt: last-active-strategy = undefined
  - Action: **GEEN auto-resume!**

UI Update:
  - Status: BLIJFT 'stopped'
  - Button: BLIJFT "Start Trading"
  - Positie Card: Verdwijnt
  - Toast: "Positie gesloten (+$15.30) - Trading gestopt"
  
User moet nu HANDMATIG klikken op "Start Trading" om 24/7 weer te activeren!
```

---

### Scenario 3: Strategie Wisselen Tijdens 24/7 Trading

**Stap 1: 24/7 Trading Actief, Positie Open met Razor**
```
Current State:
  - Dropdown: "Razor" geselecteerd
  - Status: "Gepauzeerd (Positie Open)" (oranje)
  - Button: "Stop Trading"
  - Positie: LONG BTC @ $102,000
  - Auto-resume: ✅ ENABLED (24/7 mode)
```

**Stap 2: Gebruiker Wil Switchen naar Andere Strategie**
```
Scenario: User wil na deze trade met EMA-RSI Scalper verder

Gebruiker:
  1. Opent "Selecteer strategie" dropdown
  2. Selecteert "EMA-RSI Scalper"

UI Update:
  - Dropdown: "Razor" → "EMA-RSI Scalper"
  - Status: BLIJFT "Gepauzeerd (Positie Open)"
  - Button: BLIJFT "Stop Trading"
  - Positie Card: Toont NOG STEEDS "Strategie: Razor" (oude strategy)
  - Toast: "✅ Strategie gewisseld - EMA-RSI Scalper start na positie sluiten"

Backend/KV:
  - Save: last-active-strategy = "ema-rsi-scalper"
  - wasStrategyStopped: BLIJFT false (24/7 blijft actief!)
  
BELANGRIJK: Auto-resume blijft enabled! Switch gebeurt automatisch.
```

**Stap 3: Positie Sluit (SL/TP)**
```
Backend:
  - Detecteert positie closed
  - Checkt: wasStrategyStopped = false ✅ (24/7 mode!)
  - Leest: last-active-strategy = "ema-rsi-scalper"
  - **AUTO-START nieuwe strategie!** → EMA-RSI Scalper

UI Update:
  - Dropdown: BLIJFT "EMA-RSI Scalper" (was al correct)
  - Status Badge: "Gepauzeerd" → "Analyseert" (oranje → blauw)
  - Button: BLIJFT "Stop Trading"
  - Positie Card: Verdwijnt
  - Analysis Modal: Shows EMA-RSI checkpoints (NIET Razor!)
  - Toast: "✅ Positie gesloten (+$15.30) - EMA-RSI Scalper gestart"

→ 24/7 trading gaat verder met NIEUWE strategie!
→ Geen user actie nodig, volledige auto-switch!
```

---

### Scenario 4: Handmatig Positie Sluiten

**Stap 1: Positie Open**
```
State:
  - Status: "Gepauzeerd (Positie Open)"
  - Positie: SHORT BTC @ $102,000
  - SL: $102,500 | TP: $101,500
```

**Stap 2: Gebruiker Klikt "Sluit Positie"**
```
Confirm Dialog:
  ┌────────────────────────────────────────┐
  │ Weet je zeker dat je de positie wilt  │
  │ sluiten?                               │
  │                                        │
  │ Current PnL: -$5.20 (-0.05%)          │
  │                                        │
  │  [Annuleer]  [Bevestig Sluiten]       │
  └────────────────────────────────────────┘

Gebruiker: Klikt "Bevestig Sluiten"
```

**Stap 3: Backend Sluit Positie**
```
Backend:
  1. Plaatst market order (tegengestelde richting)
  2. Wacht op fill
  3. Annuleert SL + TP orders
  4. Positie = CLOSED
  5. Checkt: wasStrategyStopped = false ✅ (24/7 mode!)
  6. Checkt: last-active-strategy = "razor"
  7. **AUTO-RESUME** → Start strategy monitoring

UI Update:
  - Toast: "Positie handmatig gesloten (-$5.20) - 24/7 trading hervat"
  - Status Badge: "Gepauzeerd" → "Analyseert" (oranje → blauw)
  - Button: BLIJFT "Stop Trading"
  - Positie Card: Verdwijnt
  - Waarschuwing: Verdwijnt
  
→ 24/7 trading gaat verder, ook na handmatig sluiten!
```

---

### Scenario 5: Risk Settings Aanpassen Tijdens Positie

**Stap 1: Positie Open, 1% Risk**
```
State:
  - Positie: LONG @ $102,000 (geopend met 1% risk)
  - Risk Dropdown: "Percentage van equity"
  - Risk Slider: 1.0%
  - Status: "Gepauzeerd (Positie Open)"
```

**Stap 2: Gebruiker Verhoogt Risk naar 2.5%**
```
Gebruiker:
  1. Klikt [+] button 3x
  2. Slider: 1.0% → 1.5% → 2.0% → 2.5%

UI Update:
  - Risk Slider: "2.5%"
  - localStorage: risk-settings = { mode: 'percent', value: 2.5 }

Huidige Positie:
  - SL/TP blijven ONGEWIJZIGD
  - Position size blijft ONGEWIJZIGD
  - 2.5% geldt ALLEEN voor volgende trade!
```

**Stap 3: Positie Sluit + Nieuwe Trade**
```
Backend:
  - Positie closed (TP hit)
  - Auto-start strategy
  - Nieuwe trade signal
  - Berekent position size met 2.5% risk!
  - Grotere position size dan vorige trade

UI:
  - Nieuwe positie card toont grotere size
```

**Stap 4: Switch naar Vast Bedrag**
```
Gebruiker:
  1. Opent "Risico per trade" dropdown
  2. Selecteert "Vast bedrag (USDC)"

UI Update:
  - Risk Slider: Reset naar $10 (default)
  - Text onder slider: "Risico in USDC per trade"
  - Min: $10, Max: 50% van balance

Next Trade:
  - Uses fixed $10 risk (niet percentage!)
```

---

## Status Badge Mapping

### Status Bepaling Logica

```typescript
// In StrategyTradingCard.tsx
const actualStrategyStatus = backendStatus.isRunning ? 'active' : strategyStatus;
```

**Priority:**
1. Backend `isRunning` → 'active'
2. Frontend `strategyStatus` → 'stopped' | 'analyzing' | 'paused'

### Status Transities (24/7 Trading)

```
                    ┌─────────────────────────────────────────────┐
                    │         24/7 TRADING LOOP                   │
                    │                                             │
STOPPED → START → ANALYZING → SIGNAL → ACTIVE → FILLED → PAUSED ─┤
   ↑                  ↑                                           │
   │                  │                                           │
   │                  └───── Position Close (AUTO-RESUME) ────────┘
   │
   └──────────────── User clicks "Stop Trading"
```

**Transities Uitgelegd:**

| Van         | Naar        | Trigger                      | Button Changes               | Auto-Resume |
|-------------|-------------|------------------------------|------------------------------|-------------|
| `stopped`   | `analyzing` | User clicks "Start Trading"  | "Start" → "Stop Trading"    | ✅ Enabled  |
| `analyzing` | `active`    | Entry signal detected        | Badge: Blauw → Groen        | ✅ Enabled  |
| `active`    | `paused`    | Order filled (position open) | Button BLIJFT "Stop"        | ✅ Enabled  |
| `paused`    | `analyzing` | Position closes (AUTO!)      | Button BLIJFT "Stop"        | ✅ Enabled  |
| `analyzing` | `stopped`   | User clicks "Stop Trading"   | "Stop" → "Start Trading"    | ❌ Disabled |
| `active`    | `stopped`   | User clicks "Stop Trading"   | "Stop" → "Start Trading"    | ❌ Disabled |
| `paused`    | `stopped`   | User clicks "Stop Trading"   | "Stop" → "Start Trading"    | ❌ Disabled |

**24/7 Trading KEY POINTS:**
- **Auto-resume = Default** - Eenmaal gestart blijft strategie draaien tot user stopt
- **`paused` → `analyzing` = AUTOMATIC** - Geen user actie nodig, instant resume
- **"Stop Trading" = Volledige stop** - Zet auto-resume UIT, ook tijdens positie
- **Infinite loop** - analyzing → active → paused → analyzing → ... (tot user stopt)
- **User controle** - 1 button: "Start Trading" (enable 24/7) of "Stop Trading" (disable 24/7)

---

## Button Logica

### Click Handlers (24/7 Trading)

**Button: "Start Trading"**
```typescript
Conditie: actualStrategyStatus === 'stopped'

Action:
  1. Validate: selectedStrategy niet leeg
  2. Call: startStrategy(selectedStrategy)
  3. Backend: Start monitoring loop
  4. UI Update: 
     - Status → 'analyzing'
     - Button: "Start Trading" → "Stop Trading"
  5. Save: last-active-strategy = selectedStrategy (to KV)
  6. Set: wasStrategyStopped = false ✅ (ENABLE 24/7 mode!)
  7. Toast: "✅ 24/7 trading gestart - Strategie blijft draaien tot je stopt"
  
Special Case - Orphan positie open:
  - Strategy start WEL
  - Status: 'stopped' → 'paused' (niet analyzing!)
  - Button: "Stop Trading"
  - Strategy wacht tot positie sluit, dan auto-resume naar analyzing
  - Toast: "⚠️ Positie gedetecteerd - 24/7 start na positie sluiten"
```

**Button: "Stop Trading"** (tijdens analyzing/active - GEEN positie)
```typescript
Conditie: (actualStrategyStatus === 'analyzing' || actualStrategyStatus === 'active') 
          && !activePosition

Action:
  1. Call backend: stopStrategy(strategyId)
  2. Stop monitoring loop
  3. Status → 'stopped'
  4. Button: "Stop Trading" → "Start Trading"
  5. Delete: last-active-strategy from KV
  6. Set: wasStrategyStopped = true ❌ (DISABLE 24/7 mode!)
  7. Toast: "Trading gestopt"
  
Result: Clean stop, geen positie, geen auto-resume
```

**Button: "Stop Trading"** (tijdens paused - POSITIE OPEN!)
```typescript
Conditie: actualStrategyStatus === 'paused' && activePosition

CRITICAL: Show confirm dialog first! (zie Scenario 2)

After Confirm:
  1. Call backend: stopStrategy(strategyId)
  2. Status → 'stopped'
  3. Button: "Stop Trading" → "Start Trading"
  4. Delete: last-active-strategy from KV
  5. Set: wasStrategyStopped = true ❌ (DISABLE 24/7 mode!)
  6. Toast: "⚠️ 24/7 trading gestopt - Positie blijft open, geen auto-resume"
  7. Positie Card: BLIJFT zichtbaar!
  
IMPORTANT:
  - Positie blijft open met SL/TP
  - Na SL/TP hit: GEEN auto-resume
  - User moet handmatig "Start Trading" klikken om 24/7 weer te activeren
  - Confirm dialog voorkomt onbedoeld stoppen
```

### Disabled States

```typescript
button.disabled = 
  tradingBlocked ||              // Disclaimer not accepted
  !isConnected ||                // Not connected to broker
  (actualStrategyStatus === 'stopped' && !selectedStrategy)  // Can't start without strategy
```

**In Plain English:**
- Button ALTIJD disabled als disclaimer niet geaccepteerd
- Button ALTIJD disabled als niet verbonden met broker
- Button disabled als status = 'stopped' EN geen strategie geselecteerd
- Button NOOIT disabled tijdens analyzing/active/paused (kan altijd stoppen!)

---

## Velden & Dropdowns

### Selecteer Strategie Dropdown

**Disabled Logica:**
```typescript
disabled={tradingBlocked}  // ONLY disclaimer check!
```

**Value Source Priority:**
```typescript
1. User manual selection (currentSelectedStrategy)
2. Saved from KV (last-active-strategy)
3. Backend strategy name (converted to ID)
```

**Strategy ID ↔ Name Mapping:**
```typescript
// Frontend dropdown uses IDs
"ema-rsi-scalper"    → EMA-RSI Scalper
"fast-test-strategy" → Fast Test
"third-iteration"    → Vortex
"razor"              → Razor

// Backend uses friendly names
strategyNameToId("EMA-RSI Scalper") → "ema-rsi-scalper"
strategyIdToName("razor") → "Razor"
```

**OnChange Handler:**
```typescript
setSelectedStrategy(newValue)
  → Save to store
  → Save to KV as 'last-active-strategy'
  → If status = 'paused': Queue for after position close
```

---

### Risico per Trade Dropdown

**Options:**
- "Percentage van equity" (default)
- "Vast bedrag (USDC)"

**Disabled Logica:**
```typescript
disabled={tradingBlocked}  // ONLY disclaimer check!
```

**OnChange Handler:**
```typescript
handleRiskModeChange(mode: 'percent' | 'fixed')
  → Reset slider to default (1% or $10)
  → Save to store: { mode, value: default }
  → Update slider label text
```

---

## Meldingen & Waarschuwingen

### Toast Messages

**Success (Green):**
- "Strategie gestart"
- "Strategie hervat - Start automatisch na sluiten van positie"
- "✓ Strategie in wachtrij - Start automatisch zodra positie sluit"

**Info (Blue):**
- "Strategie gepauzeerd - Wordt automatisch hervat na sluiten van positie"
- "Backend strategy gestopt"

**Error (Red):**
- "Accepteer eerst de disclaimer om trade functionaliteit te gebruiken"
- "Kon backend strategy niet stoppen"
- "Kan strategie niet starten: [error message]"

### Waarschuwing Banners

**Positie Open Banner (Orange):**
```
⚠️ Er staat een positie open. De strategie is gepauzeerd en zal
   automatisch herstarten na sluiten van de positie.
```
- Verschijnt: Status = 'paused' && activePosition exists
- Kleur: bg-warning/10, border-warning/30, text-warning

**Disclaimer Banner (Red):**
```
❌ Accepteer disclaimer om te kunnen traden [Open disclaimer]
```
- Verschijnt: tradingBlocked = true
- Link: Opens disclaimer modal

---

## Edge Cases

### Edge Case 1: Dropdown Gaat Leeg

**Probleem:**
- Gebruiker selecteert "Razor"
- Backend polling draait elke 3 seconden
- Backend retourneert strategyName: "Razor" (friendly name)
- Frontend zet selectedStrategy: "Razor"
- Dropdown verwacht ID: "razor"
- Result: Dropdown wordt leeg!

**Oplossing:**
```typescript
// In startBackendStatusPolling()
const backendStrategyId = strategyNameToId(status.strategyName);
const currentSelectedStrategy = get().selectedStrategy;

// Priority: User selection > Saved > Backend
const strategyToUse = currentSelectedStrategy || savedStrategyId || backendStrategyId;

set({ selectedStrategy: strategyToUse });
```

---

### Edge Case 2: Meerdere Strategieën op Backend

**Probleem:**
- Gebruiker start Razor
- Browser crash/refresh
- Start weer Razor
- Nu draaien 2x Razor op backend!

**Oplossing:**
- Backend moet single strategy enforcement hebben
- Before starting new strategy: Stop all existing
- Use killSwitch endpoint to clean all strategies

---

### Edge Case 3: Page Refresh Tijdens Positie

**Probleem:**
- Positie open, status = 'paused'
- User refresht page
- Frontend state lost
- Status wordt 'stopped' in plaats van 'paused'

**Oplossing:**
```typescript
// In checkForOpenPosition()
if (openPosition) {
  const isRunningOnBackend = statusResult.isRunning;
  
  // If position exists but backend NOT running → paused!
  const positionStatus = isRunningOnBackend ? 'in-position' : 'paused';
  
  set({ strategyStatus: positionStatus });
}
```

---

### Edge Case 4: Orphan Position (24/7 Start met Open Positie)

**Scenario:**
- User plaatst manual trade op exchange (of vorige session crashed)
- Position open, maar geen strategy actief
- Frontend detecteert orphan position
- User wil 24/7 trading starten

**Gedrag (24/7 Friendly!):**
```
UI Shows:
  - Status Badge: "Gestopt" (grijs) maar positie card zichtbaar!
  - Button: "Start Trading"
  - Dropdown: Selecteer strategie mogelijk
  - Positie Card: Shows position (strategyName = undefined)
  - Waarschuwing: "Orphan positie gedetecteerd"

User Actions:
  1. Selecteer strategie in dropdown (bijv. "Razor")
  2. Klik "Start Trading"
  3. Strategy start IN PAUSED MODE! ✅
  4. Toast: "⚠️ Positie gedetecteerd - 24/7 start na positie sluiten"

UI Update:
  - Status: 'stopped' → 'paused'
  - Button: "Start Trading" → "Stop Trading"
  - Positie Card: Updates strategyName = "Razor"
  - Auto-resume: ✅ ENABLED

When Position Closes:
  - Backend: Checkt wasStrategyStopped = false
  - Action: AUTO-RESUME naar analyzing
  - Toast: "Positie gesloten - 24/7 trading gestart"
  - 24/7 loop start nu!

BELANGRIJK: Dit maakt recovery robuust! Crash/refresh = geen probleem.
```

---

### Edge Case 5: Backend Restart Tijdens Trade

**Scenario:**
- Strategy running, positie open
- Backend crash/restart (PM2 auto-restart)
- Frontend polling detecteert disconnect

**Gedrag:**
```
Frontend:
  1. Polling detecteert: backend not connected
  2. Checkt: manuallyDisconnected flag = false
  3. Action: KEEP current state (don't set 'Stopped')
  4. Wait for backend reconnect
  5. On reconnect: Reconcile state
  6. If position still open → Set 'paused'
  7. If no position → Set 'stopped'
```

---

## Samenvatting

### Do's ✅

1. **Settings altijd editbaar** - Dropdown & risk slider werken altijd (behalve disclaimer)
2. **Status duidelijk** - Badge kleur + text match precies de state
3. **Button text status-based** - stopped → "Herstart", rest → "Stop"
4. **Posities heilig** - Nooit automatisch sluiten bij status change
5. **Paused = Actief** - Strategy monitort nog steeds (wacht op position close)
6. **Auto-resume default** - Strategie hervat NA position close (behalve als user "Stop" klikt tijdens paused)
7. **Stop tijdens paused** - Disabled auto-resume (wasStrategyStopped = true)

### Don'ts ❌

1. **Niet dropdown disablen** - Alleen bij disclaimer/disconnect, altijd editabel tijdens trading
2. **Niet positie sluiten** - Bij "Stop Trading" blijft positie open
3. **Niet auto-resume disablen** - Standaard altijd enabled (24/7 mode)
4. **Niet status overschrijven** - Backend polling respecteert user selection
5. **Niet meerdere strategies** - Backend moet single strategy enforcement hebben
6. **Niet zonder confirm stoppen** - Bij positie open: toon confirm dialog
7. **Niet orphan positions blokkeren** - Support start in paused mode

---

---

## 24/7 Trading Samenvatting

**Voor de gebruiker:**
```
1. Selecteer strategie + risico
2. Klik "Start Trading"
3. Laat lopen → Infinite loop van trades
4. Klik "Stop Trading" als je wilt stoppen
```

**Wat er automatisch gebeurt:**
- ✅ Entry signals detecteren
- ✅ Orders plaatsen (OTOCO)
- ✅ Positie monitoring
- ✅ Auto-resume na SL/TP
- ✅ Risk management
- ✅ Recovery na crash/refresh
- ✅ Strategie switchen
- ✅ 24/7 blijft draaien

**User hoeft alleen:**
- ❌ GEEN handmatige restart na trade
- ❌ GEEN positie management
- ❌ GEEN monitoring
- ✅ Alleen "Start Trading" en klaar!

---

**Documentatie Compleet ✅**

Dit document beschrijft de **24/7 trading flow** - de meest schaalbare, logische en robuuste oplossing.
