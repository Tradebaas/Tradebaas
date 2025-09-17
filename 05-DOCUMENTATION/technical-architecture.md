# 🏗️ TRADEBAAS TECHNICAL ARCHITECTURE

Versie: 1.1  
Datum: 13 september 2025  
Architect: AI Assistant (Developer)

---

## 📋 Overzicht

Tradebaas draait als een Next.js App Router applicatie met server-side API routes. Er is geen aparte backend-service of database in deze fase. Broker-integratie (Deribit) verlopen direct via API routes (server components) met OAuth-token caching.

### High-level
```
┌──────────────────────────────────────────────────────────────┐
│                  Next.js (App Router)                        │
│  - UI (React, Tailwind)                                      │
│  - API Routes (server-only, Deribit, metrics, emergency)     │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     Deribit JSON-RPC v2 API
```

---

## 🎨 Frontend

- Framework: Next.js 15 (App Router)
- Taal: TypeScript
- Styling: Tailwind CSS (+ utility `.text-stack` voor consistente verticale spacing)
- Interactie: Modals voor Strategy en Details, status dot, STOP/Start knoppen
- Data-refresh: SWR-achtig verversen om flicker te verminderen

Mappen (belangrijk):
- `src/app/dashboard/page.tsx` — hoofd-dashboard en metrics
- `src/components/ui/TradingCard.tsx` — botkaart, PnL, entry/SL/TP, acties
- `src/components/ui/Modal.tsx` — basis modal componenten
- `src/lib/deribit.ts` — compacte Deribit client met OAuth caching

UI conventies:
- Typografie: normal-case, font-normal (geen bold/caps), STOP-knoppen wel uppercase
- Kleuren: SL rood, TP groen (emerald-400), PnL groen/rood afhankelijk van teken
- Layout: actieknoppen onderaan, consistente tussenruimtes via `.text-stack`

---

## 🔌 API Routes

Pad-prefix: `/api`

- Deribit
  - `GET /api/deribit/balance` — account balance (USDC)
  - `GET /api/deribit/debug` — debug-info/test calls

- Emergency
  - `POST /api/emergency/close-all` — sluit alle posities en annuleert orders (bevestiging in UI)
  - `POST /api/emergency/close-position` — sluit positie per instrument

- Strategy
  - `GET /api/strategy/bots` — mapping van bots naar instrumenten
  - `POST /api/strategy/mode` — set Live/Demo (in-memory)

- Metrics
  - `GET /api/metrics/today` — dag-metrics
  - `GET /api/metrics/period` — periode-metrics

Opmerking: De metrics bevatten placeholders voor bepaalde berekeningen (winrate, ratio, drawdown). Deze worden stapsgewijs uitgebreid.

---

## 🔑 Secrets & Config

Gebruik `.env.local` in `03-DEVELOPMENT/frontend`:

- `DERIBIT_CLIENT_ID`, `DERIBIT_CLIENT_SECRET` — uitsluitend server-side gebruikt
- `DERIBIT_ENV=prod|test` — schakel tussen productie en testnet
- `NEXT_PUBLIC_*` — alleen niet-gevoelige waarden naar de client

Nooit echte secrets committen. Let op dat API routes de secrets niet in responses lekken.

---

## 🔒 Security

- OAuth flow naar Deribit met token caching op de server
- Geen opslag van secrets in de client bundle
- Confirm-modals voor risico-acties (STOP)
- In-memory state voor modus en bot-mapping (geen persistency buiten server process)

---

## � Development & Deploy

- Lokale ontwikkeling: `npm run dev` (poort 3000)
- Docker dev: `docker-compose.dev.yml` start frontend container
- Build: `npm run build`, Start: `npm start`

---

## � Status en next steps

- UI/UX afgerond: spacing, typografie, kleurregels, modals, acties onderaan
- Drawdown-metric toont %; overige metrics aanwezig (berekening iteratief)
- Documentatie opgeschoond naar Next.js-only setup

Toekomst:
- Uitbreiding metrics-berekeningen (winrate/drawdown/ratio)
- Eventuele backend of persistente opslag indien nodig

Zie ook `PROJECT-STATUS-DASHBOARD.md` en `02-SPRINTS/`.
