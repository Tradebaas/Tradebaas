# Development Server Scripts

Deze scripts helpen je om consistent te werken met vaste poorten voor development.

## 🚀 Server Scripts

### Start Development Servers
```bash
# Optie 1: Gebruik het script (aanbevolen)
./dev-server.sh

# Optie 2: Via npm script
npm run dev:clean

# Optie 3: Force restart als er problemen zijn
npm run dev:force
```

### Stop All Servers
```bash
./stop-servers.sh
```

## 📋 Vaste Poorten

- **Frontend (Next.js)**: http://localhost:3000
- **Backend/API**: http://localhost:8000 (beschikbaar voor toekomstige gebruik)
- **Storybook**: http://localhost:6006

## 🔧 Script Functionaliteit

### `dev-server.sh`
- Stopt alle bestaande Next.js processen
- Maakt poorten 3000 en 8000 vrij
- Start Next.js geforceerd op poort 3000
- Toont logs locatie voor debugging

### `stop-servers.sh`
- Stopt alle development servers
- Maakt alle development poorten vrij
- Geeft feedback over gestopte processen

## 📝 Logs Bekijken

```bash
# Next.js development logs
tail -f /tmp/next-dev.log

# Live log monitoring
tail -f /tmp/next-dev.log | grep -E "(error|warn|ready)"
```

## 🐛 Troubleshooting

Als servers niet starten:
1. Run `./stop-servers.sh`
2. Wacht 2 seconden
3. Run `./dev-server.sh`

Als poorten geblokkeerd zijn:
```bash
# Check welke processen draaien op poorten
lsof -i :3000
lsof -i :8000

# Forceer kill van specifieke poort
lsof -t -i:3000 | xargs kill -9
```

## 🔐 Deribit API Configuratie

Zet je secrets in `03-DEVELOPMENT/frontend/.env.local` (niet committen):

```
DERIBIT_CLIENT_ID=... 
DERIBIT_CLIENT_SECRET=...
# Optioneel: 'prod' (default) of 'test'
DERIBIT_ENV=prod
```

Vereist voor de API route: `/api/deribit/balance?currency=USDC`.

Rotatie/secret management:
- Je kunt ook `DERIBIT_CLIENT_ID_FILE` en `DERIBIT_CLIENT_SECRET_FILE` gebruiken; de inhoud wordt runtime uit het bestand gelezen (handig met Docker/K8s secrets).
- Je kunt env-specifieke variabelen gebruiken: `DERIBIT_CLIENT_ID_TEST` / `DERIBIT_CLIENT_SECRET_TEST` en `DERIBIT_CLIENT_ID_PROD` / `DERIBIT_CLIENT_SECRET_PROD`. De client kiest automatisch op basis van `DERIBIT_ENV`.
- De token-cache refresh’t automatisch; bij een “invalid_client/token” fout wordt eenmalig herauthenticatie geprobeerd.


## 🔐 Environment variables (Deribit)

Voor live Deribit balans weergave moet je een `.env.local` aanmaken in `03-DEVELOPMENT/frontend` op basis van `.env.example`:

```bash
cp .env.example .env.local
```

Vul daarin:

- `DERIBIT_ENV=mainnet` of `testnet`
- `DERIBIT_CLIENT_ID=...`
- `DERIBIT_CLIENT_SECRET=...`

De API-route `/api/deribit/balance` gebruikt deze waardes server-side. Secrets worden niet naar de browser gestuurd.
