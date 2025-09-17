# 🎯 TRADEBAAS MVP SPECIFICATION

*Document versie: 1.1*  
*Datum: 17 september 2025*  
*Auteur: Business Consultant & UI/UX Designer*

---

## 📱 INTERFACE OVERVIEW

### LAYOUT STRUCTUUR
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                      │
├─────────────────────────────────────────────────────────────┤
│ METRICS CONTAINER (6 cards)                                │
├─────────────────────────────────────────────────────────────┤
│ TRADING CARDS CONTAINER (3 premium cards)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔝 HEADER SPECIFICATIES

### 1. LOGO SECTIE (Links)
- **Position:** Top-left corner
- **Assets:** Icon black.png & Icon yellow.png
- **Typography:** Stoere font - "Tradebaas"
- **Behavior:** Logo als home link

### 2. NAVIGATIE MENU (Midden)
- **Items:** 
  - Dashboard (active state)
  - Strategy Management
- **Style:** Minimalistisch, horizontaal
- **Active State:** Visual indicator voor huidige pagina

### 3. LIVE/DEMO TOGGLE (Rechts)
- **Type:** Minimalistisch schuif toggle
- **Default:** Live modus (persistent via localStorage)
- **States:**
  - **Live:** Groen bolletje (Deribit API OK + USDC balance available)
  - **Live:** Oranje bolletje (Deribit API connecting)
  - **Live:** Rood bolletje (Deribit API error/unauthorized) → Clickable voor error modal
  - **Demo:** Simulated USDC futures data
- **Error Modal:** 
  - Centered modal
  - Deribit API error details
  - One-click copy functie
  - Link naar Deribit API credentials setup

### 4. WERELDKLOK (Rechts)
- **Display:** Minimalistisch klok design
- **Click Action:** Modal met 5 populaire tijdzones
- **Zones:** UTC, NY, London, Tokyo, Sydney
- **Selection:** Direct timezone switch

### 5. THEME TOGGLE (Rechts)
- **Icon:** Maantje/zonnetje (outline only)
- **Default:** Dark theme
- **States:** Dark ↔ Light theme switch

### 6. EMERGENCY STOP (Rechts)
- **Style:** Prominente rode knop
- **Action:** Kill ALL bots + close ALL trades
- **Confirmation:** Modal met "Weet je het zeker?"
- **Effect:** Immediate stop van alle trading activiteit

---

## 📊 METRICS CONTAINER

### LAYOUT
6 metric cards in grid layout (3x2 op desktop, 2x3 op tablet, 1x6 op mobile)

### CARD 1: EQUITY
- **Title:** "Equity USDC"
- **Data:** Geheel getal USDC (afgerond) van Deribit account
- **Source:** Deribit get_account_summary API (live) — geïmplementeerd
- **Fallback:** Grijze streepjes bij geen Deribit connection

### CARD 2: PNL
- **Title:** "PnL USDC"
- **Data:** USDC bedrag + percentage (demo voorlopig)
- **Click Action:** Period selector modal (1D, 1W, 1M, 3M, 1Y)
- **Colors:** Groen (positief), rood (negatief)
- **Source:** Calculated from Deribit trades + unrealized PnL

### CARD 3: WINRATE
- **Title:** "Winrate"
- **Data:** Percentage van profitable USDC futures trades (demo voorlopig)
- **Click Action:** Period selector modal
- **Display:** Progress bar + percentage
- **Calculation:** (Winning trades / Total closed trades) * 100

### CARD 4: DRAWDOWN
- **Title:** "Drawdown"
- **Data:** Percentage (max peak-to-trough in USDC) (demo voorlopig)
- **Click Action:** Period selector modal
- **Color:** Rood spectrum
- **Calculation:** From Deribit equity curve

### CARD 5: WIN RATIO
- **Title:** "Win Ratio"
- **Data:** Ratio (bijv. 2.5:1) Average Win USDC / Average Loss USDC (demo voorlopig)
- **Click Action:** Period selector modal
- **Display:** Ratio format
- **Calculation:** From completed Deribit futures trades

### CARD 6: BOTS ACTIEF
- **Title:** "Bots Active"
- **Data:** Aantal (bijv. 2/3) met active USDC futures positions (later; nu "Trades Today" als proxy)
- **Logic:** Bots met open Deribit positions of pending orders
- **Real-time:** Direct update via Deribit WebSocket

---

## 💳 TRADING CARDS CONTAINER

### VISUAL DESIGN
- **Style:** Premium creditcard appearance
- **Material:** Subtle gradients, shadows, premium feel
- **Alignment:** Perfect grid alignment, fixed positions
- **Responsiveness:** 3 cards horizontal, stack on mobile

### CARD TYPES & DERIBIT FUTURES STRATEGIES
1. **USDC FUTURES SCALPING:** High-frequency BTC/ETH USDC perpetuals
2. **FUTURES TREND FOLLOWING:** Multi-timeframe USDC futures (BTC/ETH/SOL)
3. **VOLATILITY ARBITRAGE:** Cross-contract USDC futures opportunities

