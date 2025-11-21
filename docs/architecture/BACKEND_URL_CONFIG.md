# Backend URL Configuration - Robuust & Schaalbaar

## Architectuur Overzicht

### Productie (via Caddy Reverse Proxy)
```
┌─────────────────────────────────────────────────────────┐
│  Browser: https://app.tradebazen.nl                     │
│  ├─ Frontend (React): https://app.tradebazen.nl/        │
│  └─ Backend API:     https://app.tradebazen.nl/api/*   │
└─────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Caddy (poort 443 HTTPS)                                │
│  ├─ / → localhost:5000 (frontend static files)          │
│  └─ /api/* → localhost:3000 (backend API proxy)         │
└─────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Services (localhost)                                    │
│  ├─ Frontend: serve -s dist -l 5000                     │
│  └─ Backend:  tsx src/server.ts (poort 3000)            │
└─────────────────────────────────────────────────────────┘
```

### Development (direct access)
```
┌─────────────────────────────────────────────────────────┐
│  Browser: http://localhost:5173                         │
│  ├─ Frontend (Vite): http://localhost:5173/             │
│  └─ Backend API:     http://localhost:3000/api/*        │
└─────────────────────────────────────────────────────────┘
```

## Centrale Backend URL Helper

**Bestand**: `src/lib/backend-url.ts`

```typescript
export const getBackendUrl = (): string => {
  // 1. Environment variable (hoogste prioriteit)
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // 2. Productie: gebruik same origin (Caddy proxies /api/*)
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || 
                     hostname === '127.0.0.1' || 
                     hostname.startsWith('192.168.');
  
  if (!isLocalhost) {
    return window.location.origin; // https://app.tradebazen.nl
  }
  
  // 3. Development: gebruik localhost:3000
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:3000`;
};
```

## Voordelen van deze Aanpak

### ✅ Robuustheid
- **Geen mixed content errors**: Same origin in productie (HTTPS → HTTPS)
- **Automatische protocol detectie**: http/https wordt automatisch gekozen
- **Graceful fallback**: env var → productie → development

### ✅ Schaalbaarheid
- **Eén centrale configuratie**: Alle API clients gebruiken `getBackendUrl()`
- **Environment-specific**: Verschillende URLs voor dev/staging/prod via `.env`
- **Geen hardcoded URLs**: Alles dynamisch geconfigureerd

### ✅ Security
- **SSL terminatie op Caddy**: Backend hoeft geen SSL certificaten te beheren
- **Rate limiting op proxy niveau**: Caddy kan rate limiting toevoegen
- **Geen CORS issues**: Same origin requests

### ✅ Performance
- **HTTP/2 support**: Via Caddy
- **Gzip/Brotli compression**: Caddy handled dit
- **Connection pooling**: Caddy → Backend persistent connections

## Gebruik in Code

### ✅ Correct (gebruikt centrale helper)

```typescript
import { getBackendUrl } from '@/lib/backend-url';

const BACKEND_URL = getBackendUrl();

fetch(`${BACKEND_URL}/api/strategy/status`)
```

### ❌ Fout (hardcoded URL)

```typescript
// NIET DOEN!
const backendUrl = `http://${window.location.hostname}:3000`;
const backendUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
```

## Deployment Checklist

### Productie Setup

1. **Caddy configuratie** (`/etc/caddy/Caddyfile`):
```
app.tradebazen.nl {
    encode gzip zstd

    # Backend API proxy
    handle /api/* {
        reverse_proxy http://127.0.0.1:3000
    }

    # Frontend static files  
    handle {
        reverse_proxy http://127.0.0.1:5000
    }
}
```

2. **Backend starten** (PM2):
```bash
pm2 start ecosystem.config.cjs --only tradebaas-backend
```

3. **Frontend builden & starten**:
```bash
npm run build
pm2 start ecosystem.config.cjs --only tradebaas-frontend
```

4. **Opslaan voor auto-start**:
```bash
pm2 save
pm2 startup
```

### Development Setup

1. **Backend starten**:
```bash
cd backend
npm start
```

2. **Frontend starten**:
```bash
npm run dev
```

3. **Open browser**: http://localhost:5173

## Environment Variables

### `.env.production`
```bash
# Leeg laten - gebruikt automatisch same origin via Caddy
VITE_BACKEND_URL=
```

### `.env.development`  
```bash
# Optioneel - anders automatic detection
VITE_BACKEND_URL=http://localhost:3000
```

### `.env.staging`
```bash
# Voor staging environment
VITE_BACKEND_URL=https://staging.tradebazen.nl
```

## Troubleshooting

### Mixed Content Errors
**Symptoom**: Console errors over "insecure resource"  
**Oplossing**: Check dat `getBackendUrl()` correct `window.location.origin` returned in productie

### CORS Errors
**Symptoom**: "Access-Control-Allow-Origin" errors  
**Oplossing**: Backend moet CORS headers sturen voor development, productie gebruikt same origin

### 404 Not Found
**Symptoom**: `/api/*` calls retourneren 404  
**Oplossing**: Check Caddy configuratie en herlaad: `sudo systemctl reload caddy`

### Connection Refused
**Symptoom**: "Failed to fetch" errors  
**Oplossing**: Check dat backend draait: `pm2 list` en `curl http://localhost:3000/health`

## Best Practices

1. **✅ Gebruik altijd `getBackendUrl()`** voor alle API calls
2. **✅ Test in zowel development als production** mode
3. **✅ Check browser console** voor mixed content warnings
4. **✅ Gebruik environment variables** voor specifieke overrides
5. **✅ Document API endpoints** met volledige paden (`/api/strategy/status`)

## Migratie van Oude Code

### Zoek oude patterns:
```bash
grep -r "window.location.hostname.*:3000" src/
grep -r "http://.*:3000" src/
```

### Vervang met:
```typescript
import { getBackendUrl } from '@/lib/backend-url';
const backendUrl = getBackendUrl();
```

---

**Laatste update**: November 21, 2025  
**Versie**: 2.0 (Robuust & Schaalbaar)  
**Status**: ✅ Production Ready
