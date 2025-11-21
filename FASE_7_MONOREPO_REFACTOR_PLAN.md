# FASE 7: MONOREPO REFACTOR - Production-Ready Architecture

**Date:** 21 November 2025  
**Status:** 🚧 IN PROGRESS  
**Goal:** Transform hybrid mess into industry-standard monorepo

---

## Current Problems

### Root Package.json Issues
```json
{
  "name": "tradebaas-backend",  // ❌ Misleading name
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5000",  // Frontend
    "build": "tsc",                            // Backend TypeScript
    "start": "node dist/index.js"              // Backend start
  }
}
```

**Problems:**
- Mixed frontend (Vite/React) + backend (TypeScript) dependencies
- Confusing build/start commands
- Large unnecessary node_modules
- No clear separation of concerns

---

## Target Architecture

```
/root/Tradebaas-1/
├── package.json                    # Workspace root (npm workspaces)
├── .gitignore                      # Unified gitignore
├── README.md
├── MASTER.md
├── apps/
│   ├── frontend/                   # React + Vite app
│   │   ├── package.json           # Frontend-only deps
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.js
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   └── App.tsx
│   │   ├── dist/                  # Production build
│   │   └── .env.production
│   │
│   └── backend/                    # Fastify + TypeScript API
│       ├── package.json           # Backend-only deps
│       ├── tsconfig.json
│       ├── src/
│       │   ├── server.ts
│       │   ├── services/
│       │   ├── strategies/
│       │   └── migrations/
│       ├── dist/
│       └── logs/
│
├── packages/                       # Shared code (optional future)
│   └── shared-types/              # Shared TypeScript types
│       ├── package.json
│       └── src/
│           └── index.ts
│
├── config/
│   ├── ecosystem.config.cjs       # PM2 configuration
│   └── nginx/
│       └── app.tradebazen.nl      # Nginx config
│
├── scripts/
│   ├── backup-databases.sh
│   ├── health-check.sh
│   └── deploy.sh
│
├── state/                          # Runtime data
│   └── trades.db
│
└── .env.production                 # Root environment (shared secrets)
```

---

## Implementation Steps

### Step 1: Backup Current State ✅

```bash
# Create backup
cd /root
tar -czf Tradebaas-1-backup-$(date +%Y%m%d_%H%M%S).tar.gz Tradebaas-1/

# Commit current state to Git
cd /root/Tradebaas-1
git add -A
git commit -m "backup: Pre-monorepo refactor state"
git push origin main
```

### Step 2: Create New Monorepo Structure

```bash
cd /root/Tradebaas-1

# Create apps directory
mkdir -p apps/frontend
mkdir -p apps/backend

# Create packages directory (for future shared code)
mkdir -p packages/shared-types/src
```

### Step 3: Move Frontend Code to apps/frontend

```bash
# Move frontend source code
mv src/ apps/frontend/
mv index.html apps/frontend/
mv vite.config.ts apps/frontend/
mv tailwind.config.js apps/frontend/

# Move frontend config
mv .env apps/frontend/
mv .env.example apps/frontend/
cp .env.production apps/frontend/  # Copy (keep root version too)

# Create frontend-specific tsconfig
cat > apps/frontend/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    
    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    
    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# Create frontend package.json (clean, only frontend deps)
# Will create this manually with proper dependencies
```

### Step 4: Move Backend Code to apps/backend

```bash
# Backend already in /backend directory
mv backend/ apps/backend/
```

### Step 5: Create Root Workspace Package.json

```json
{
  "name": "tradebaas-monorepo",
  "version": "1.0.0",
  "private": true,
  "description": "Tradebaas Multi-User Trading Platform",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=apps/frontend",
    "dev:frontend": "npm run dev --workspace=apps/frontend",
    "dev:backend": "npm run dev --workspace=apps/backend",
    "dev:all": "concurrently \"npm run dev:frontend\" \"npm run dev:backend\"",
    
    "build": "npm run build --workspaces",
    "build:frontend": "npm run build --workspace=apps/frontend",
    "build:backend": "npm run build --workspace=apps/backend",
    
    "start:frontend": "npm run start --workspace=apps/frontend",
    "start:backend": "npm run start --workspace=apps/backend",
    
    "migrate": "npm run migrate --workspace=apps/backend",
    "migrate:rollback": "npm run migrate:rollback --workspace=apps/backend",
    
    "test": "npm run test --workspaces",
    "lint": "npm run lint --workspaces",
    "typecheck": "npm run typecheck --workspaces",
    
    "clean": "rm -rf apps/*/node_modules apps/*/dist packages/*/node_modules packages/*/dist node_modules"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### Step 6: Create apps/frontend/package.json

Extract ONLY frontend dependencies from current root package.json:

```json
{
  "name": "@tradebaas/frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5000",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^5.0.2",
    "@tanstack/react-query": "^5.62.7",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.460.0",
    "recharts": "^2.14.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "@radix-ui/react-tooltip": "^1.1.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^5.4.11",
    "typescript": "~5.6.2",
    "tailwindcss": "^3.4.15",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "@typescript-eslint/eslint-plugin": "^8.15.0",
    "@typescript-eslint/parser": "^8.15.0",
    "eslint": "^9.15.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14"
  }
}
```

### Step 7: Update Vite Config (apps/frontend/vite.config.ts)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});
```

