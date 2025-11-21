# Nginx & Subdomain Setup voor Tradebaas

Dit document beschrijft hoe je Nginx configureert als reverse proxy voor Tradebaas, inclusief subdomain setup en SSL certificates.

## Overzicht

- **Backend API:** `api.tradebazen.nl` → `localhost:3000`
- **Frontend Dashboard:** `app.tradebazen.nl` → `localhost:5000`
- **SSL:** Let's Encrypt certificates
- **HTTP → HTTPS redirect:** Automatisch

## Prerequisites

1. VPS met Ubuntu/Debian
2. Domeinnaam geregistreerd (tradebazen.nl)
3. DNS A-records ingesteld (zie hieronder)
4. Nginx geïnstalleerd
5. Certbot geïnstalleerd (voor Let's Encrypt)

## Stap 1: DNS A-Records Instellen

In je domain registrar (bijvoorbeeld Cloudflare, GoDaddy, etc.):

```
Type: A
Name: api
Value: YOUR_SERVER_IP
TTL: Auto

Type: A
Name: app
Value: YOUR_SERVER_IP
TTL: Auto
```

Wacht 5-60 minuten voor DNS propagation. Test met:

```bash
dig api.tradebazen.nl
dig app.tradebazen.nl
```

## Stap 2: Nginx Installeren

Als Nginx nog niet is geïnstalleerd:

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Stap 3: Backend API Config

Maak bestand: `/etc/nginx/sites-available/api.tradebazen.nl`

```nginx
server {
    listen 80;
    server_name api.tradebazen.nl;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect to HTTPS (na SSL setup)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.tradebazen.nl;
    
    # SSL Certificates (certbot will add these)
    # ssl_certificate /etc/letsencrypt/live/api.tradebazen.nl/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.tradebazen.nl/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Reverse proxy to backend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # WebSocket support (port 3001)
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Logging
    access_log /var/log/nginx/api.tradebazen.access.log;
    error_log /var/log/nginx/api.tradebazen.error.log;
}
```

## Stap 4: Frontend Dashboard Config

Maak bestand: `/etc/nginx/sites-available/app.tradebazen.nl`

```nginx
server {
    listen 80;
    server_name app.tradebazen.nl;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect to HTTPS (na SSL setup)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name app.tradebazen.nl;
    
    # SSL Certificates (certbot will add these)
    # ssl_certificate /etc/letsencrypt/live/app.tradebazen.nl/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/app.tradebazen.nl/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Reverse proxy to frontend
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Logging
    access_log /var/log/nginx/app.tradebazen.access.log;
    error_log /var/log/nginx/app.tradebazen.error.log;
}
```

## Stap 5: Enable Sites

```bash
# Create symlinks
sudo ln -s /etc/nginx/sites-available/api.tradebazen.nl /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/app.tradebazen.nl /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Stap 6: SSL Certificates (Let's Encrypt)

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
```

Obtain certificates:

```bash
# Voor API
sudo certbot --nginx -d api.tradebazen.nl

# Voor Frontend
sudo certbot --nginx -d app.tradebazen.nl
```

Certbot zal automatisch:
1. SSL certificaten genereren
2. Nginx config updaten met SSL paths
3. HTTP → HTTPS redirect toevoegen
4. Auto-renewal cron job instellen

Test auto-renewal:

```bash
sudo certbot renew --dry-run
```

## Stap 7: Firewall (UFW)

Allow HTTP/HTTPS traffic:

```bash
sudo ufw allow 'Nginx Full'
sudo ufw status
```

Je zou moeten zien:
```
To                         Action      From
--                         ------      ----
Nginx Full                 ALLOW       Anywhere
```

## Stap 8: Verificatie

Test je endpoints:

```bash
# Backend API
curl https://api.tradebazen.nl/health

# Frontend (in browser)
https://app.tradebazen.nl
```

Check SSL:

```bash
curl -I https://api.tradebazen.nl
curl -I https://app.tradebazen.nl
```

## Troubleshooting

### Nginx Test Fails

```bash
sudo nginx -t
# Check error messages
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

### Backend Not Accessible

1. Check backend is running:
   ```bash
   pm2 list
   curl http://127.0.0.1:3000/health
   ```

2. Check Nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/api.tradebazen.error.log
   ```

### Frontend Not Accessible

1. Check frontend is running:
   ```bash
   pm2 list
   curl http://127.0.0.1:5000
   ```

2. Check Nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/app.tradebazen.error.log
   ```

## Monitoring

Check Nginx status:

```bash
sudo systemctl status nginx
```

View access logs:

```bash
# API
sudo tail -f /var/log/nginx/api.tradebazen.access.log

# Frontend
sudo tail -f /var/log/nginx/app.tradebazen.access.log
```

## Auto-Renewal Setup

Certbot sets up a cron job or systemd timer automatically. Verify:

```bash
sudo systemctl list-timers | grep certbot
```

Or check cron:

```bash
sudo crontab -l
```

## Security Best Practices

1. **Rate Limiting** (optioneel):
   ```nginx
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
   
   server {
       location /api/ {
           limit_req zone=api_limit burst=20 nodelay;
       }
   }
   ```

2. **CORS Headers** (backend handles dit al via Fastify)

3. **Firewall Rules:**
   ```bash
   # Only allow necessary ports
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   ```

## Alternatief: Caddy

Als je Caddy prefereert (automatic HTTPS):

```caddyfile
api.tradebazen.nl {
    reverse_proxy localhost:3000
}

app.tradebazen.nl {
    reverse_proxy localhost:5000
}
```

Caddy handelt SSL automatisch af, geen certbot nodig!

## Volgende Stappen

- [ ] DNS A-records instellen
- [ ] Nginx config files aanmaken
- [ ] Sites enablen
- [ ] SSL certificates verkrijgen
- [ ] Firewall configureren
- [ ] Verificatie testen
- [ ] Monitoring instellen

Na deze setup zijn je services 24/7 toegankelijk via HTTPS! 🚀
