## Tradebaas — Frontend

Next.js App Router frontend met server-side API routes voor Deribit. Dit is de enige service in deze fase (geen aparte backend).

### Systeemvereisten
- Node.js 20+
- npm 10+

### Installatie
```bash
npm install
```

### Ontwikkelen
```bash
# Start dev server (Turbopack, poort 3000)
npm run dev

# Schoon opstarten (killt poorten en processen; start Next.js)
npm run dev:clean

# Linting & Types
npm run lint
npm run lint:fix
npm run type-check

# Storybook (UI-workbench)
npm run storybook
```

Open vervolgens http://localhost:3000.

### Environment (.env.local)
Voorbeeld variabelen:

```
NEXT_PUBLIC_APP_NAME="Tradebaas"
NEXT_PUBLIC_APP_VERSION="1.0.0"

# Optioneel voor toekomstige backend
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_WS_URL="ws://localhost:8000"

# Deribit (server-side only; geef nooit echte waarden door in git)
DERIBIT_CLIENT_ID="..."
DERIBIT_CLIENT_SECRET="..."
DERIBIT_ENV="prod" # of 'test' voor testnet
```

Let op: Deribit secrets worden uitsluitend op de server-side gebruikt door API routes en mogen niet naar de client lekken.

### Architectuur highlights
- Next.js App Router + TypeScript + Tailwind CSS
- API routes voor:
	- Deribit balance, debug
	- Emergency close (globaal en per instrument)
	- Strategy: bots mapping, mode (Live/Demo)
	- Metrics: today en period
- UI componenten: Cards, Modals, Typography, TradingCard
- Consistente spacing via `.text-stack` utility (zie `src/app/globals.css`)
- Typografie normal-case, font-normal (geen bold/caps) behalve STOP-knoppen

### Handige bestanden
- `src/app/dashboard/page.tsx` — Dashboard met metrics en modals
- `src/components/ui/TradingCard.tsx` — Botkaart met acties en details
- `src/app/api/**` — Implementatie van server-side routes
- `src/lib/deribit.ts` — Eenvoudige Deribit JSON-RPC client met OAuth caching

### Docker (optioneel)
Je kunt ook via de root `docker-compose.dev.yml` ontwikkelen:

```bash
docker compose -f ../../docker-compose.dev.yml up --build
```

### Runbook (Prod/Test) 🚀

Kiezen van omgeving:
- Stel `DERIBIT_ENV` in op `prod` of `test`.

Waar zet je env-variabelen?
- Lokale ontwikkeling (Next.js): `03-DEVELOPMENT/frontend/.env.local`
	- Bevat o.a. `DERIBIT_CLIENT_ID`, `DERIBIT_CLIENT_SECRET`, `DERIBIT_ENV`
- Docker/Prod (Compose): root `/.env` (buiten de frontend map)
	- Wordt automatisch ingelezen door `docker-compose.prod.yml`
	- Gebruik: `DERIBIT_CLIENT_ID`, `DERIBIT_CLIENT_SECRET`, en optioneel `DERIBIT_CLIENT_ID_PROD/TEST`, `DERIBIT_CLIENT_SECRET_PROD/TEST`

Start/Stop/Check (Prod):
```bash
# Start of herstart prod container
docker compose -f ../../docker-compose.prod.yml up -d --build

# Health check
curl -sS http://localhost:3000/api/health | jq .

# Basis API checks
curl -sS "http://localhost:3000/api/deribit/balance?currency=USDC" | jq .
curl -sS "http://localhost:3000/api/metrics/today?currency=USDC" | jq .

# Stop
docker compose -f ../../docker-compose.prod.yml down
```

Beveiliging & hygiene:
- Commit nooit echte secrets. Root `/.env` en `*.local` bestanden staan in `.gitignore`.
- Gebruik eventueel `*_FILE` varianten (Docker/K8s secrets) en breid de server logic uit indien gewenst.

### Richtlijnen
- Commit nooit echte Deribit secrets
- Houd spacing en typografie consistent volgens de UI-conventies
- Gebruik de Storybook-setup om UI-variaties snel te testen