### Step 8: Update Backend Package.json (apps/backend/package.json)

Already clean, just verify scripts:

```json
{
  "name": "@tradebaas/backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "migrate": "tsx src/migrations/run-migrations.ts migrate",
    "migrate:rollback": "tsx src/migrations/run-migrations.ts rollback",
    "migrate:version": "tsx src/migrations/run-migrations.ts version",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### Step 9: Update PM2 Ecosystem Config

```javascript
// config/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      script: '/root/Tradebaas-1/apps/backend/dist/server.js',
      cwd: '/root/Tradebaas-1/apps/backend',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        WS_PORT: 3001,
      },
      
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      
      error_file: '/root/Tradebaas-1/apps/backend/logs/error.log',
      out_file: '/root/Tradebaas-1/apps/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
```

### Step 10: Update Nginx Config

```nginx
# /etc/nginx/sites-available/app.tradebazen.nl

server {
    server_name app.tradebazen.nl;

    # Frontend (static files from Vite build)
    root /root/Tradebaas-1/apps/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Static asset caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/javascript application/javascript application/json;

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/app.tradebazen.nl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.tradebazen.nl/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    listen 80;
    server_name app.tradebazen.nl;
    return 301 https://$host$request_uri;
}
```

### Step 11: Install Dependencies

```bash
# Root workspace dependencies
cd /root/Tradebaas-1
npm install

# This will automatically install all workspace dependencies
# (apps/frontend, apps/backend, packages/*)
```

### Step 12: Build & Test

```bash
# Build backend
npm run build:backend

# Build frontend
npm run build:frontend

# Test backend
cd apps/backend && npm test

# Verify frontend build
ls -lh apps/frontend/dist/
```

### Step 13: Update PM2 & Nginx

```bash
# Stop current PM2 processes
pm2 delete all

# Reload PM2 with new config
pm2 start config/ecosystem.config.cjs

# Reload Nginx
sudo nginx -t
sudo systemctl reload nginx
```

### Step 14: Smoke Tests

```bash
# Backend health
curl https://app.tradebazen.nl/api/health

# Frontend loads
curl -I https://app.tradebazen.nl

# WebSocket connection
wscat -c wss://app.tradebazen.nl/ws/
```

---

## Benefits After Refactor

### Code Organization ✅
- Clear separation: `apps/frontend/` vs `apps/backend/`
- Shared code possible: `packages/shared-types/`
- Each workspace has own dependencies

### Build Performance ✅
- Parallel builds: `npm run build --workspaces`
- Smaller node_modules per workspace
- Faster CI/CD pipelines

### Developer Experience ✅
- Clear commands: `npm run dev:frontend`, `npm run dev:backend`
- Isolated testing per workspace
- Better IDE support (tsconfig per workspace)

### Deployment ✅
- Independent frontend/backend deploys
- Smaller Docker images (multi-stage builds)
- Better caching (layer per workspace)

### Scalability ✅
- Easy to add new apps (mobile, admin panel, etc.)
- Shared packages for common code
- Version management per workspace

---

## Rollback Plan

If anything breaks:

```bash
# Restore from backup
cd /root
tar -xzf Tradebaas-1-backup-YYYYMMDD_HHMMSS.tar.gz

# Or restore from Git
cd /root/Tradebaas-1
git reset --hard HEAD~1
git push origin main --force
```

---

## Timeline

- **Backup & Prep:** 10 minutes
- **Directory restructure:** 20 minutes
- **Package.json creation:** 30 minutes
- **Config updates:** 20 minutes
- **Dependency install:** 15 minutes
- **Build & test:** 15 minutes
- **Deploy & verify:** 10 minutes

**Total:** ~2 hours

---

## Success Criteria

- ✅ `npm run build` works (builds all workspaces)
- ✅ `npm run dev:frontend` starts Vite dev server
- ✅ `npm run dev:backend` starts backend with watch mode
- ✅ Production build creates `apps/frontend/dist/`
- ✅ Nginx serves frontend from new location
- ✅ Backend API accessible via Nginx proxy
- ✅ PM2 auto-restart configured
- ✅ All tests passing
- ✅ HTTPS working
- ✅ Zero downtime during migration

---

**Ready to start? Let's do this! 🚀**