### CARD ORDERING LOGIC
1. **Links:** Active USDC futures trades (open Deribit positions)
2. **Midden:** Manual setups (waiting for confirmation)
3. **Rechts:** Analyzing markets (scanning for setups)
4. **Meest Rechts:** Errors/Stopped

### PER CARD FUNCTIONALITEIT

#### AUTO/MANUAL TOGGLE
- **Position:** Top-right van card
- **Auto Mode:** 
  - 24/7 strategie monitoring
  - Automatische trade execution
  - Volledige autonomie
- **Manual Mode:**
  - Strategie monitoring
  - Setup detection
  - Manual confirmation required
  - "Place Trade" / "Skip" buttons
  - Setup expiry check

#### STRATEGY MANAGEMENT
- **Multiple Strategies:** Per card meerdere strategieën
- **Strategy Display:** Naam van actieve strategie
- **Click Action:** Setup explanation modal
- **Strategy Selector:** Dropdown voor strategy assignment

#### STATUS INDICATORS
- **Success:** Groene indicator
- **Warning:** Oranje indicator  
- **Error:** Rode indicator (clickable, error modal met copy — geïmplementeerd)
- **Processing:** Blauwe pulsing indicator

#### TRADE INFORMATION DISPLAY (Deribit USDC Futures)
- **Entry Price:** USDC price clearly marked
- **Stop Loss:** USDC stop price (red)
- **Take Profit:** USDC target price (green)
- **Leverage:** 1x-100x Deribit futures leverage display
- **Risk Amount:** USDC amount + percentage of equity
- **Position Size:** Contract size in USDC
- **Unrealized PnL:** Real-time USDC profit/loss
- **Trailing Options:** If active on Deribit position

#### CONTROL BUTTONS
- **Stop Button:** Altijd zichtbaar
  - **Active Trade:** Close position + stop analyzing
  - **Analyzing:** Stop market analysis
  - **Confirmation Modal:** "Weet je zeker?"
- **Start Button:** Verschijnt na stop
  - **Action:** Herstart card functionaliteit

#### MANUAL MODE SPECIFIEK (Deribit Integration)
- **Place Trade Button:** Groen, prominent
  - **Action:** Submit USDC futures order to Deribit
  - **Validation:** Real-time price check + margin requirement
  - **Pre-trade:** Show expected margin usage in USDC
- **Skip Trade Button:** Grijs, secundair
  - **Action:** Skip current setup, continue monitoring
- **Deribit Status:** Connection indicator for API health
  - **Action:** Verwerp setup, ga verder
  - **Confirmation:** Modal bevestiging

---

## 🎨 DESIGN SYSTEM

### COLOR PALETTE
- **Dark Theme (Default):**
  - Background: Deep dark greys
  - Cards: Subtle lighter greys
  - Accents: Premium golds/blues
  - Success: Green
  - Error: Red
  - Warning: Orange

- **Light Theme:**
  - Background: Clean whites
  - Cards: Subtle off-whites
  - Accents: Professional blues
  - Status colors blijven consistent

### TYPOGRAPHY
- **Headers:** Modern, stoer font (Tradebaas logo)
- **Body:** Clean, readable sans-serif
- **Numbers:** Monospace voor metrics
- **Buttons:** Medium weight, duidelijk

### INTERACTIONS
- **Hover States:** Subtle elevation/glow
- **Click Feedback:** Brief animation
- **Loading States:** Skeleton screens
- **Errors:** Non-intrusive notifications

---

## 🔧 TECHNICAL REQUIREMENTS

### PERFORMANCE
- **Load Time:** < 2 seconden initial load
- **Real-time Updates:** < 100ms latency
- **Responsive:** Smooth op alle devices
- **Offline Handling:** Graceful degradation

### DATA FLOW
- **Real-time:** WebSocket voor live data
- **Fallbacks:** REST API backup
- **Error Handling:** Retry logic
- **Data Validation:** Client + server side

### SECURITY
- **Authentication:** Secure login systeem
- **API Keys:** Encrypted storage
- **Session Management:** Timeout handling
- **Audit Trail:** Alle acties gelogd

---

## ✅ ACCEPTANCE CRITERIA

### FUNCTIONEEL
- [ ] Alle UI elementen renderen correct
- [ ] Real-time data updates werken
- [ ] Modal interactions functioneren
- [ ] Theme switching werkt perfect
- [ ] Emergency stop werkt binnen 1 seconde
- [ ] Trading cards sorteren automatisch
- [ ] Manual/Auto modes werken correct
- [ ] Strategy assignment werkt
- [ ] Error modals tonen juiste informatie

### TECHNISCH
- [ ] Responsive op alle schermformaten
- [ ] Cross-browser compatibiliteit
- [ ] Performance binnen specificaties
- [ ] Error handling compleet
- [ ] Security measures geïmplementeerd

### UX
- [ ] Intuïtieve navigatie
- [ ] Duidelijke visual feedback
- [ ] Consistent design language
- [ ] Accessibility compliance
- [ ] Loading states duidelijk

---

*Voor implementatie details zie sprint documenten in: [02-SPRINTS](../02-SPRINTS/)*  
*Voor technische specificaties zie: [Technical Architecture](../05-DOCUMENTATION/technical-architecture.md)*