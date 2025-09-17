# 📈 SPRINT 2: DASHBOARD & METRICS

*Sprint periode: Week 1-2*  
*Sprint Master: AI Assistant*  
*Duur: 4-5 dagen*

---

## 🎯 SPRINT DOEL
Complete dashboard header implementeren en metrics systeem met real-time data simulation opzetten.

---

## 👥 ROL TOEWIJZINGEN

### 💻 DEVELOPER (Primaire rol - 70%)
- Header componenten implementeren
- API integration voor metrics
- Real-time data streaming
- WebSocket implementatie
- State management setup

### 🎨 UI/UX DESIGNER (Secundaire rol - 25%)
- Premium UI polish
- Micro-interactions
- Icon system
- Visual feedback systems
- Modal designs

### 🏢 BUSINESS CONSULTANT (Support rol - 5%)
- Metrics logic validation
- Business requirements verification
- Emergency procedures definition

---

## 📋 SPRINT BACKLOG

### HIGH PRIORITY (Must Have)

#### 1. HEADER LOGO & BRANDING
**Rol:** 🎨 UI/UX Designer + 💻 Developer  
**Schatting:** 3 uur  
**Beschrijving:** Logo implementatie en branding
- [x] Logo assets integratie (Icon black.png, Icon yellow.png)
- [x] "Tradebaas" typography styling
- [x] Responsive logo behavior
- [x] Logo als home link functionality
- [x] Brand consistency check

#### 2. NAVIGATION SYSTEEM
**Rol:** 💻 Developer  
**Schatting:** 2 uur  
**Beschrijving:** Header navigation menu
- [x] Dashboard menu item (active state)
- [x] Strategy Management menu item
- [x] Active state visual indicators
- [ ] Mobile navigation (hamburger menu)
- [ ] Keyboard navigation support

#### 3. LIVE/DEMO TOGGLE
**Rol:** 💻 Developer + 🏢 Business Consultant  
**Schatting:** 4 uur  
**Beschrijving:** Mode switching met status indicators
- [x] Toggle switch component
- [x] Live mode status indicators:
  - [x] Groen bolletje (API OK)
  - [x] Oranje bolletje (API connecting)
  - [x] Rood bolletje (API error)
- [x] Demo mode always-on state (vaste demo-data)
- [x] Error modal implementatie
- [x] One-click error copy functionality

#### 4. WERELDKLOK SYSTEEM
**Rol:** 💻 Developer + 🎨 UI/UX Designer  
**Schatting:** 3 uur  
**Beschrijving:** Multi-timezone klok
- [x] Minimalistisch klok display
- [x] Real-time time updates
- [x] Timezone modal met 5 populaire zones:
  - UTC, New York, London, Tokyo, Sydney
- [x] Timezone selection
- [ ] Timezone persistence (gepland)
- [x] Smooth time format transitions

#### 5. THEME TOGGLE INTEGRATIE
**Rol:** 🎨 UI/UX Designer  
**Schatting:** 2 uur  
**Beschrijving:** Theme switcher in header
- [x] Maantje/zonnetje icon (outline only)
- [x] Header positioning
- [x] Smooth theme transitions
- [ ] Theme persistence validation (gepland)
- [ ] Icon animation on switch (later)

#### 6. EMERGENCY STOP FUNCTIONALITEIT
**Rol:** 💻 Developer + 🏢 Business Consultant  
**Schatting:** 4 uur  
**Beschrijving:** Critical stop functionality
- [x] Prominent rode stop knop (UI)
- [x] Confirmation modal implementatie
- [x] "Kill all bots" hook (frontend context)
- [x] "Close all trades" hook (backend API)
- [x] Emergency state management (BotsContext)
- [ ] Recovery procedures (Start All is aanwezig; verdere details later)

### HIGH PRIORITY (Must Have) - METRICS

#### 7. METRICS CONTAINER LAYOUT
**Rol:** 🎨 UI/UX Designer + 💻 Developer  
**Schatting:** 3 uur  
**Beschrijving:** 6 metrics cards responsive grid
- [x] Grid layout (3x2 desktop, 2x3 tablet, 1x6 mobile)
- [x] Card spacing en alignment
- [x] Responsive breakpoints
- [x] Loading states voor elke card
- [ ] Error states handling (gepland)

#### 8. EQUITY METRIC CARD
**Rol:** 💻 Developer  
**Schatting:** 1.5 uur  
**Beschrijving:** Equity display card
- [x] "Equity" titel styling
- [x] Geheel getal formatting
- [x] Live Deribit data (USDC equity)
- [x] Fallback UI (grijze streepjes)
- [ ] Number animation on updates (later)

#### 9. PNL METRIC CARD
**Rol:** 💻 Developer + 🎨 UI/UX Designer  
**Schatting:** 2.5 uur  
**Beschrijving:** Profit & Loss display
- [x] "PnL" titel styling
- [x] Period selector modal (1D, 1W, 1M, 6M, 1Y)
- [ ] Percentage/bedrag dual display (gepland)
- [ ] Kleur coding (groen/rood) (gepland)
- [ ] Trend indicators (later)

#### 10. WINRATE METRIC CARD
**Rol:** 💻 Developer  
**Schatting:** 2 uur  
**Beschrijving:** Winrate percentage display
- [x] "Winrate" titel styling
- [x] Percentage display (demo)
- [x] Period selector modal integration
- [ ] Progress bar visualization
- [ ] Historical data (realtime/simulatie)

