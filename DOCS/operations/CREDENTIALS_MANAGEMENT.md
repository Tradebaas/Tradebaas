# Credentials Management

## Overzicht

Credentials worden **server-side** opgeslagen in de backend `.env` file, niet client-side. Dit zorgt voor:

- ✅ **Veiligheid**: Credentials blijven op de server
- ✅ **Persistentie**: Credentials overleven browser cache clears
- ✅ **Herbruikbaarheid**: Backend kan credentials gebruiken voor 24/7 trading
- ✅ **Geen exposure**: API keys worden nooit in browser localStorage opgeslagen

## Architectuur

```
┌─────────────────┐
│   Browser UI    │
│  (SettingsDialog)│
└────────┬────────┘
         │ 1. Gebruiker vult credentials in
         │ 2. POST /api/credentials
         ▼
┌─────────────────┐
│  Backend API    │
│  (Fastify)      │
└────────┬────────┘
         │ 3. Schrijf naar .env
         ▼
┌─────────────────┐
│ .env bestand    │
│ DERIBIT_API_KEY │
│ DERIBIT_API_SECRET │
└─────────────────┘
```

## API Endpoints

### GET /api/credentials/:broker

Haal opgeslagen credentials op voor een broker.

**Request:**
```bash
GET /api/credentials/deribit
```

**Response (success):**
```json
{
  "success": true,
  "credentials": {
    "apiKey": "xxx",
    "apiSecret": "yyy"
  }
}
```

**Response (geen credentials):**
```json
{
  "success": false,
  "message": "Geen credentials gevonden",
  "credentials": null
}
```

### POST /api/credentials

Sla nieuwe credentials op in backend `.env`.

**Request:**
```bash
POST /api/credentials
Content-Type: application/json

{
  "broker": "deribit",
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Credentials opgeslagen"
}
```

**Response (error):**
```json
{
  "success": false,
  "message": "API key en secret zijn verplicht"
}
```

## Frontend Flow

### 1. Laden van credentials (bij open SettingsDialog)

```typescript
// src/state/store.ts - loadSavedCredentials()

// 1. Probeer eerst backend
const response = await fetch('/api/credentials/deribit');
const data = await response.json();

if (data.success) {
  // Credentials gevonden in backend .env
  set({ credentials: data.credentials });
}

// 2. Fallback naar local storage (legacy)
const apiKey = await loadEncrypted('deribit_api_key');
const apiSecret = await loadEncrypted('deribit_api_secret');
```

### 2. Opslaan van credentials (bij connect)

```typescript
// src/state/store.ts - connect()

// 1. Sla lokaal op (fallback)
await saveEncrypted('deribit_api_key', credentials.apiKey);
await saveEncrypted('deribit_api_secret', credentials.apiSecret);

// 2. Stuur naar backend .env (primary)
fetch('/api/credentials', {
  method: 'POST',
  body: JSON.stringify({
    broker: 'deribit',
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
  }),
});
```

### 3. UI Indicator

In `SettingsDialog.tsx` wordt een badge getoond als credentials uit backend komen:

```tsx
{credentialsSource === 'backend' && (
  <Alert className="bg-accent/10">
    <CheckCircle /> Credentials geladen uit backend .env
  </Alert>
)}
```

## Backend Implementatie

### .env Structuur

Credentials worden gegroepeerd per broker met comments:

```properties
# Deribit API Credentials
DERIBIT_API_KEY=your_api_key_here
DERIBIT_API_SECRET=your_api_secret_here

# Binance API Credentials
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
```

### Save Logic

```typescript
// backend/src/server.ts

// 1. Lees huidige .env
const envContent = await fs.readFile('.env', 'utf-8');

// 2. Parse in Map
const envVars = new Map();
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  envVars.set(key, value);
});

// 3. Update credentials
envVars.set('DERIBIT_API_KEY', apiKey);
envVars.set('DERIBIT_API_SECRET', apiSecret);

// 4. Rebuild met sections
let newContent = '# Deribit API Credentials\n';
newContent += `DERIBIT_API_KEY=${apiKey}\n`;
newContent += `DERIBIT_API_SECRET=${apiSecret}\n\n`;

// 5. Schrijf terug
await fs.writeFile('.env', newContent);

// 6. Update runtime (process.env)
process.env.DERIBIT_API_KEY = apiKey;
process.env.DERIBIT_API_SECRET = apiSecret;
```

## Beveiliging

### ✅ Best Practices

- Credentials worden **nooit** in browser localStorage opgeslagen (alleen fallback)
- `.env` file heeft restrictive permissions: `chmod 600 /root/tradebaas/backend/.env`
- API endpoints zijn alleen toegankelijk via localhost reverse proxy
- Backend draait als systemd service met beperkte privileges

### ⚠️ Waarschuwing

- `.env` bevat plaintext credentials (versleutel voor productie!)
- Gebruik omgevingsvariabelen in productie: `export DERIBIT_API_KEY=xxx`
- Overweeg Vault/Secrets Manager voor enterprise deployments

## Testing

```bash
# 1. Test GET credentials
curl http://127.0.0.1:3000/api/credentials/deribit

# 2. Test POST credentials
curl -X POST http://127.0.0.1:3000/api/credentials \
  -H "Content-Type: application/json" \
  -d '{"broker":"deribit","apiKey":"test","apiSecret":"secret"}'

# 3. Verifieer .env
cat /root/tradebaas/backend/.env | grep DERIBIT

# 4. Test via UI
# - Open app.tradebazen.nl
# - Ga naar Instellingen > Broker tab
# - Vul credentials in en klik Verbinden
# - Herlaad pagina: credentials moeten automatisch geladen worden
# - Check console voor: "Loaded credentials from backend"
```

## Troubleshooting

### Credentials worden niet opgeslagen

**Probleem**: POST /api/credentials returnt error

**Oplossing**:
```bash
# Check backend logs
sudo journalctl -u tradebaas-backend -n 50

# Check file permissions
ls -la /root/tradebaas/backend/.env

# Geef write permissions
chmod 644 /root/tradebaas/backend/.env
```

### Credentials worden niet geladen

**Probleem**: GET /api/credentials returnt "Geen credentials gevonden"

**Oplossing**:
```bash
# Check .env content
cat /root/tradebaas/backend/.env

# Restart backend to reload .env
sudo systemctl restart tradebaas-backend
```

### CORS errors in browser

**Probleem**: Fetch fails with CORS error

**Oplossing**:
```bash
# Check Caddy reverse proxy
sudo systemctl status caddy

# Verify proxy config
cat /etc/caddy/Caddyfile | grep -A 5 "api/"

# Reload Caddy
sudo systemctl reload caddy
```

## Roadmap

- [ ] Encryptie van .env file at rest
- [ ] Multi-user support (per-user credentials)
- [ ] Credentials rotatie/expiry
- [ ] Audit log voor credential changes
- [ ] Integration met secrets managers (Vault, AWS Secrets Manager)
