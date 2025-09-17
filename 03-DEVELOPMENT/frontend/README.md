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

### Richtlijnen
- Commit nooit echte Deribit secrets
- Houd spacing en typografie consistent volgens de UI-conventies
- Gebruik de Storybook-setup om UI-variaties snel te testen