#### 11. DRAWDOWN METRIC CARD
**Rol:** 💻 Developer  
**Schatting:** 2 uur  
**Beschrijving:** Drawdown display
- [x] "Drawdown" titel styling
- [x] Percentage display (demo)
- [x] Period selector modal
- [ ] Rood spectrum kleur coding
- [ ] Maximum drawdown highlighting

#### 12. WIN RATIO METRIC CARD
**Rol:** 💻 Developer  
**Schatting:** 2 uur  
**Beschrijving:** Win ratio display
- [x] "Win Ratio" titel styling
- [x] Ratio format display (demo)
- [x] Period selector modal
- [ ] Visual ratio representation
- [ ] Comparative indicators

#### 13. BOTS ACTIEF METRIC CARD
**Rol:** 💻 Developer + 🏢 Business Consultant  
**Schatting:** 2 uur  
**Beschrijving:** Active bots counter
- [x] "Bots Actief" titel styling (Trades Today als proxy)
- [x] Demo display
- [ ] Real-time status updates (gepland)
- [ ] Visual bot status indicators (gepland)
- [ ] Click voor bot details (later)

### MEDIUM PRIORITY (Should Have)

#### 14. MODAL SYSTEEM
**Rol:** 🎨 UI/UX Designer + 💻 Developer  
**Schatting:** 3 uur  
**Beschrijving:** Reusable modal system
- [ ] Modal overlay component
- [ ] Backdrop click closing
- [ ] ESC key closing
- [ ] Focus trap implementatie
- [ ] Animation transitions

#### 15. REAL-TIME DATA SIMULATION
**Rol:** 💻 Developer  
**Schatting:** 4 uur  
**Beschrijving:** Mock data streaming
- [ ] WebSocket mock server
- [ ] Real-time data updates
- [ ] Data validation
- [ ] Connection status handling
- [ ] Reconnection logic

---

## 📊 DAILY PROGRESS TRACKING

### DAG 1 (Vrijdag)
**Focus:** Header Foundation  
**Planned:** Taken 1, 2, 5  
**Rol:** 🎨 UI/UX Designer + 💻 Developer  

### DAG 2 (Maandag)
**Focus:** Live/Demo Toggle & Klok  
**Planned:** Taken 3, 4  
**Rol:** 💻 Developer + 🏢 Business Consultant  

### DAG 3 (Dinsdag)
**Focus:** Emergency Stop & Metrics Layout  
**Planned:** Taken 6, 7  
**Rol:** 💻 Developer + 🏢 Business Consultant  

### DAG 4 (Woensdag)
**Focus:** Metrics Cards (1-3)  
**Planned:** Taken 8, 9, 10  
**Rol:** 💻 Developer  

### DAG 5 (Donderdag)
**Focus:** Metrics Cards (4-6) & Real-time Data  
**Planned:** Taken 11, 12, 13, 15  
**Rol:** 💻 Developer  

---

## ✅ ACCEPTATIE CRITERIA

### HEADER FUNCTIONALITEIT
- [ ] Logo toont correct en is clickable
- [ ] Navigation menu werkt responsief
- [ ] Live/Demo toggle functioneert perfect
- [ ] Status indicators tonen correct
- [ ] Wereldklok update real-time
- [ ] Theme toggle werkt smooth
- [ ] Emergency stop toont confirmation

### METRICS FUNCTIONALITEIT
- [ ] Alle 6 cards renderen correct
- [ ] Real-time updates werken
- [ ] Period selector modals functioneren
- [ ] Responsive grid werkt op alle devices
- [ ] Loading states zijn duidelijk
- [ ] Error states worden getoond
- [ ] Number animations zijn smooth

### KWALITEIT CRITERIA
- [ ] Performance < 100ms updates
- [ ] Geen memory leaks in real-time updates
- [ ] Error handling is robust
- [ ] Accessibility compliance
- [ ] Cross-browser compatibility

---

## 🔬 SPRINT REVIEW PLANNING

### DEMO ONDERDELEN
- [ ] Complete header functionaliteit
- [ ] Live/Demo toggle met status
- [ ] Wereldklok met timezone switching
- [ ] Emergency stop confirmation flow
- [ ] Alle 6 metrics cards
- [ ] Real-time data simulation
- [ ] Responsive behavior
- [ ] Theme switching integration

---

## 🔗 VOLGENDE SPRINT VOORBEREIDING

### SPRINT 3 DEPENDENCIES
- Header layout vastgesteld
- Metrics data structuur gedefinieerd
- Theme system volledig werkend
- Modal system beschikbaar voor trading cards

---

*Voor daily updates zie: [Daily Progress](daily-progress.md)*  
*Voor technische review zie: [Technical Review](technical-review.md)*

---

### Statusnotitie (2025-09-17)

- Header gepolijst met LIVE/DEMO badge, consistente spacing en werkende connectiviteitsindicator.
- Emergency STOP flow operationeel: annuleert open orders, sluit posities, stopt bots; START hervat bots.
- Per-bot STOP/START op trading cards; in live-modus sluit close-position endpoint de betreffende positie.
- Metrics tonen demo-waarden; Balance laadt live via Deribit equity endpoint.