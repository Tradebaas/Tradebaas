<div align="center">

# Tradebaas

Een minimalistische trading-dashboard (Next.js) met Live-first gedrag, safety-controls en Deribit-integratie via API routes.

</div>

## Wat is dit?

Tradebaas is een Next.js App Router project dat een compacte, snelle UI biedt voor het monitoren en bedienen van trading-bots. De app draait volledig als frontend met server-side API routes (geen aparte backend service). Broker-integratie is op dit moment gericht op Deribit (USDC Futures).

## Belangrijkste features

- Live-first modus (default) met duidelijke state (Live/Demo)
- Noodknoppen (Emergency STOP):
  - Globaal: sluit alle posities en annuleert orders
  - Per-bot: sluit positie voor specifiek instrument
  - Altijd met duidelijke confirm-modals
- Per-bot instrument mapping en status-indicator (subtle status dot)
- Strategie en Details als modals (overzichtelijk, non-blocking)
- Deribit-backed metrics:
  - Balance + refresh indicator (flicker-vrij updates)
  - Today/Period metrics (winrate, win/loss ratio, drawdown %) — data via API routes
- Consistente UI/UX:
  - Uniforme verticale spacing via utility `.text-stack`
  - Typografie normal-case, font-normal (geen bold/caps), behalve STOP-knoppen
  - Kleurregels: Stop loss rood, Take profit groen (emerald-400), PnL groen/rood naar teken
  - Actieknoppen altijd onderin de card (stabiele layout)

## Snel starten

Je kunt lokaal ontwikkelen met Node of via Docker.

### Optie A: Lokaal (aanbevolen tijdens ontwikkeling)

1) Ga naar de frontend map:
	- `03-DEVELOPMENT/frontend`
2) Installeer dependencies:
	- `npm install`
3) Start de dev server:
	- `npm run dev` (Turbopack, poort 3000)
4) Open de app:
	- http://localhost:3000

Handig: `npm run dev:clean` stopt eventuele vastgelopen processen en start schoon op.

### Optie B: Docker (compose)

1) Start de dev compose:
	- `docker compose -f docker-compose.dev.yml up --build`
2) Open de app:
	- http://localhost:3000

## Omgeving/Secrets

- Zie `03-DEVELOPMENT/frontend/.env.local` voor voorbeeld-variabelen.
- Deribit secrets (DERIBIT_CLIENT_ID/SECRET) zijn server-side only: zet deze alleen lokaal; commit nooit echte waarden.
- Schakel tussen prod en testnet met `DERIBIT_ENV=prod|test`.

## Developeren

- Scripts (in `03-DEVELOPMENT/frontend`):
  - `npm run dev` — Next.js dev server (Turbopack)
  - `npm run lint` / `npm run lint:fix`
  - `npm run type-check`
  - `npm run storybook` — UI-workbench (poort 6006)

## Architectuur in het kort

- Next.js App Router (TypeScript, Tailwind CSS)
- API routes voor Deribit (OAuth + JSON-RPC) en dashboard-metrics
- In-memory state voor modus (Live/Demo) en bot-mapping
- Geen aparte backend/database in deze fase

Meer details: `05-DOCUMENTATION/technical-architecture.md`.

## UI conventies

- Verticale spacing: `.text-stack` utility voor consistente tekstafstanden
- Typografie: normal-case, font-normal (geen bold/caps) — STOP-knoppen zijn uppercase
- Kleuren: stop loss rood, take profit emerald-400, PnL groen/rood afhankelijk van teken

## Status & Roadmap

- UI/UX foundations staan (spacing, typografie, kleuren, modals, knoppen)
- Metrics endpoints aanwezig; verdere server-berekeningen komen in latere sprints
- Documentatie wordt iteratief bijgewerkt (status dashboard en technische archi)

Zie ook: `PROJECT-STATUS-DASHBOARD.md` en `02-SPRINTS/`.

