# Tradebaas Deployment Guide

## Prerequisites

- Docker 24.0+ and Docker Compose 2.0+
- Node.js 20+ (for local development)
- 2GB RAM minimum, 4GB recommended
- 10GB disk space

## Quick Start

### 1. Environment Setup

```bash
# Copy the environment template
cp .env.template .env

# Edit .env and configure your settings
nano .env
```

**Important:** Change these values in `.env`:
- `POSTGRES_PASSWORD` - Strong database password
- `REDIS_PASSWORD` - Strong Redis password
- `JWT_SECRET` - 64-character hex string (see generation below)
- `ENCRYPTION_KEY` - Exactly 32 characters (see generation below)

**Generate secure secrets:**

```bash
# Generate JWT secret (64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate encryption key (32 chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 2. Start Services

```bash
# Start all services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f app

# Check service health
docker-compose ps
```

### 3. Verify Deployment

```bash
# Check application health
curl http://localhost:3000/health

# Check database connection
docker-compose exec postgres pg_isready -U tradebaas

# Check Redis connection
docker-compose exec redis redis-cli -a YOUR_REDIS_PASSWORD ping
```

### 4. Access Application

- **Main App:** http://localhost:3000
- **Database Admin (Adminer):** http://localhost:8080 (optional, see tools below)
- **Redis Commander:** http://localhost:8081 (optional)

## Service Management

### Start/Stop Services

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (⚠️ deletes data)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
docker-compose logs -f redis

# Last 100 lines
docker-compose logs --tail=100 app
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart app
```

## Optional Admin Tools

Start database and Redis management tools:

```bash
# Start with admin tools
docker-compose --profile tools up -d

# Stop tools only
docker-compose --profile tools stop adminer redis-commander
```

- **Adminer** (PostgreSQL UI): http://localhost:8080
  - System: `PostgreSQL`
  - Server: `postgres`
  - Username: `tradebaas` (from .env)
  - Password: Your `POSTGRES_PASSWORD`
  - Database: `tradebaas`

- **Redis Commander**: http://localhost:8081
  - Automatically connected to Redis

## Running Tests

### Unit Tests

```bash
# Frontend tests
npm test

# Backend tests
cd backend
npm test

# With coverage
npm run test:coverage
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Backend integration tests
cd backend
npm run test:integration
```

### All Tests

```bash
# Run all tests before deployment
npm run test:all
```

## Database Management

### Backup Database

```bash
# Create backup
docker-compose exec -T postgres pg_dump -U tradebaas tradebaas > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
docker-compose exec -T postgres pg_dump -U tradebaas tradebaas | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore Database

```bash
# Restore from backup
cat backup_20240101_120000.sql | docker-compose exec -T postgres psql -U tradebaas tradebaas

# Restore from compressed backup
gunzip -c backup_20240101_120000.sql.gz | docker-compose exec -T postgres psql -U tradebaas tradebaas
```

### Access Database Shell

```bash
# PostgreSQL shell
docker-compose exec postgres psql -U tradebaas tradebaas

# Redis shell
docker-compose exec redis redis-cli -a YOUR_REDIS_PASSWORD
```

## Monitoring

### Health Checks

All services include health checks:

```bash
# Check service health status
docker-compose ps

# Manual health check
curl http://localhost:3000/health
```

Health check endpoints:
- App: `GET /health` - Returns 200 if healthy
- Database: Automatic with `pg_isready`
- Redis: Automatic with `redis-cli ping`

### Resource Usage

```bash
# View resource usage
docker stats

# Service-specific stats
docker stats tradebaas-app tradebaas-postgres tradebaas-redis
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs for errors
docker-compose logs app

# Check service status
docker-compose ps

# Rebuild and restart
docker-compose up -d --build
```

### Database Connection Issues

```bash
# Check database is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U tradebaas

# Check environment variables
docker-compose exec app env | grep POSTGRES
```

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli -a YOUR_REDIS_PASSWORD ping

# Check environment variables
docker-compose exec app env | grep REDIS
```

### Reset Everything

```bash
# Stop and remove all containers, volumes, and networks
docker-compose down -v

# Remove images
docker-compose down -v --rmi all

# Start fresh
docker-compose up -d --build
```

### View Container Processes

```bash
# List running processes in app container
docker-compose exec app ps aux

# Check app logs in real-time
docker-compose logs -f --tail=50 app
```

## Production Deployment

### Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Generate secure `JWT_SECRET` (64 chars)
- [ ] Generate secure `ENCRYPTION_KEY` (32 chars)
- [ ] Set `NODE_ENV=production`
- [ ] Use `DERIBIT_ENVIRONMENT=live` for production trading
- [ ] Enable firewall rules (only expose necessary ports)
- [ ] Set up SSL/TLS with reverse proxy (nginx/traefik)
- [ ] Configure backup automation
- [ ] Set up monitoring and alerting
- [ ] Review and restrict Docker volumes permissions

### Recommended Architecture

```
Internet
    │
    ▼
[Load Balancer / SSL Termination]
    │
    ▼
[Reverse Proxy - nginx/traefik]
    │
    ▼
[Docker Compose Stack]
    ├── App Container (port 3000)
    ├── PostgreSQL (internal network)
    └── Redis (internal network)
```

### Scaling Considerations

For high load:
1. Use external PostgreSQL (RDS/managed service)
2. Use external Redis (ElastiCache/managed service)
3. Run multiple app instances behind load balancer
4. Use Docker Swarm or Kubernetes for orchestration

## Environment Variables Reference

See `.env.template` for full configuration options.

### Critical Variables

- `POSTGRES_PASSWORD` - Database password
- `REDIS_PASSWORD` - Redis password
- `JWT_SECRET` - JWT signing key
- `ENCRYPTION_KEY` - Credential encryption key (must be 32 chars)
- `DERIBIT_ENVIRONMENT` - `testnet` or `live`

### Optional Variables

- `APP_PORT` - Application port (default: 3000)
- `POSTGRES_PORT` - Database port (default: 5432)
- `REDIS_PORT` - Redis port (default: 6379)
- `LOG_LEVEL` - Logging level (default: info)

## Support

For issues and questions:
- Check logs: `docker-compose logs -f app`
- Review health: `docker-compose ps`
- Database admin: http://localhost:8080 (with tools profile)

## License

See LICENSE file for details.
